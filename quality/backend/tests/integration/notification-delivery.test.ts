/**
 * Notification delivery reliability contract (Redis-free DB outbox):
 *   - dispatchNotification writes the row (source of truth); async channels rest
 *     at status='pending' for the outbox drainer — there is no queue/broker.
 *   - processEmail/processPush are idempotent per channel (no double-send on retry)
 *   - deliverNotification claims the row once per pass and drives the lifecycle:
 *     pending → processing → sent | retrying | failed, with backoff via nextRetryAt
 *   - every requested channel is delivered in the same pass, and a channel whose
 *     send failed is retried on the next pass (regressions fixed 2026-09-16: the
 *     second channel's claim always failed, and a failed channel stayed 'sending'
 *     and was skipped forever)
 *   - a row that exhausts MAX_ATTEMPTS lands at status='failed' (the queryable
 *     dead-letter equivalent — never silently dropped)
 *   - push goes through FCM only; only a token FCM reports as dead is dropped
 *
 * Pure unit tests — prisma, SendGrid and FCM are all mocked, so no live
 * Postgres / Redis is required.
 */

// ── Mocks (names must be `mock*` to satisfy jest.mock hoisting) ───────────────
const mockPrisma = {
  notification: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  user: { findUnique: jest.fn() },
  device: { findMany: jest.fn(), update: jest.fn() },
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

// ── Stateful notification row: every read sees what the worker last wrote ─────
interface RowState {
  status: string;
  deliveryStatus: string;
  attempts: number;
  updatedAt: Date;
  nextRetryAt?: Date | null;
}
let state: RowState;

const matchesStatus = (cond: any): boolean => {
  if (cond === undefined) return true;
  if (typeof cond === 'string') return state.status === cond;
  if (Array.isArray(cond?.in)) return cond.in.includes(state.status);
  return false;
};
const matchesWhere = (where: any): boolean => {
  if (where.OR) return where.OR.some((branch: any) => matchesWhere(branch));
  if (!matchesStatus(where.status)) return false;
  if (where.updatedAt?.lt && !(state.updatedAt < where.updatedAt.lt)) return false;
  return true;
};
const applyData = (data: any) => {
  for (const key of ['status', 'deliveryStatus', 'attempts', 'nextRetryAt'] as const) {
    if (data[key] !== undefined) (state as any)[key] = data[key];
  }
  state.updatedAt = new Date();
};

const useRow = (initial: Partial<RowState>) => {
  state = { status: 'pending', deliveryStatus: '{}', attempts: 0, updatedAt: new Date(), ...initial };
  mockPrisma.notification.findUnique.mockImplementation(async () => ({ id: 'n1', ...state }));
  mockPrisma.notification.update.mockImplementation(async ({ data }: any) => {
    applyData(data);
    return { id: 'n1', ...state };
  });
  mockPrisma.notification.updateMany.mockImplementation(async ({ where, data }: any) => {
    if (!matchesWhere(where)) return { count: 0 };
    applyData(data);
    return { count: 1 };
  });
};
const channelState = (channel: string) => JSON.parse(state.deliveryStatus)[channel];

const withProduction = async (fn: () => Promise<unknown>) => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production'; // failed sends throw instead of being simulated
  try {
    await fn();
  } finally {
    process.env.NODE_ENV = previous;
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.notification.create.mockResolvedValue({ id: 'n1' });
  mockPrisma.device.update.mockResolvedValue({});
  mockPrisma.device.findMany.mockResolvedValue([]);
  mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com' });
  useRow({});
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

  it('stores the dedupKey so a repeated event is rejected by the unique index', async () => {
    await dispatchNotification({ userId: 'u1', title: 't', message: 'm', dedupKey: 'loan_due:l1:2026-09-17:1' });
    expect(mockPrisma.notification.create.mock.calls[0][0].data.dedupKey).toBe('loan_due:l1:2026-09-17:1');
  });
});

// ── processEmail: idempotency + lifecycle ─────────────────────────────────────
describe('processEmail', () => {
  const emailJob = job({ notificationId: 'n1', userId: 'u1', title: 't', message: 'm' });

  it('skips when the email channel was already sent (idempotent)', async () => {
    useRow({ deliveryStatus: '{"email":"sent"}' });
    const result = await processEmail(emailJob);
    expect(result).toMatchObject({ skipped: true });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends, then marks the channel sent', async () => {
    mockSendEmail.mockResolvedValue(true);
    await processEmail(emailJob);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com' }));
    expect(channelState('email')).toBe('sent');
  });

  it('marks failed (no retry) when the user has no email address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: null });
    const result = await processEmail(emailJob);
    expect(result).toMatchObject({ skipped: true, reason: 'no_email' });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(channelState('email')).toBe('failed');
  });

  it('throws (so the drainer records the attempt) when the provider send fails', async () => {
    mockSendEmail.mockResolvedValue(false);
    await withProduction(async () => {
      await expect(processEmail(emailJob)).rejects.toThrow();
    });
  });
});

// ── processPush: FCM only + dead-token handling ───────────────────────────────
describe('processPush', () => {
  const pushJob = job({ notificationId: 'n1', userId: 'u1', title: 't', message: 'm' });

  it('skips when the push channel was already sent (idempotent)', async () => {
    useRow({ deliveryStatus: '{"push":"sent"}' });
    const result = await processPush(pushJob);
    expect(result).toMatchObject({ skipped: true });
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  it('sends only to devices holding an FCM token', async () => {
    mockPrisma.device.findMany.mockResolvedValue([{ id: 'd1', fcmToken: 'tok' }]);
    mockSendPush.mockResolvedValue('msg-id');

    const result = await processPush(pushJob);

    expect(mockPrisma.device.findMany.mock.calls[0][0].where).toMatchObject({ fcmToken: { not: null } });
    expect(mockSendPush).toHaveBeenCalledWith('tok', expect.objectContaining({ title: 't' }));
    expect(result).toMatchObject({ sent: true });
    expect(channelState('push')).toBe('sent');
  });

  it('marks failed when the user has no FCM device (APNs-only devices are not sent to)', async () => {
    const result = await processPush(pushJob);
    expect(result).toMatchObject({ skipped: true, reason: 'no_fcm_device' });
    expect(mockSendPush).not.toHaveBeenCalled();
    expect(channelState('push')).toBe('failed');
  });

  it('drops a token FCM reports as unregistered, but not on other errors', async () => {
    mockPrisma.device.findMany.mockResolvedValue([{ id: 'd1', fcmToken: 'dead' }, { id: 'd2', fcmToken: 'ok' }]);
    mockSendPush.mockImplementation(async (token: string) => {
      const err: any = new Error(token === 'dead' ? 'Requested entity was not found.' : 'Invalid payload');
      err.code = token === 'dead' ? 'messaging/registration-token-not-registered' : 'messaging/invalid-argument';
      throw err;
    });

    await withProduction(async () => {
      await expect(processPush(pushJob)).rejects.toThrow();
    });

    const updates = mockPrisma.device.update.mock.calls.map((c) => c[0]);
    expect(updates).toEqual([{ where: { id: 'd1' }, data: { fcmToken: null } }]);
  });
});

// ── deliverNotification: outbox lifecycle ─────────────────────────────────────
describe('deliverNotification (outbox lifecycle)', () => {
  const row = (channels: string[], attempts = state.attempts) => ({
    id: 'n1', userId: 'u1', title: 't', message: 'm', category: null, deepLink: null,
    priority: null, channels: JSON.stringify(['app', ...channels]), deliveryStatus: state.deliveryStatus,
    attempts, requestId: null, metadata: null,
  });

  it('delivers email AND push in the same pass', async () => {
    useRow({ deliveryStatus: '{"app":"sent","email":"queued","push":"queued"}' });
    mockSendEmail.mockResolvedValue(true);
    mockPrisma.device.findMany.mockResolvedValue([{ id: 'd1', fcmToken: 'tok' }]);
    mockSendPush.mockResolvedValue('msg-id');

    await deliverNotification(row(['email', 'push']));

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(channelState('email')).toBe('sent');
    expect(channelState('push')).toBe('sent');
    expect(state.status).toBe('sent');
  });

  it('retries a failed email on the next pass and then delivers it', async () => {
    useRow({ deliveryStatus: '{"app":"sent","email":"queued"}' });
    mockSendEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await withProduction(async () => {
      await deliverNotification(row(['email']));
      expect(state.status).toBe('retrying');
      expect(state.nextRetryAt).toBeInstanceOf(Date);

      await deliverNotification(row(['email']));
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(channelState('email')).toBe('sent');
    expect(state.status).toBe('sent');
  });

  it('marks failed (dead-letter equivalent) once MAX_ATTEMPTS is exhausted', async () => {
    useRow({ deliveryStatus: '{"app":"sent","email":"queued"}', status: 'retrying' });
    mockSendEmail.mockResolvedValue(false);

    await withProduction(() => deliverNotification(row(['email'], MAX_ATTEMPTS)));

    expect(state.status).toBe('failed');
    expect(channelState('email')).toBe('failed');
  });

  it('leaves a row another drainer is delivering right now', async () => {
    useRow({ deliveryStatus: '{"app":"sent","email":"queued"}', status: 'processing', updatedAt: new Date() });
    mockSendEmail.mockResolvedValue(true);

    await deliverNotification(row(['email']));

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('takes over a row abandoned mid-delivery', async () => {
    useRow({
      deliveryStatus: '{"app":"sent","email":"sending"}',
      status: 'processing',
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    mockSendEmail.mockResolvedValue(true);

    await deliverNotification(row(['email']));

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('sent');
  });

  it('reconciles a stuck row without re-sending when all channels are terminal', async () => {
    useRow({ deliveryStatus: '{"app":"sent","email":"sent"}', status: 'retrying' });
    await deliverNotification(row(['email'], 1));
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(state.status).toBe('sent');
  });
});
