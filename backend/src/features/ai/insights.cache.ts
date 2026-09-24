/**
 * Caching and in-flight coalescing for the AI insight agents.
 *
 * `GET /ai/insights` ran `runAllAgents()` on every single call: seven Prisma
 * queries over 120 days of transactions, then the analysis, with no cache and
 * no request dedupe. The dashboard and the insights page both call it, a
 * refresh calls it again, and two tabs call it twice — each one paying the full
 * cost against a database in a different region from the API (~280 ms per round
 * trip), so the queries alone put a floor under the latency before any work
 * happened.
 *
 * Two mechanisms, because they solve different problems:
 *
 *   - **Coalescing** collapses concurrent identical requests onto one
 *     computation. This is the fix for "duplicate or overlapping requests":
 *     without it, two tabs opening together do the work twice.
 *   - **Caching** serves a recent result without recomputing. The agents are
 *     heuristic and read-only — nothing about their output has to be
 *     to-the-second fresh — so a short TTL is safe.
 *
 * Invalidation is explicit rather than time-only: a user who adds a transaction
 * should not stare at stale insights for the rest of the TTL, so the write
 * paths call `invalidateInsights(userId)`.
 *
 * Per-user by construction: the key is the user id, and one user's entry is
 * never served to another. Bounded so a large user base cannot grow it without
 * limit.
 */
import { recordAiEvent, timeAiPhase } from './ai.timing';
import { logger } from '../../config/logger';

const TTL_MS = Number(process.env.AI_INSIGHTS_CACHE_TTL_MS || 5 * 60_000);
const MAX_ENTRIES = Number(process.env.AI_INSIGHTS_CACHE_MAX || 500);

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Drop the oldest entries once the map outgrows its bound.
 *
 * Insertion order is eviction order — Map preserves it, and an entry is only
 * re-inserted when it is recomputed, so this approximates LRU closely enough
 * for a cache whose entries all expire within minutes anyway.
 */
const evictIfNeeded = (): void => {
  if (cache.size <= MAX_ENTRIES) return;
  const excess = cache.size - MAX_ENTRIES;
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++removed >= excess) break;
  }
};

/**
 * Serve `operation` from cache, join an identical in-flight run, or compute it.
 *
 * `compute` is timed as the 'total' phase of `operation`, so the metrics
 * endpoint shows what a real (uncached) run costs alongside how often the cache
 * spared one.
 */
export const withInsightsCache = async <T>(
  operation: string,
  userId: string,
  compute: () => Promise<T>,
): Promise<T> => {
  const key = `${operation}:${userId}`;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    recordAiEvent(operation, 'cacheHit');
    return cached.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) {
    recordAiEvent(operation, 'coalesced');
    return pending as Promise<T>;
  }

  const task = (async () => {
    try {
      const value = await timeAiPhase(operation, 'total', compute);
      cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
      evictIfNeeded();
      return value;
    } catch (err) {
      // A failure must not be cached — the next request should retry rather
      // than be served an error for the rest of the TTL.
      recordAiEvent(operation, 'failure');
      throw err;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
};

/**
 * Invalidate one user's cached insights.
 *
 * Called from the write paths that change what the agents would conclude. Safe
 * to call liberally — dropping an entry only costs the next recomputation, and
 * is always preferable to showing a stale figure after the user has just
 * changed the underlying data.
 */
export const invalidateInsights = (userId: string): void => {
  try {
    for (const key of cache.keys()) {
      if (key.endsWith(`:${userId}`)) cache.delete(key);
    }
  } catch (err) {
    logger.warn('[ai] insights cache invalidation failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

/** Test hook. */
export const resetInsightsCache = (): void => {
  cache.clear();
  inFlight.clear();
};
