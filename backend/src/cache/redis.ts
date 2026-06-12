import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

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

let client: Redis | null = null;
let status: RedisStatus = 'disabled';
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

const createClient = () => {
  if (!env.REDIS_URL) {
    status = 'disabled';
    return null;
  }

  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableReadyCheck: true,
    connectTimeout: 3000,
    commandTimeout: 2000,
    tls: env.REDIS_TLS ? {} : undefined,
  });

  redis.on('connect', () => {
    status = 'connected';
    logger.info('Redis connected');
  });

  redis.on('error', (error) => {
    status = 'error';
    logger.warn('Redis error', { error: error.message });
  });

  redis.on('close', () => {
    if (status !== 'disabled') {
      status = 'connecting';
    }
  });

  status = 'connecting';
  return redis;
};

export const initRedis = async () => {
  if (!env.REDIS_URL) return;

  if (!client) {
    client = createClient();
  }

  if (!client) return;

  try {
    await client.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown redis init error';
    logger.warn('Redis initialization failed', { error: message });
    status = 'error';
  }
};

export const getRedisClient = () => {
  if (!client) {
    client = createClient();
  }

  return client;
};

export const getRedisStatus = () => status;

export const closeRedis = async () => {
  if (!client) return;

  try {
    await client.quit();
  } catch {
    await client.disconnect();
  } finally {
    client = null;
    status = env.REDIS_URL ? 'connecting' : 'disabled';
  }
};

export const cacheGetJson = async <T>(key: string): Promise<T | null> => {
  const redis = getRedisClient();
  if (!redis || status !== 'connected') return null;

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
  if (!redis || status !== 'connected') return;

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Cache failure should not fail API behavior.
  }
};

export const cacheDeleteByPrefix = async (prefix: string) => {
  const redis = getRedisClient();
  if (!redis || status !== 'connected') return;

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
