/**
 * BullMQ queue infrastructure.
 *
 * Runs on its OWN logical database (DB0 via BULLMQ_REDIS_URL → see
 * config/redis-connections.ts) so queue keys can never collide with the cache,
 * session or rate-limit workloads.
 *
 * Provides:
 *   - a single shared BullMQ connection (no more unused subscriber)
 *   - the standard job policy required by the architecture (retries +
 *     exponential backoff, keep failed jobs for inspection)
 *   - a queue registry: every primary queue has a paired dead-letter queue so
 *     a job that exhausts its retries is never silently discarded (§11/§19)
 *
 * Only the queues that have real producers are registered (email, push). New
 * queues (reports, receipts, ai-processing, …) get added here the moment a
 * producer/consumer exists — we do not pre-create idle queues.
 */
import { Queue, JobsOptions } from "bullmq";
import Redis from "ioredis";
import { resolveRedisUrl, buildRedisOptions } from "./redis-connections";

// ── Connection (DB0) ─────────────────────────────────────────────────────────
// Falls back to a local Dragonfly/Redis in dev when no URL is configured.
const bullUrl = resolveRedisUrl("bullmq") ?? "redis://127.0.0.1:6379/0";
export const bullConnection = new Redis(bullUrl, buildRedisOptions("bullmq"));

bullConnection.on("error", (err) => {
  if (process.env.NODE_ENV === "production") {
    console.error("[Redis:bullmq] Connection error:", err.message);
  }
});

// ── Standard job policy (§10) ─────────────────────────────────────────────────
export const STANDARD_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: true,
  // Keep failed jobs in Redis for inspection; they are ALSO copied to the DLQ on
  // final failure. Never silently drop a failure.
  removeOnFail: false,
};

// ── Queue registry ────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  email: "email-notifications",
  push: "push-notifications",
} as const;

export const DLQ_SUFFIX = "-dlq";
export const dlqName = (queueName: string) => `${queueName}${DLQ_SUFFIX}`;

/** All primary (non-DLQ) queue names — used by monitoring. */
export const PRIMARY_QUEUE_NAMES: string[] = Object.values(QUEUE_NAMES);

const queues = new Map<string, Queue>();

/** Lazily create (once) and return a queue by name. */
export function getQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, {
    connection: bullConnection as any,
    defaultJobOptions: STANDARD_JOB_OPTIONS,
  });
  queue.on("error", (err) => {
    if (process.env.NODE_ENV === "production") {
      console.error(`[Queue:${name}] Error:`, err.message);
    }
  });
  queues.set(name, queue);
  return queue;
}

export const getEmailQueue = () => getQueue(QUEUE_NAMES.email);
export const getPushQueue = () => getQueue(QUEUE_NAMES.push);

/** The dead-letter queue paired with a primary queue. */
export const getDeadLetterQueue = (primaryName: string) => getQueue(dlqName(primaryName));

/**
 * Copy a job that has exhausted all retries onto its dead-letter queue, with the
 * original payload plus failure metadata. DLQ jobs are NOT auto-retried.
 */
export async function moveToDeadLetter(
  primaryName: string,
  jobName: string,
  data: unknown,
  failedReason: string,
): Promise<void> {
  await getDeadLetterQueue(primaryName).add(
    jobName,
    { original: data, failedReason, failedAt: new Date().toISOString(), sourceQueue: primaryName },
    { attempts: 1, removeOnComplete: false, removeOnFail: false },
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
/** Eagerly registers the primary queues + their DLQs. Returns them for wiring. */
export function initializeQueues() {
  const emailQueue = getEmailQueue();
  const pushQueue = getPushQueue();
  // Ensure DLQs exist so producers/monitoring can reference them.
  getDeadLetterQueue(QUEUE_NAMES.email);
  getDeadLetterQueue(QUEUE_NAMES.push);
  console.log("✓ Job queues initialized (email, push + dead-letter queues)");
  return { emailQueue, pushQueue };
}

export const getQueues = initializeQueues;

export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await bullConnection.ping();
    if (result === "PONG") {
      console.log("✓ BullMQ Redis connected successfully");
      return true;
    }
  } catch (error: any) {
    console.error("✗ BullMQ Redis connection failed:", error.message);
  }
  return false;
}

export async function closeQueueConnections() {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
  await bullConnection.quit().catch(() => bullConnection.disconnect());
  console.log("✓ Queue connections closed");
}

export default {
  bullConnection,
  initializeQueues,
  getQueues,
  getQueue,
  getEmailQueue,
  getPushQueue,
  getDeadLetterQueue,
  moveToDeadLetter,
  testRedisConnection,
  closeQueueConnections,
};
