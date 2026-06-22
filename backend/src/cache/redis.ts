import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { resolveRedisUrl } from '../config/redis-connections';

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

// ── Multi-endpoint cache store with automatic failover ──────────────────────
// The cache layer can use a primary (REDIS_URL) and an optional fallback
// (REDIS_FALLBACK_URL, e.g. self-hosted Dragonfly). When the primary errors or
// hits a quota, reads/writes automatically route to the fallback for a cooldown,
// then return to the primary once it recovers. If neither is healthy, callers
// fall open to their own in-memory path (cache helpers return null/no-op).
interface RedisEndpoint {
  name: string;
  client: Redis | null;
  status: RedisStatus;
  unhealthyUntil: number; // epoch ms; while > now, this endpoint is skipped
}

const UNHEALTHY_COOLDOWN_MS = 30_000;
const endpoints: RedisEndpoint[] = [];

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

const buildEndpoint = (name: string, url: string, forceTls = false): RedisEndpoint => {
  const endpoint: RedisEndpoint = { name, client: null, status: 'connecting', unhealthyUntil: 0 };

  // TLS auto-detected from the URL scheme (rediss://), with an override for the
  // primary (REDIS_TLS) for providers that use redis:// over a TLS port.
  const useTls = forceTls || url.startsWith('rediss://');
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableReadyCheck: true,
    connectTimeout: 3000,
    commandTimeout: 2000,
    tls: useTls ? {} : undefined,
  });

  redis.on('connect', () => {
    endpoint.status = 'connected';
    endpoint.unhealthyUntil = 0; // recovered — eligible again
    logger.info(`Redis[${name}] connected`);
  });

  // Over-quota ("ERR max requests limit exceeded") and connection errors both
  // surface here. Mark the endpoint unhealthy for a cooldown so traffic shifts
  // to the next endpoint instead of repeatedly hitting the failing one.
  redis.on('error', (error) => {
    endpoint.status = 'error';
    endpoint.unhealthyUntil = Date.now() + UNHEALTHY_COOLDOWN_MS;
    logger.warn(`Redis[${name}] error`, { error: error.message });
  });

  redis.on('close', () => {
    if (endpoint.status !== 'disabled') endpoint.status = 'connecting';
  });

  endpoint.client = redis;
  return endpoint;
};

const ensureEndpoints = () => {
  if (endpoints.length) return;
  // Cache primary runs on its own logical DB (CACHE_REDIS_URL → REDIS_URL/db1).
  const primaryUrl = resolveRedisUrl('cache');
  if (primaryUrl) endpoints.push(buildEndpoint('primary', primaryUrl, !!env.REDIS_TLS));
  // Priority-ordered fallback chain (comma-separated): e.g. Dragonfly -> Redis Cloud -> Valkey.
  if (env.REDIS_FALLBACK_URL) {
    env.REDIS_FALLBACK_URL.split(',')
      .map((u) => u.trim())
      .filter(Boolean)
      .forEach((u, i) => endpoints.push(buildEndpoint(`fallback${i + 1}`, u)));
  }
};

/** Pick the best available endpoint: a connected, non-cooled-down one first, then
 *  any connected one, then any not in cooldown, else the first (caller fails open). */
const getActiveEndpoint = (): RedisEndpoint | null => {
  ensureEndpoints();
  if (!endpoints.length) return null;
  const now = Date.now();
  return (
    endpoints.find((e) => e.client && e.status === 'connected' && e.unhealthyUntil <= now)
    || endpoints.find((e) => e.client && e.status === 'connected')
    || endpoints.find((e) => e.client && e.unhealthyUntil <= now)
    || endpoints[0]
    || null
  );
};

export const initRedis = async () => {
  ensureEndpoints();
  await Promise.all(
    endpoints.map(async (ep) => {
      if (!ep.client) return;
      try {
        await ep.client.connect();
      } catch (error) {
        ep.status = 'error';
        ep.unhealthyUntil = Date.now() + UNHEALTHY_COOLDOWN_MS;
        logger.warn(`Redis[${ep.name}] initialization failed`, {
          error: error instanceof Error ? error.message : 'Unknown redis init error',
        });
      }
    }),
  );
};

export const getRedisClient = () => getActiveEndpoint()?.client ?? null;

export const getRedisStatus = (): RedisStatus => {
  ensureEndpoints();
  if (!endpoints.length) return 'disabled';
  const active = getActiveEndpoint();
  return active ? active.status : 'connecting';
};

export const closeRedis = async () => {
  for (const ep of endpoints) {
    if (!ep.client) continue;
    try {
      await ep.client.quit();
    } catch {
      try { await ep.client.disconnect(); } catch { /* ignore */ }
    }
    ep.client = null;
  }
  endpoints.length = 0;
};

export const cacheGetJson = async <T>(key: string): Promise<T | null> => {
  const redis = getRedisClient();
  if (!redis || getRedisStatus() !== 'connected') return null;

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const cacheSetJson = async (key: string, value: unknown, ttlSeconds: number) => {
  const redis = getRedisClient();
  if (!redis || getRedisStatus() !== 'connected') return;

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Cache failure should not fail API behavior.
  }
};

export const cacheDeleteByPrefix = async (prefix: string) => {
  const redis = getRedisClient();
  if (!redis || getRedisStatus() !== 'connected') return;

  try {
    const stream = redis.scanStream({ match: `${prefix}*`, count: 100 });

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (keys: string[]) => {
        if (keys.length > 0) {
          void redis.del(...keys);
        }
      });
      stream.on('end', () => resolve());
      stream.on('error', (error) => reject(error));
    });
  } catch {
    // Best-effort invalidation only.
  }
};
