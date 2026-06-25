/**
 * Notification delivery — database outbox drainer (Redis-free).
 *
 * The notification row in PostgreSQL IS the queue. Producers write a row with
 * `status='pending'` and per-channel `deliveryStatus` of 'queued'; this drainer
 * polls for due rows on a node-cron tick and delivers each pending channel.
 *
 * Reliability contract (unchanged from the former BullMQ workers):
 *   - Idempotent: a channel already 'sent' for a notificationId is skipped, so a
 *     re-drain never double-delivers.
 *   - Lifecycle: PostgreSQL is the source of truth — status pending → processing
 *     → sent | retrying | failed, with per-channel truth in `deliveryStatus`.
 *   - Retry/backoff: failed sends are retried up to MAX_ATTEMPTS with exponential
 *     backoff via `nextRetryAt`. A row that exhausts its retries lands at
 *     status='failed' — the queryable dead-letter equivalent (nothing is ever
 *     silently dropped; the `@@index([status, nextRetryAt])` powers recovery).
 */
import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../config/logger';
import { prisma } from '../db/prisma';
import { sendNotificationEmail } from '../emails';
import { sendPushNotification, initializeFirebase } from '../config/firebase';
import { markOutboxDrain } from './health';

// ── Delivery policy ──────────────────────────────────────────────────────────
export const MAX_ATTEMPTS = Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5);
const BACKOFF_BASE_MS = Number(process.env.NOTIFICATION_BACKOFF_BASE_MS || 5000);
const OUTBOX_BATCH = Number(process.env.NOTIFICATION_OUTBOX_BATCH || 25);
// node-cron 6-field expression (seconds supported). Default: every 15 seconds.
const OUTBOX_SCHEDULE = process.env.NOTIFICATION_OUTBOX_CRON || '*/15 * * * * *';

type Channel = 'email' | 'push';
const ASYNC_CHANNELS: Channel[] = ['email', 'push'];

const backoffMs = (attemptsMade: number) =>
  BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attemptsMade - 1));

// ── Lifecycle / idempotency helpers ──────────────────────────────────────────
const parseJson = <T>(value: unknown, fallback: T): T => {
  try {
    if (value == null) return fallback;
    return (typeof value === 'string' ? JSON.parse(value) : value) as T;
  } catch {
    return fallback;
  }
};

const parseDeliveryStatus = (value: unknown): Record<string, string> =>
  parseJson<Record<string, string>>(value, {});

const parseChannels = (value: unknown): string[] => {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.map(String) : [];
};

/** Idempotency guard: has this channel already been delivered? */
async function isAlreadySent(notificationId: string, channel: Channel): Promise<boolean> {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { deliveryStatus: true },
  });
  if (!n) return false;
  return parseDeliveryStatus(n.deliveryStatus)[channel] === 'sent';
}

async function setProcessing(notificationId: string): Promise<void> {
  await prisma.notification
    .update({ where: { id: notificationId }, data: { status: 'processing' } })
    .catch(() => {/* bookkeeping must never fail the send */});
}

async function markChannel(
  notificationId: string,
  channel: Channel,
  channelStatus: 'sent' | 'failed',
): Promise<void> {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n) return;
  const ds = parseDeliveryStatus(n.deliveryStatus);
  ds[channel] = channelStatus;
  await prisma.notification
    .update({
      where: { id: notificationId },
      data: {
        deliveryStatus: JSON.stringify(ds),
        ...(channelStatus === 'sent'
          ? { sentAt: new Date(), errorMessage: null }
          : {}),
      },
    })
    .catch(() => {/* best-effort */});
}

// ── Channel processors (idempotent, source-of-truth = PostgreSQL) ────────────
export interface DeliveryJob {
  notificationId: string;
  userId: string;
  title: string;
  message: string;
  category?: string;
  deepLink?: string;
  // push-only
  deviceId?: string;
  fcmToken?: string;
  priority?: string;
}

export async function processEmail(job: { data: DeliveryJob }): Promise<unknown> {
  const { notificationId, userId, title, message, category, deepLink } = job.data;

  if (await isAlreadySent(notificationId, 'email')) {
    return { skipped: true, reason: 'already_sent' };
  }
  await setProcessing(notificationId);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) {
    // No recipient — permanent failure, no point retrying.
    await markChannel(notificationId, 'email', 'failed');
    return { skipped: true, reason: 'no_email' };
  }

  const sent = await sendNotificationEmail({
    to: user.email,
    title,
    message,
    category,
    deepLink,
    headers: { 'X-Notification-ID': notificationId },
  });
  if (!sent) throw new Error('SendGrid send failed');

  await markChannel(notificationId, 'email', 'sent');
  return { sent: true };
}

export async function processPush(job: { data: DeliveryJob }): Promise<unknown> {
  const { notificationId, userId, deviceId, fcmToken, title, message, category, deepLink, priority } =
    job.data;

  if (await isAlreadySent(notificationId, 'push')) {
    return { skipped: true, reason: 'already_sent' };
  }
  await setProcessing(notificationId);

  if (!deviceId || !fcmToken) {
    await markChannel(notificationId, 'push', 'failed');
    return { skipped: true, reason: 'no_device' };
  }

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== userId || !device.isActive || device.fcmToken !== fcmToken) {
    await markChannel(notificationId, 'push', 'failed');
    return { skipped: true, reason: 'device_unavailable' };
  }

  try {
    const messageId = await sendPushNotification(fcmToken, {
      title,
      body: message,
      data: {
        notificationId,
        category: category || '',
        deepLink: deepLink || '',
        priority: priority || 'normal',
      },
    });
    await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } }).catch(() => {});
    await markChannel(notificationId, 'push', 'sent');
    return { sent: true, messageId };
  } catch (err) {
    // A dead/unregistered token will never succeed — clean it up so we stop
    // retrying it, then re-throw so the drainer records the failed attempt.
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('invalid') || msg.includes('unregistered') || msg.includes('not-registered')) {
      await prisma.device
        .update({ where: { id: deviceId }, data: { fcmToken: null, isActive: false } })
        .catch(() => {});
    }
    throw err;
  }
}

// ── Per-notification delivery (all due channels in one pass) ──────────────────
interface OutboxRow {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: string | null;
  deepLink: string | null;
  priority: string | null;
  channels: unknown;
  deliveryStatus: unknown;
  attempts: number;
  requestId: string | null;
}

const isTerminal = (s: string | undefined) => s === 'sent' || s === 'failed';

/** Build the per-channel job payload from a notification row (+ device for push). */
async function buildJob(row: OutboxRow, channel: Channel): Promise<DeliveryJob> {
  const base: DeliveryJob = {
    notificationId: row.id,
    userId: row.userId,
    title: row.title,
    message: row.message,
    category: row.category ?? undefined,
    deepLink: row.deepLink ?? undefined,
    priority: row.priority ?? undefined,
  };
  if (channel === 'push') {
    const device = await prisma.device.findFirst({
      where: { userId: row.userId, isActive: true, fcmToken: { not: null } },
    });
    base.deviceId = device?.id;
    base.fcmToken = device?.fcmToken ?? undefined;
  }
  return base;
}

/**
 * Deliver every still-pending async channel for one notification, then reconcile
 * the overall status. Exported for unit testing.
 */
export async function deliverNotification(row: OutboxRow): Promise<void> {
  const requested = parseChannels(row.channels).filter((c): c is Channel =>
    (ASYNC_CHANNELS as string[]).includes(c),
  );
  const ds = parseDeliveryStatus(row.deliveryStatus);
  const pending = requested.filter((c) => !isTerminal(ds[c]));

  if (pending.length === 0) {
    // Nothing to do — reconcile a stuck 'pending'/'retrying' row to terminal.
    const anySent = requested.some((c) => ds[c] === 'sent');
    await prisma.notification
      .update({ where: { id: row.id }, data: { status: anySent ? 'sent' : 'failed', nextRetryAt: null } })
      .catch(() => {});
    return;
  }

  const attemptsMade = (row.attempts ?? 0) + 1;
  let lastError: string | undefined;

  for (const channel of pending) {
    try {
      const job = { data: await buildJob(row, channel) };
      await (channel === 'email' ? processEmail(job) : processPush(job));
    } catch (err) {
      lastError = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      logger.warn(`[outbox] ${channel} delivery failed for ${row.id} (attempt ${attemptsMade}/${MAX_ATTEMPTS})`, {
        error: lastError,
        requestId: row.requestId ?? undefined,
      });
      if (attemptsMade >= MAX_ATTEMPTS) {
        // Retries exhausted — mark the channel failed (queryable dead-letter).
        await markChannel(row.id, channel, 'failed');
      }
    }
  }

  // Re-read the per-channel truth markChannel just wrote, then reconcile status.
  const fresh = await prisma.notification.findUnique({
    where: { id: row.id },
    select: { deliveryStatus: true },
  });
  const freshDs = parseDeliveryStatus(fresh?.deliveryStatus);
  const stillPending = requested.filter((c) => !isTerminal(freshDs[c]));

  if (stillPending.length > 0) {
    // Some channel can still be retried — schedule the next attempt.
    await prisma.notification
      .update({
        where: { id: row.id },
        data: {
          status: 'retrying',
          attempts: attemptsMade,
          errorMessage: lastError ?? null,
          nextRetryAt: new Date(Date.now() + backoffMs(attemptsMade)),
        },
      })
      .catch(() => {});
    return;
  }

  // All channels terminal: sent if at least one delivered, else failed.
  const anySent = requested.some((c) => freshDs[c] === 'sent');
  await prisma.notification
    .update({
      where: { id: row.id },
      data: {
        status: anySent ? 'sent' : 'failed',
        attempts: attemptsMade,
        nextRetryAt: null,
        ...(anySent ? { sentAt: new Date(), errorMessage: null } : { errorMessage: lastError ?? null }),
      },
    })
    .catch(() => {});
}

/** Drain one batch of due notifications. Exported so it can be triggered/tested directly. */
let draining = false;
export async function drainNotificationOutbox(): Promise<number> {
  if (draining) return 0; // never let ticks overlap
  draining = true;
  try {
    const now = new Date();
    const due = (await prisma.notification.findMany({
      where: {
        status: { in: ['pending', 'retrying'] },
        deletedAt: null,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: OUTBOX_BATCH,
      select: {
        id: true, userId: true, title: true, message: true, category: true,
        deepLink: true, priority: true, channels: true, deliveryStatus: true, attempts: true,
        requestId: true,
      },
    })) as OutboxRow[];

    for (const row of due) {
      await deliverNotification(row);
    }
    markOutboxDrain(due.length); // liveness heartbeat for worker health monitoring
    return due.length;
  } catch (err) {
    logger.error('[outbox] drain failed', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  } finally {
    draining = false;
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
let outboxJob: ScheduledTask | null = null;

/** Start the notification outbox drainer (replaces the BullMQ workers). */
export const startNotificationOutbox = (): void => {
  // Push delivery needs Firebase, but a missing/invalid Firebase config must NOT
  // prevent the drainer (and SendGrid email delivery) from starting. In
  // production initializeFirebase() throws when FIREBASE_* env vars are absent;
  // previously that threw out of startNotificationOutbox() and the outbox cron
  // was never scheduled — so nothing drained. Degrade push gracefully instead:
  // per-row push sends still fail safely via the outbox retry/fail lifecycle.
  try {
    initializeFirebase();
  } catch (err) {
    logger.warn('[outbox] Firebase not initialized — push delivery degraded; email + drainer still active', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!cron.validate(OUTBOX_SCHEDULE)) {
    logger.error(`Invalid NOTIFICATION_OUTBOX_CRON: "${OUTBOX_SCHEDULE}". Outbox drainer NOT started.`);
    return;
  }

  outboxJob = cron.schedule(OUTBOX_SCHEDULE, () => {
    void drainNotificationOutbox();
  });
  logger.info(`Notification outbox drainer started (schedule: ${OUTBOX_SCHEDULE}, batch: ${OUTBOX_BATCH})`);
};

/** Stop the drainer (called on shutdown). */
export const stopNotificationOutbox = async (): Promise<void> => {
  if (outboxJob) {
    outboxJob.stop();
    outboxJob = null;
    logger.info('Notification outbox drainer stopped');
  }
};
