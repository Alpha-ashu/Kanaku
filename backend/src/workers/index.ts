/**
 * Notification delivery workers (email + push).
 *
 * Reliability contract (§11/§12/§19):
 *   - Idempotent: a job is skipped if its channel is already 'sent' for that
 *     notificationId, so retries / duplicate enqueues never double-deliver.
 *   - Lifecycle: every attempt updates the notification row (PostgreSQL is the
 *     source of truth) — status pending → processing → sent | retrying | failed.
 *   - Dead-letter: a job that exhausts all retries is copied to the queue's DLQ
 *     and the notification marked 'failed'. Nothing is ever silently dropped.
 *
 * Retry/backoff/attempts come from STANDARD_JOB_OPTIONS (config/queue.ts).
 */
import { Worker, Job } from 'bullmq';
import { logger } from '../config/logger';
import { prisma } from '../db/prisma';
import { sendNotificationEmail } from '../emails';
import { sendPushNotification, initializeFirebase } from '../config/firebase';
import {
  bullConnection,
  QUEUE_NAMES,
  STANDARD_JOB_OPTIONS,
  moveToDeadLetter,
} from '../config/queue';

const EMAIL_CONCURRENCY = Number(process.env.EMAIL_WORKER_CONCURRENCY || 5);
const PUSH_CONCURRENCY = Number(process.env.PUSH_WORKER_CONCURRENCY || 10);
export const MAX_ATTEMPTS = Number(STANDARD_JOB_OPTIONS.attempts ?? 5);
const BACKOFF_BASE_MS =
  (typeof STANDARD_JOB_OPTIONS.backoff === 'object' && STANDARD_JOB_OPTIONS.backoff?.delay) || 5000;

type Channel = 'email' | 'push';

// ── Live runtime stats (for the queue monitoring endpoint) ───────────────────
interface QueueRuntimeStats {
  worker: Worker | null;
  concurrency: number;
  completed: number;
  failed: number;
  processingMsTotal: number;
  processingSamples: number;
}
const runtimeStats = new Map<string, QueueRuntimeStats>();

export function getWorkerRuntimeStats(queueName: string) {
  const s = runtimeStats.get(queueName);
  if (!s) return null;
  return {
    running: s.worker ? s.worker.isRunning() : false,
    concurrency: s.concurrency,
    completed: s.completed,
    failed: s.failed,
    avgProcessingMs:
      s.processingSamples > 0 ? Math.round(s.processingMsTotal / s.processingSamples) : 0,
  };
}

// ── Lifecycle / idempotency helpers ─────────────────────────────────────────
const parseDeliveryStatus = (value: unknown): Record<string, string> => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : ((value as Record<string, string>) || {});
  } catch {
    return {};
  }
};

/** Idempotency guard (§12): has this channel already been delivered? */
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
          ? { status: 'sent', sentAt: new Date(), errorMessage: null }
          : {}),
      },
    })
    .catch(() => {/* best-effort */});
}

async function recordFailure(
  notificationId: string | undefined,
  attemptsMade: number,
  err: unknown,
  isFinal: boolean,
): Promise<void> {
  if (!notificationId) return;
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  await prisma.notification
    .update({
      where: { id: notificationId },
      data: {
        attempts: attemptsMade,
        status: isFinal ? 'failed' : 'retrying',
        errorMessage: message,
        nextRetryAt: isFinal
          ? null
          : new Date(Date.now() + BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attemptsMade - 1))),
      },
    })
    .catch(() => {/* best-effort */});
}

// ── Processors ───────────────────────────────────────────────────────────────
export async function processEmail(job: Job): Promise<unknown> {
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

export async function processPush(job: Job): Promise<unknown> {
  const { notificationId, userId, deviceId, fcmToken, title, message, category, deepLink, priority } =
    job.data;

  if (await isAlreadySent(notificationId, 'push')) {
    return { skipped: true, reason: 'already_sent' };
  }
  await setProcessing(notificationId);

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
    // retrying it, then re-throw so BullMQ records the failed attempt.
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('invalid') || msg.includes('unregistered') || msg.includes('not-registered')) {
      await prisma.device
        .update({ where: { id: deviceId }, data: { fcmToken: null, isActive: false } })
        .catch(() => {});
    }
    throw err;
  }
}

// ── Failure handling (retry bookkeeping + dead-letter routing) ───────────────
interface FailableJob {
  id?: string;
  name: string;
  data: any;
  attemptsMade: number;
}

/**
 * Records a failed attempt and, once retries are exhausted, marks the channel
 * failed and copies the job to its dead-letter queue. Extracted from the worker
 * 'failed' listener so the DLQ contract is unit-testable without a live queue.
 */
export async function handleJobFailure(
  queueName: string,
  channel: Channel,
  job: FailableJob,
  err: { message?: string } | undefined,
): Promise<void> {
  const isFinal = job.attemptsMade >= MAX_ATTEMPTS;
  logger.warn(`[${queueName}] job ${job.id} failed (attempt ${job.attemptsMade}/${MAX_ATTEMPTS})`, {
    error: err?.message,
  });

  await recordFailure(job.data?.notificationId, job.attemptsMade, err, isFinal);

  if (isFinal) {
    if (job.data?.notificationId) await markChannel(job.data.notificationId, channel, 'failed');
    await moveToDeadLetter(queueName, job.name, job.data, err?.message || 'unknown').catch((e) =>
      logger.error(`[${queueName}] failed to move job to dead-letter queue`, { error: e?.message }),
    );
  }
}

// ── Worker wiring (with dead-letter routing) ─────────────────────────────────
function startWorker(
  queueName: string,
  channel: Channel,
  processor: (job: Job) => Promise<unknown>,
  concurrency: number,
): Worker {
  const stats: QueueRuntimeStats = {
    worker: null,
    concurrency,
    completed: 0,
    failed: 0,
    processingMsTotal: 0,
    processingSamples: 0,
  };
  runtimeStats.set(queueName, stats);

  const worker = new Worker(queueName, processor, { connection: bullConnection as any, concurrency });
  stats.worker = worker;

  worker.on('completed', (job) => {
    stats.completed += 1;
    const started = job.processedOn ?? job.timestamp;
    const finished = job.finishedOn ?? Date.now();
    if (started) {
      stats.processingMsTotal += Math.max(0, finished - started);
      stats.processingSamples += 1;
    }
    logger.debug(`[${queueName}] job ${job.id} completed`);
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    stats.failed += 1;
    await handleJobFailure(queueName, channel, job as unknown as FailableJob, err);
  });

  worker.on('error', () => {
    // Connection noise (e.g. Redis offline in dev) — already surfaced elsewhere.
  });

  logger.info(`${queueName} worker initialized (concurrency ${concurrency})`);
  return worker;
}

let workers: Worker[] = [];

/** Start the email + push notification workers. */
export const initializeNotificationWorkers = () => {
  initializeFirebase();
  const emailWorker = startWorker(QUEUE_NAMES.email, 'email', processEmail, EMAIL_CONCURRENCY);
  const pushWorker = startWorker(QUEUE_NAMES.push, 'push', processPush, PUSH_CONCURRENCY);
  workers = [emailWorker, pushWorker];
  return { emailWorker, pushWorker };
};

/** Gracefully close all workers (called on shutdown). */
export const stopNotificationWorkers = async (): Promise<void> => {
  await Promise.allSettled(workers.map((w) => w.close()));
  workers = [];
};
