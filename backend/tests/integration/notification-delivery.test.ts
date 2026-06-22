/**
 * Notification delivery reliability contract:
 *   - dispatchNotification writes the row (source of truth) then enqueues channels
 *   - workers are idempotent per channel (no double-send on retry)
 *   - lifecycle transitions: pending → processing → sent | retrying | failed
 *   - exhausted jobs are copied to the dead-letter queue (never silently dropped)
 *
 * Pure unit tests — prisma, queues, SendGrid and FCM are all mocked, so no live
 * Postgres / Dragonfly is required.
 */

// ── Mocks (names must be `mock*` to satisfy jest.mock hoisting) ───────────────
const mockPrisma = {
  notification: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  device: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
};
const mockEmailAdd = jest.fn();
const mockPushAdd = jest.fn();
const mockMoveToDLQ = jest.fn();
const mockSendEmail = jest.fn();
const mockSendPush = jest.fn();

jest.mock('../../src/db/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/emails', () => ({ sendNotificationEmail: mockSendEmail }));
jest.mock('../../src/config/firebase', () => ({
  sendPushNotification: mockSendPush,
  initializeFirebase: jest.fn(),
}));
jest.mock('../../src/config/queue', () => ({
  getEmailQueue: () => ({ add: mockEmailAdd }),
  getPushQueue: () => ({ add: mockPushAdd }),
  moveToDeadLetter: (...args: any[]) => mockMoveToDLQ(...args),
  STANDARD_JOB_OPTIONS: { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
  QUEUE_NAMES: { email: 'email-notifications', push: 'push-notifications' },
  bullConnection: {},
}));

import { dispatchNotification } from '../../src/features/notifications/notification.dispatcher';
import { processEmail, processPush, handleJobFailure, MAX_ATTEMPTS } from '../../src/workers/index';

const job = (data: any) => ({ id: '1', name: 'job', data, attemptsMade: 0 }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  // update/create/findFirst must return promises (workers call .catch on them).
  mockPrisma.notification.update.mockResolvedValue({});
  mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });
  mockPrisma.device.update.mockResolvedValue({});
  mockPrisma.device.findFirst.mockResolvedValue(null);
  // moveToDeadLetter is async in production — mirror that so `.catch` is valid.
  mockMoveToDLQ.mockResolvedValue(undefined);
});

// ── dispatchNotification ──────────────────────────────────────────────────────
describe('dispatchNotification', () => {
  it('app-only notification is written as sent with no queue hop', async () => {
    await dispatchNotification({ userId: 'u1', title: 't', message: 'm' });

    const data = mockPrisma.notification.create.mock.calls[0][0].data;
    expect(data.status).toBe('sent');
    expect(data.sentAt).toBeInstanceOf(Date);
    expect(JSON.parse(data.channels)).toEqual(['app']);
    expect(mockEmailAdd).not.toHaveBeenCalled();
    expect(mockPushAdd).not.toHaveBeenCalled();
  });

  it('email channel is written pending and enqueued with notificationId', async () => {
    await dispatchNotification({ userId: 'u1', title: 't', message: 'm', channels: ['app', 'email'] });

    expect(mockPrisma.notification.create.mock.calls[0][0].data.status).toBe('pending');
    expect(mockEmailAdd).toHaveBeenCalledTimes(1);
    const [jobName, payload] = mockEmailAdd.mock.calls[0];
    expect(jobName).toBe('send-notification-email');
    expect(payload).toMatchObject({ notificationId: 'n1', channel: 'email', userId: 'u1' });
  });

  it('push channel enqueues only when an active device with an FCM token exists', async () => {
    mockPrisma.device.findFirst.mockResolvedValue({ id: 'd1', fcmToken: 'tok' });
    await dispatchNotification({ userId: 'u1', title: 't', message: 'm', channels: ['push'] });

    expect(mockPushAdd).toHaveBeenCalledTimes(1);
    expect(mockPushAdd.mock.calls[0][1]).toMatchObject({ notificationId: 'n1', channel: 'push', fcmToken: 'tok' });
  });

  it('push channel does not enqueue when the user has no registered device', async () => {
    mockPrisma.device.findFirst.mockResolvedValue(null);
    await dispatchNotification({ userId: 'u1', title: 't', message: 'm', channels: ['push'] });
    expect(mockPushAdd).not.toHaveBeenCalled();
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

  it('sends, then marks the channel + notification sent', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com' });
    mockSendEmail.mockResolvedValue(true);

    await processEmail(job({ notificationId: 'n1', userId: 'u1', title: 't', message: 'm' }));

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com' }));
    const sentUpdate = mockPrisma.notification.update.mock.calls
      .map((c) => c[0].data)
      .find((d) => d.status === 'sent');
    expect(sentUpdate).toBeTruthy();
    expect(JSON.parse(sentUpdate.deliveryStatus).email).toBe('sent');
  });

  it('marks failed (no retry) when the user has no email address', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });
    mockPrisma.user.findUnique.mockResolvedValue({ email: null });

    const result = await processEmail(job({ notificationId: 'n1', userId: 'u1', title: 't', message: 'm' }));

    expect(result).toMatchObject({ skipped: true, reason: 'no_email' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('throws (so BullMQ retries) when the provider send fails', async () => {
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

// ── handleJobFailure: dead-letter routing ─────────────────────────────────────
describe('handleJobFailure (dead-letter contract)', () => {
  it('marks retrying and does NOT dead-letter before retries are exhausted', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });

    await handleJobFailure(
      'email-notifications',
      'email',
      { id: '1', name: 'send-notification-email', data: { notificationId: 'n1' }, attemptsMade: 2 },
      { message: 'boom' },
    );

    const statuses = mockPrisma.notification.update.mock.calls.map((c) => c[0].data.status);
    expect(statuses).toContain('retrying');
    expect(mockMoveToDLQ).not.toHaveBeenCalled();
  });

  it('marks failed and dead-letters once attempts are exhausted', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({ deliveryStatus: '{}' });

    await handleJobFailure(
      'email-notifications',
      'email',
      { id: '1', name: 'send-notification-email', data: { notificationId: 'n1' }, attemptsMade: MAX_ATTEMPTS },
      { message: 'boom' },
    );

    const statuses = mockPrisma.notification.update.mock.calls.map((c) => c[0].data.status);
    expect(statuses).toContain('failed');
    expect(mockMoveToDLQ).toHaveBeenCalledWith(
      'email-notifications',
      'send-notification-email',
      { notificationId: 'n1' },
      'boom',
    );
  });
});
