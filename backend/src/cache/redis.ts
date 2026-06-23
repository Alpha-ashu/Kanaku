/**
 * In-memory cache (Redis-free).
 *
 * Kanaku runs as a single backend instance, so the cache, idempotency replay
 * store and response cache all live in-process. This module keeps the exact
 * public surface the rest of the codebase already imported from the old
 * Redis-backed cache (cacheGetJson / cacheSetJson / cacheDeleteByPrefix /
 * getRedisStatus / getRedisClient / metrics) so callers compile and behave
 * unchanged — they simply hit a bounded, TTL-aware Map instead of a network
 * round-trip.
 *
 * `getRedisClient()` always returns null and `getRedisStatus()` is always
 * 'disabled'; consumers that branched on a live raw client (otp.service,
 * aiUsageTracker, auth.controller) already fall back to Postgres / their own
 * in-memory path when the client is null, so nothing regresses.
 */
import { logger } from '../config/logger';
import type { RedisLike } from '../config/redis-connections';

type RedisStatus = 'disabled' | 'connected' | 'connecting' | 'error';

type CacheMetricType = 'hit' | 'miss' | 'store';

type CacheMetricBucket = {
  hit: number;
  miss: number;
  store: number;
};

export type CacheMetricSnapshot = CacheMetricBucket & {
  reads: number;
  hitRate: number;
};

// ── Metrics (unchanged) ──────────────────────────────────────────────────────
const cacheMetrics = new Map<string, CacheMetricBucket>();
const CACHE_METRICS_LOG_EVERY = 50;

const getMetricBucket = (prefix: string): CacheMetricBucket => {
  const existing = cacheMetrics.get(prefix);
  if (existing) return existing;

  const created: CacheMetricBucket = { hit: 0, miss: 0, store: 0 };
  cacheMetrics.set(prefix, created);
  return created;
};

export const cacheRecordMetric = (prefix: string, type: CacheMetricType) => {
  const bucket = getMetricBucket(prefix);
  bucket[type] += 1;

  const totalReads = bucket.hit + bucket.miss;
  if (totalReads > 0 && totalReads % CACHE_METRICS_LOG_EVERY === 0) {
    const hitRate = ((bucket.hit / totalReads) * 100).toFixed(1);
    logger.info('Cache metrics', {
      prefix,
      reads: totalReads,
      writes: bucket.store,
      hits: bucket.hit,
      misses: bucket.miss,
      hitRate: `${hitRate}%`,
    });
  }
};

export const getCacheMetricsSnapshot = (): Record<string, CacheMetricSnapshot> => {
  const snapshot: Record<string, CacheMetricSnapshot> = {};

  for (const [prefix, bucket] of cacheMetrics.entries()) {
    const reads = bucket.hit + bucket.miss;
    const hitRate = reads > 0 ? Number(((bucket.hit / reads) * 100).toFixed(2)) : 0;

    snapshot[prefix] = {
      ...bucket,
      reads,
      hitRate,
    };
  }

  return snapshot;
};

export const resetCacheMetrics = () => {
  cacheMetrics.clear();
};

// ── Bounded in-memory TTL store ──────────────────────────────────────────────
// A simple Map with per-entry expiry. Capped so a burst of distinct keys can't
// grow memory without bound (oldest-inserted keys are evicted first — Map keeps
// insertion order). Lazy expiry on read plus a periodic sweep keeps it tidy.
interface CacheEntry {
  value: string;
  expiresAt: number; // epoch ms
}

const MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 50_000);
const store = new Map<string, CacheEntry>();

const sweep = () => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
};
const sweepTimer = setInterval(sweep, 60_000);
sweepTimer.unref?.();

const evictIfNeeded = () => {
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
};

// ── Compatibility shims for the former Redis client/status surface ───────────
/** No live Redis in single-instance mode. Always null — callers fall back. */
export const getRedisClient = (): RedisLike | null => null;

/** Always 'disabled' so client-gated callers take their non-Redis path. */
export const getRedisStatus = (): RedisStatus => 'disabled';

/** No-op: there is no connection to establish. Kept for server.ts wiring. */
export const initRedis = async (): Promise<void> => {
  logger.info('Cache running in-memory (Redis disabled)');
};

/** Clear the in-memory store on shutdown. */
export const closeRedis = async (): Promise<void> => {
  clearInterval(sweepTimer);
  store.clear();
};

export const cacheGetJson = async <T>(key: string): Promise<T | null> => {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    return null;
  }
};

export const cacheSetJson = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  try {
    const serialized = JSON.stringify(value);
    // Refresh insertion order so hot keys survive eviction longer.
    store.delete(key);
    evictIfNeeded();
    store.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
  } catch {
    // Non-serializable value — skip caching rather than throw.
  }
};

export const cacheDeleteByPrefix = async (prefix: string): Promise<void> => {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
};
