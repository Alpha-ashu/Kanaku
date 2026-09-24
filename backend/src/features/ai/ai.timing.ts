/**
 * Where time actually goes inside an AI request.
 *
 * `metricsMiddleware` already reports per-route p50/p95/p99 for every endpoint,
 * `/ai/*` included — so total latency was never the unknown. What no
 * instrument could answer was the question that decides what to optimise:
 * of those N seconds, how many were the database, how many were the model
 * provider, and how many were spent failing over between models?
 *
 * That distinction matters here more than usual, because the two plausible
 * causes call for opposite fixes. `/ai/insights` runs seven Prisma queries over
 * 120 days of transactions against a database in a different region
 * (~280 ms per round trip from the API's region), and nothing caches the
 * result — that is a caching problem. The KAI chat path walks a ladder of
 * Gemini models whose free tier allows 20 requests per model per day, so once
 * the quota is spent each request pays several failed calls before it answers —
 * that is a quota problem, and no amount of caching fixes it.
 *
 * Deliberately in-process and allocation-light: a bounded sample window per
 * operation, no external dependency, and `record()` never throws. It is a
 * diagnostic, not a billing ledger — losing samples on restart is fine.
 */

const MAX_SAMPLES = 200;

export type AiPhase = 'db' | 'provider' | 'total';

interface PhaseStats {
  samples: number[];
  count: number;
}

interface OperationStats {
  phases: Map<AiPhase, PhaseStats>;
  /** Calls that ended in an error rather than a result. */
  failures: number;
  /** Calls that gave up on the configured deadline. */
  timeouts: number;
  /** Provider attempts that were retried on another model. */
  providerRetries: number;
  /** Requests served from cache without doing the work. */
  cacheHits: number;
  /** Requests that joined an identical in-flight request instead of repeating it. */
  coalesced: number;
}

const operations = new Map<string, OperationStats>();

const getOperation = (name: string): OperationStats => {
  let op = operations.get(name);
  if (!op) {
    op = {
      phases: new Map(),
      failures: 0,
      timeouts: 0,
      providerRetries: 0,
      cacheHits: 0,
      coalesced: 0,
    };
    operations.set(name, op);
  }
  return op;
};

const pushSample = (op: OperationStats, phase: AiPhase, ms: number): void => {
  let stats = op.phases.get(phase);
  if (!stats) {
    stats = { samples: [], count: 0 };
    op.phases.set(phase, stats);
  }
  stats.count += 1;
  if (stats.samples.length >= MAX_SAMPLES) {
    // Reservoir-style overwrite, matching middleware/metrics.ts — a steady
    // window of recent samples rather than an unbounded history.
    stats.samples[Math.floor(Math.random() * MAX_SAMPLES)] = ms;
  } else {
    stats.samples.push(ms);
  }
};

/** Record a completed phase. Never throws — instrumentation must not break a request. */
export const recordAiPhase = (operation: string, phase: AiPhase, ms: number): void => {
  try {
    if (!Number.isFinite(ms) || ms < 0) return;
    pushSample(getOperation(operation), phase, ms);
  } catch {
    /* metrics must never be the reason a request fails */
  }
};

export const recordAiEvent = (
  operation: string,
  event: 'failure' | 'timeout' | 'providerRetry' | 'cacheHit' | 'coalesced',
): void => {
  try {
    const op = getOperation(operation);
    if (event === 'failure') op.failures += 1;
    else if (event === 'timeout') op.timeouts += 1;
    else if (event === 'providerRetry') op.providerRetries += 1;
    else if (event === 'cacheHit') op.cacheHits += 1;
    else op.coalesced += 1;
  } catch {
    /* as above */
  }
};

/**
 * Time an async phase and record it. Records the duration on failure too — a
 * call that times out after 30s is exactly the sample you most want to keep,
 * and dropping it would make the numbers look better the worse things got.
 */
export const timeAiPhase = async <T>(
  operation: string,
  phase: AiPhase,
  work: () => Promise<T>,
): Promise<T> => {
  const startedAt = process.hrtime.bigint();
  try {
    return await work();
  } finally {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    recordAiPhase(operation, phase, elapsedMs);
  }
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] * 100) / 100;
};

export interface AiTimingSnapshot {
  operations: Array<{
    operation: string;
    failures: number;
    timeouts: number;
    providerRetries: number;
    cacheHits: number;
    coalesced: number;
    phases: Array<{
      phase: AiPhase;
      count: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
    }>;
  }>;
}

/** Point-in-time view for `GET /api/v1/health/metrics`. */
export const getAiTimingSnapshot = (): AiTimingSnapshot => {
  const result: AiTimingSnapshot['operations'] = [];

  for (const [name, op] of operations) {
    const phases: AiTimingSnapshot['operations'][number]['phases'] = [];
    for (const [phase, stats] of op.phases) {
      const sorted = [...stats.samples].sort((a, b) => a - b);
      phases.push({
        phase,
        count: stats.count,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted.length ? Math.round(sorted[sorted.length - 1] * 100) / 100 : 0,
      });
    }
    result.push({
      operation: name,
      failures: op.failures,
      timeouts: op.timeouts,
      providerRetries: op.providerRetries,
      cacheHits: op.cacheHits,
      coalesced: op.coalesced,
      phases,
    });
  }

  // Slowest first — the thing to look at is at the top.
  result.sort((a, b) => {
    const at = a.phases.find((p) => p.phase === 'total')?.p95 ?? 0;
    const bt = b.phases.find((p) => p.phase === 'total')?.p95 ?? 0;
    return bt - at;
  });

  return { operations: result };
};

/** Test hook. */
export const resetAiTiming = (): void => operations.clear();
