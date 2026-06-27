/**
 * Notification delivery reliability contract (Redis-free DB outbox):
 *   - dispatchNotification writes the row (source of truth); async channels rest
 *     at status='pending' for the outbox drainer — there is no queue/broker.
 *   - processEmail/processPush are idempotent per channel (no double-send on retry)
 *   - deliverNotification drives the lifecycle: pending → processing → sent |
 *     retrying | failed, with exponential backoff via nextRetryAt
 *   - a row that exhausts MAX_ATTEMPTS lands at status='failed' (the queryable
 *     dead-letter equivalent — never silently dropped)
 *
 * Pure unit tests — prisma, SendGrid and FCM are all mocked, so no live
 * Postgres / Redis is required.
 */

// ── Mocks (names must be `mock*` to satisfy jest.mock hoisting) ───────────────
const mockPrisma = {
  notification: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  device: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
};
const mockSendEmail = jest.fn();
const mockSendPush = jest.fn();

jest.mock('../../../../backend/src/db/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../../../backend/src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../backend/src/emails', () => ({ sendNotificationEmail: mockSendEmail }));
jest.mock('../../../../backend/src/config/firebase', () => ({
  sendPushNotification: mockSendPush,
  initializeFirebase: jest.fn(),
}));

import { dispatchNotification } from '../../../../backend/src/features/notifications/notification.dispatcher';
import { processEmail, processPush, deliverNotification, MAX_ATTEMPTS } from '../../../../backend/src/workers/index';

const job = (data: any) => ({ data });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.notification.update.mockResolvedValue({});
  mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });
  mockPrisma.device.update.mockResolvedValue({});
  mockPrisma.device.findFirst.mockResolvedValue(null);
});

// ── dispatchNotification (writes the outbox row, no enqueue) ──────────────────
describe('dispatchNotification', () => {
  it('app-only notification is written as sent', async () => {
    await dispatchNotification({ userId: 'u1', title: 't', message: 'm' });

    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.status).toBe('sent');
    expect(data.sentAt).toBeInstanceOf(Date);
    expect(JSON.parse(data.channels)).toEqual(['app']);
  });

  it('email channel is written pending with the email channel queued', async () => {
    await dispatchNotification({ userId: 'u1', title: 't', message: 'm', channels: ['app', 'email'] });

    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(data.sentAt).toBeNull();
    expect(JSON.parse(data.deliveryStatus).email).toBe('queued');
  });

  it('push channel is written pending with the push channel queued', async () => {
    await dispatchNotification({ userId: 'u1', title: 't', message: 'm', channels: ['push'] });

    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(JSON.parse(data.deliveryStatus).push).toBe('queued');
  });
});

// ── processEmail: idempotency + lifecycle ─────────────────────────────────────
describe('processEmail', () => {
  it('skips when the email channel was already sent (idempotent)', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{"email":"sent"}' });

    const result = await processEmail(job({ notificationId: 'n1', userId: 'u1', title: 't', message: 'm' }));

    expect(result).toMatchObject({ skipped: true, reason: 'already_sent' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends, then marks the channel sent', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com' });
    mockSendEmail.mockResolvedValue(true);

    await processEmail(job({ notificationId: 'n1', userId: 'u1', title: 't', message: 'm' }));

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com' }));
    const channelUpdate = mockPrisma.notification.update.mock.calls
      .map((c) => c[0].data)
      .find((d) => d.deliveryStatus && JSON.parse(d.deliveryStatus).email === 'sent');
    expect(channelUpdate).toBeTruthy();
  });

  it('marks failed (no retry) when the user has no email address', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });
    mockPrisma.user.findUnique.mockResolvedValue({ email: null });

    const result = await processEmail(job({ notificationId: 'n1', userId: 'u1', title: 't', message: 'm' }));

    expect(result).toMatchObject({ skipped: true, reason: 'no_email' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('throws (so the drainer records the attempt) when the provider send fails', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com' });
    mockSendEmail.mockResolvedValue(false);

    await expect(
      processEmail(job({ notificationId: 'n1', userId: 'u1', title: 't', message: 'm' })),
    ).rejects.toThrow();
  });
});

// ── processPush: idempotency + device validation ─────────────────────────────
describe('processPush', () => {
  const pushJob = job({
    notificationId: 'n1', userId: 'u1', deviceId: 'd1', fcmToken: 'tok', title: 't', message: 'm',
  });

  it('skips when the push channel was already sent (idempotent)', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{"push":"sent"}' });
    const result = await processPush(pushJob);
    expect(result).toMatchObject({ skipped: true, reason: 'already_sent' });
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('skips + marks failed when the device/token no longer matches', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });
    mockPrisma.device.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1', isActive: true, fcmToken: 'STALE' });

    const result = await processPush(pushJob);
    expect(result).toMatchObject({ skipped: true, reason: 'device_unavailable' });
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('sends and marks sent on a valid device', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });
    mockPrisma.device.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1', isActive: true, fcmToken: 'tok' });
    mockSendPush.mockResolvedValue('msg-id');

    const result = await processPush(pushJob);
    expect(mockSendPush).toHaveBeenCalled();
    expect(result).toMatchObject({ sent: true });
  });
});

// ── deliverNotification: outbox lifecycle (retry → failed terminal state) ─────
describe('deliverNotification (outbox lifecycle)', () => {
  // Stateful notification row so re-reads see what markChannel/update wrote.
  let state: any;

  const emailRow = (attempts: number) => ({
    id: 'n1', userId: 'u1', title: 't', message: 'm', category: null, deepLink: null,
    priority: null, channels: '["app","email"]', deliveryStatus: state.deliveryStatus, attempts,
  });

  beforeEach(() => {
    state = { deliveryStatus: '{"app":"sent","email":"queued"}', status: 'pending' };
    mockPrisma.notification.findUnique.mockImplementation(async () => ({ ...state }));
    mockPrisma.notification.update.mockImplementation(async ({ data }: any) => {
      if (data.deliveryStatus !== undefined) state.deliveryStatus = data.deliveryStatus;
      if (data.status !== undefined) state.status = data.status;
      if (data.nextRetryAt !== undefined) state.nextRetryAt = data.nextRetryAt;
      return { ...state };
    });
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com' });
  });

  it('delivers and lands the row at sent', async () => {
    mockSendEmail.mockResolvedValue(true);
    await deliverNotification(emailRow(0));
    expect(state.status).toBe('sent');
    expect(JSON.parse(state.deliveryStatus).email).toBe('sent');
  });

  it('marks retrying with a backoff when a send fails below MAX_ATTEMPTS', async () => {
    mockSendEmail.mockResolvedValue(false);
    await deliverNotification(emailRow(0));
    expect(state.status).toBe('retrying');
    expect(state.nextRetryAt).toBeInstanceOf(Date);
  });

  it('marks failed (dead-letter equivalent) once MAX_ATTEMPTS is exhausted', async () => {
    mockSendEmail.mockResolvedValue(false);
    await deliverNotification(emailRow(MAX_ATTEMPTS));
    expect(state.status).toBe('failed');
    expect(JSON.parse(state.deliveryStatus).email).toBe('failed');
  });

  it('reconciles a stuck row without re-sending when all channels are terminal', async () => {
    state.deliveryStatus = '{"app":"sent","email":"sent"}';
    await deliverNotification(emailRow(1));
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(state.status).toBe('sent');
  });
});
