/**
 * Worker liveness tracking (Infrastructure Part 1 — worker health monitoring).
 *
 * Detects when the worker stops *doing its job*, not merely whether the process
 * is alive. Each background job calls a `mark*` helper on every tick; the
 * worker's internal health server (worker.ts) reads `getWorkerHealth()` and
 * reports 503 once the notification outbox hasn't drained within the staleness
 * window. Fly's machine health check probes that endpoint and restarts a stuck
 * worker automatically.
 *
 * Harmless in the API combined-mode (RUN_WORKERS_IN_API unset): the same jobs
 * update these counters, but the API process never starts the health server.
 */

const startedAt = Date.now();

interface JobBeat {
  lastAt: number | null;
  count: number;
}

const outbox = { lastAt: null as number | null, count: 0, lastProcessed: 0 };
const cleanup: JobBeat = { lastAt: null, count: 0 };

/** Called at the end of every successful outbox drain tick (even when 0 due). */
export const markOutboxDrain = (processed: number): void => {
  outbox.lastAt = Date.now();
  outbox.count += 1;
  outbox.lastProcessed = processed;
};

/** Called after each scheduled cleanup run completes. */
export const markCleanupRun = (): void => {
  cleanup.lastAt = Date.now();
  cleanup.count += 1;
};

// How long the outbox may go without a drain before the worker is "stale".
// The outbox drains every ~15s by default, so 90s ≈ 6 missed ticks.
const STALE_MS = Number(process.env.WORKER_HEALTH_STALE_MS || 90_000);

export interface WorkerHealth {
  status: 'ok' | 'starting' | 'stale';
  service: 'worker';
  uptimeMs: number;
  now: string;
  outbox: { lastDrainAt: string | null; drains: number; lastProcessed: number; staleMs: number };
  cleanup: { lastRunAt: string | null; runs: number };
}

/**
 * Current worker health. `healthy: false` only once the outbox has gone stale
 * (past the boot grace period) — so a freshly-started worker reports `starting`
 * (still healthy) until its first drain tick.
 */
export const getWorkerHealth = (): { healthy: boolean; body: WorkerHealth } => {
  const now = Date.now();
  const booting = now - startedAt < STALE_MS;
  const fresh = outbox.lastAt != null && now - outbox.lastAt <= STALE_MS;
  const status: WorkerHealth['status'] = fresh ? 'ok' : booting ? 'starting' : 'stale';
  return {
    healthy: status !== 'stale',
    body: {
      status,
      service: 'worker',
      uptimeMs: now - startedAt,
      now: new Date(now).toISOString(),
      outbox: {
        lastDrainAt: outbox.lastAt ? new Date(outbox.lastAt).toISOString() : null,
        drains: outbox.count,
        lastProcessed: outbox.lastProcessed,
        staleMs: STALE_MS,
      },
      cleanup: {
        lastRunAt: cleanup.lastAt ? new Date(cleanup.lastAt).toISOString() : null,
        runs: cleanup.count,
      },
    },
  };
};
