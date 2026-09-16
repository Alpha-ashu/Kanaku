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
import {
  outboxDrainsTotal, outboxDrainDuration, outboxQueueDepth,
  notificationDeliveriesTotal, notificationOutcomesTotal, workerJobFailuresTotal,
} from '../config/metrics';
import { isUserClearing } from './recurring.worker';

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

/** Notifications not delivered within this window are retired, not sent late. */
const MAX_DELIVERY_AGE_MS = Number(process.env.NOTIFICATION_MAX_AGE_HOURS || 24) * 60 * 60 * 1000;

/** A 'processing' row this old belongs to a pass that crashed; it may be taken over. */
const STALE_PROCESSING_MS = 10 * 60 * 1000;

/** Rows a drainer may deliver: queued, awaiting retry, or abandoned mid-delivery. */
const deliverableWhere = (now: Date) => ({
  OR: [
    { status: { in: ['pending', 'retrying'] } },
    { status: 'processing', updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
  ],
});

/**
 * Atomic idempotency guard for one channel.
 *
 * Called standalone (`rowClaimed` false) it claims the whole row, so concurrent
 * worker processes cannot both send. deliverNotification claims the row once up
 * front and passes `rowClaimed`: every channel of that notification is then
 * deliverable in the same pass — before, the first channel's claim moved the row
 * to 'processing', so the second channel's claim always failed, and a channel
 * whose send threw stayed 'sending' and was skipped on every retry, forever.
 */
async function claimChannelDelivery(notificationId: string, channel: Channel, rowClaimed = false): Promise<boolean> {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { deliveryStatus: true, status: true },
  });
  if (!n) return false;
  const ds = parseDeliveryStatus(n.deliveryStatus);
  if (ds[channel] === 'sent' || (ds[channel] === 'sending' && !rowClaimed)) {
    return false;
  }

  ds[channel] = 'sending';
  const updated = await prisma.notification.updateMany({
    where: rowClaimed
      ? { id: notificationId, status: 'processing' }
      : { id: notificationId, status: { in: ['pending', 'retrying'] } },
    data: {
      status: 'processing',
      deliveryStatus: JSON.stringify(ds),
    },
  });

  return updated.count > 0;
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
  metadata?: unknown;
  /** Set by deliverNotification, which has already claimed the whole row for this pass. */
  rowClaimed?: boolean;
}

export async function processEmail(job: { data: DeliveryJob }): Promise<unknown> {
  const { notificationId, userId, title, message, category, deepLink, metadata } = job.data;

  const claimed = await claimChannelDelivery(notificationId, 'email', job.data.rowClaimed);
  if (!claimed) {
    return { skipped: true, reason: 'already_sent_or_claimed' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const meta = parseJson<any>(metadata, {});
  const targetEmail = user?.email || meta?.recipientEmail;

  if (!targetEmail) {
    // No recipient — permanent failure, no point retrying.
    await markChannel(notificationId, 'email', 'failed');
    return { skipped: true, reason: 'no_email' };
  }

  const emailTitle = meta?.emailTitle ?? title;
  const emailMessage = meta?.emailBody ?? message;

  const sent = await sendNotificationEmail({
    to: targetEmail,
    title: emailTitle,
    message: emailMessage,
    category,
    deepLink,
    headers: { 'X-Notification-ID': notificationId },
  });

  if (!sent) {
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[outbox] Email send simulated/skipped in development for ${notificationId}`);
      await markChannel(notificationId, 'email', 'sent');
      return { sent: false, simulated: true };
    }
    throw new Error('Email delivery failed (SendGrid/SMTP)');
  }

  await markChannel(notificationId, 'email', 'sent');
  return { sent: true };
}

const DEAD_FCM_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export async function processPush(job: { data: DeliveryJob }): Promise<unknown> {
  const { notificationId, userId, title, message, category, deepLink, priority, metadata } =
    job.data;

  const claimed = await claimChannelDelivery(notificationId, 'push', job.data.rowClaimed);
  if (!claimed) {
    return { skipped: true, reason: 'already_sent_or_claimed' };
  }

  // The sender is Firebase Cloud Messaging, which only accepts FCM registration
  // tokens. A raw APNs token (what @capacitor/push-notifications returns on iOS
  // without the Firebase SDK) is rejected as invalid — sending to it used to get
  // the iPhone deactivated. Those devices get in-app + on-device reminders until
  // iOS registers an FCM token.
  const devices = await prisma.device.findMany({
    where: { userId, isActive: true, fcmToken: { not: null } },
    orderBy: { lastSyncedAt: 'desc' },
  });

  if (devices.length === 0) {
    await markChannel(notificationId, 'push', 'failed');
    return { skipped: true, reason: 'no_fcm_device' };
  }

  const meta = parseJson<any>(metadata, {});
  const pushTitle = meta?.pushTitle ?? title;
  const pushBody = meta?.pushBody ?? message;

  let anySent = false;
  let lastError: any = null;

  for (const device of devices) {
    const token = device.fcmToken;
    if (!token) continue;

    try {
      await sendPushNotification(token, {
        title: pushTitle,
        body: pushBody,
        data: {
          notificationId,
          category: category || '',
          deepLink: deepLink || '',
          priority: priority || 'normal',
        },
      });
      await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
      anySent = true;
    } catch (err: any) {
      lastError = err;
      // Only a token FCM itself reports as dead is dropped. A broad "invalid"
      // match also caught payload errors (messaging/invalid-argument) and
      // disconnected healthy devices.
      if (DEAD_FCM_TOKEN_CODES.has(String(err?.code || err?.errorInfo?.code || ''))) {
        await prisma.device
          .update({ where: { id: device.id }, data: { fcmToken: null } })
          .catch(() => {});
      }
    }
  }

  if (anySent) {
    await markChannel(notificationId, 'push', 'sent');
    return { sent: true };
  }

  if (lastError) {
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[outbox] Push simulated/skipped in development for ${notificationId}`);
      await markChannel(notificationId, 'push', 'sent');
      return { sent: false, simulated: true };
    }
    throw lastError;
  }

  await markChannel(notificationId, 'push', 'failed');
  return { sent: false, reason: 'all_devices_failed' };
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
  metadata: unknown;
}

const isTerminal = (s: string | undefined) => s === 'sent' || s === 'failed';

/** Build the delivery job payload from a notification row. */
async function buildJob(row: OutboxRow): Promise<DeliveryJob> {
  const base: DeliveryJob = {
    notificationId: row.id,
    userId: row.userId,
    title: row.title,
    message: row.message,
    category: row.category ?? undefined,
    deepLink: row.deepLink ?? undefined,
    priority: row.priority ?? undefined,
    metadata: row.metadata ?? undefined,
  };
  // Push resolves the user's FCM devices itself (processPush), so the job carries
  // no device.
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

  // Delivery trace — emits the originating requestId for EVERY notification the
  // worker handles (not just failures), so the request can be followed end-to-end
  // through the worker in centralized logs.
  if (pending.length > 0) {
    logger.info(`[outbox] delivering ${row.id}`, {
      notificationId: row.id, requestId: row.requestId ?? undefined, channels: pending,
    });
  }

  if (pending.length === 0) {
    // Nothing to do — reconcile a stuck 'pending'/'retrying' row to terminal.
    const anySent = requested.some((c) => ds[c] === 'sent');
    await prisma.notification
      .update({ where: { id: row.id }, data: { status: anySent ? 'sent' : 'failed', nextRetryAt: null } })
      .catch(() => {});
    return;
  }

  // Claim the row once for this pass (see claimChannelDelivery). If another
  // drainer already holds it, leave it alone.
  const rowClaim = await prisma.notification.updateMany({
    where: { id: row.id, ...deliverableWhere(new Date()) },
    data: { status: 'processing' },
  });
  if (rowClaim.count === 0) return;

  const attemptsMade = (row.attempts ?? 0) + 1;
  let lastError: string | undefined;

  for (const channel of pending) {
    try {
      const job = { data: { ...(await buildJob(row)), rowClaimed: true } };
      await (channel === 'email' ? processEmail(job) : processPush(job));
      notificationDeliveriesTotal.inc({ channel, status: 'sent' });
    } catch (err) {
      notificationDeliveriesTotal.inc({ channel, status: 'failed' });
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
    notificationOutcomesTotal.inc({ outcome: 'retrying' });
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
  notificationOutcomesTotal.inc({ outcome: anySent ? 'sent' : 'failed' });
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
  const endTimer = outboxDrainDuration.startTimer();
  try {
    const now = new Date();

    // A reminder or "group expense updated" notice arriving days late is noise,
    // so retire anything too old instead of delivering it. Without this, fixing
    // the stuck-retry bug (claimChannelDelivery) would flush every notification
    // stranded since the 2026-09-14 email outage in one burst.
    await prisma.notification.updateMany({
      where: {
        ...deliverableWhere(now),
        deletedAt: null,
        createdAt: { lt: new Date(now.getTime() - MAX_DELIVERY_AGE_MS) },
      },
      data: { status: 'failed', errorMessage: 'Expired before delivery', nextRetryAt: null },
    });

    const due = (await prisma.notification.findMany({
      where: {
        AND: [
          deliverableWhere(now),
          { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        ],
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: OUTBOX_BATCH,
      select: {
        id: true, userId: true, title: true, message: true, category: true,
        deepLink: true, priority: true, channels: true, deliveryStatus: true, attempts: true,
        requestId: true, metadata: true,
      },
    })) as OutboxRow[];

    for (const row of due) {
      if (isUserClearing(row.userId)) {
        logger.debug(`[outbox] Skipping notification ${row.id} — factory reset in progress for user ${row.userId}`);
        continue;
      }
      await deliverNotification(row);
    }
    markOutboxDrain(due.length); // liveness heartbeat for worker health monitoring
    outboxDrainsTotal.inc();
    // Queue depth: a full batch means there may be more behind it — count then.
    let depth = due.length;
    if (due.length === OUTBOX_BATCH) {
      depth = await prisma.notification.count({
        where: { status: { in: ['pending', 'retrying'] }, deletedAt: null },
      });
    }
    outboxQueueDepth.set(depth);
    return due.length;
  } catch (err) {
    workerJobFailuresTotal.inc({ job: 'outbox' });
    logger.error('[outbox] drain failed', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  } finally {
    endTimer();
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
