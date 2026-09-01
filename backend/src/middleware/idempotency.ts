import { createHash } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';
import { cacheGetJson, cacheSetJson, getRedisStatus } from '../cache/redis';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

interface IdempotentRecord {
  status: number;
  body: unknown;
  bodyHash: string;
  expiresAt?: number;
}

interface IdempotencyOptions {
  /** Logical route identifier — keeps keys scoped per endpoint */
  scope: string;
  /** Cache TTL in seconds. Default: 24h */
  ttlSeconds?: number;
  /** If true, allow request to continue when Redis/DB is down. Default: true */
  failOpen?: boolean;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
const HEADER_NAMES = ['idempotency-key', 'x-idempotency-key'];

// In-memory fallback LRU store for instantaneous process-level caching
const localIdempotencyCache = new Map<string, IdempotentRecord>();
const MAX_LOCAL_CACHE_ENTRIES = 5000;

// In-flight mutex to prevent concurrent duplicate execution during request flight
const inFlightRequests = new Map<string, Promise<{ status: number; body: unknown }>>();

const hashBody = (body: unknown): string => {
  try {
    const serialized = JSON.stringify(body ?? {});
    return createHash('sha256').update(serialized).digest('hex');
  } catch {
    return 'unhashable';
  }
};

const extractKey = (req: AuthRequest): string | null => {
  for (const name of HEADER_NAMES) {
    const value = req.headers[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().slice(0, 128);
    }
  }

  // Fallback: extract clientRequestId from request body if present
  if (req.body && typeof req.body === 'object' && typeof req.body.clientRequestId === 'string') {
    const clientReqId = req.body.clientRequestId.trim();
    if (clientReqId.length > 0) {
      return clientReqId.slice(0, 128);
    }
  }

  return null;
};

const cleanExpiredLocalCache = () => {
  const now = Date.now();
  for (const [k, v] of localIdempotencyCache.entries()) {
    if (v.expiresAt && v.expiresAt < now) {
      localIdempotencyCache.delete(k);
    }
  }
  if (localIdempotencyCache.size > MAX_LOCAL_CACHE_ENTRIES) {
    const keys = Array.from(localIdempotencyCache.keys());
    for (let i = 0; i < keys.length - MAX_LOCAL_CACHE_ENTRIES; i++) {
      localIdempotencyCache.delete(keys[i]);
    }
  }
};

/**
 * Fetch cached idempotent response from Redis (L1) -> PostgreSQL (L2) -> Local RAM (L0)
 */
async function getStoredIdempotencyRecord(cacheKey: string): Promise<IdempotentRecord | null> {
  // 1. Check Redis L1
  const redisAvailable = getRedisStatus() === 'connected';
  if (redisAvailable) {
    try {
      const redisRecord = await cacheGetJson<IdempotentRecord>(cacheKey);
      if (redisRecord) {
        return redisRecord;
      }
    } catch (err) {
      logger.warn('[idempotency] Redis lookup error', { error: String(err) });
    }
  }

  // 2. Check PostgreSQL L2 (durable shared store across server restarts & multiple instances)
  try {
    const dbRecord = await (prisma as any).apiIdempotencyKey.findUnique({
      where: { key: cacheKey },
    });
    if (dbRecord) {
      if (dbRecord.expiresAt.getTime() > Date.now()) {
        const record: IdempotentRecord = {
          status: dbRecord.statusCode,
          body: dbRecord.response,
          bodyHash: dbRecord.bodyHash,
          expiresAt: dbRecord.expiresAt.getTime(),
        };
        // Populate L1 cache for fast subsequent hits
        if (redisAvailable) {
          const ttlSec = Math.max(1, Math.floor((dbRecord.expiresAt.getTime() - Date.now()) / 1000));
          void cacheSetJson(cacheKey, record, ttlSec);
        }
        return record;
      } else {
        // Expired in DB, purge asynchronously
        void (prisma as any).apiIdempotencyKey.delete({ where: { id: dbRecord.id } }).catch(() => {});
      }
    }
  } catch (dbErr) {
    // Graceful fallback if database lookup fails
    logger.debug('[idempotency] Database lookup error (falling back to memory)', { error: String(dbErr) });
  }

  // 3. Check Local In-Memory Cache (L0)
  const local = localIdempotencyCache.get(cacheKey);
  if (local && (!local.expiresAt || local.expiresAt > Date.now())) {
    return local;
  }

  return null;
}

/**
 * Persist idempotent response to PostgreSQL (L2 durable) + Redis (L1) + Local RAM (L0)
 */
async function saveIdempotencyRecord(
  cacheKey: string,
  record: IdempotentRecord,
  userId: string,
  method: string,
  endpoint: string,
  scope: string,
  ttlSeconds: number,
) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  // 1. Local RAM
  localIdempotencyCache.set(cacheKey, record);
  cleanExpiredLocalCache();

  // 2. Redis L1
  if (getRedisStatus() === 'connected') {
    try {
      await cacheSetJson(cacheKey, record, ttlSeconds);
    } catch (err) {
      logger.warn('[idempotency] Redis write error', { error: String(err) });
    }
  }

  // 3. PostgreSQL L2 Durable Storage
  try {
    await (prisma as any).apiIdempotencyKey.upsert({
      where: { key: cacheKey },
      create: {
        key: cacheKey,
        userId,
        scope,
        method,
        endpoint,
        bodyHash: record.bodyHash,
        statusCode: record.status,
        response: record.body as any,
        expiresAt,
      },
      update: {
        bodyHash: record.bodyHash,
        statusCode: record.status,
        response: record.body as any,
        expiresAt,
      },
    });
  } catch (dbErr) {
    logger.warn('[idempotency] Database persistence error (in-memory cached)', { error: String(dbErr) });
  }
}

export const idempotency = (options: IdempotencyOptions) => {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Only safe for mutating requests.
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const key = extractKey(req);
    if (!key) {
      // No key supplied — pass through.
      return next();
    }

    const userScope = req.userId ?? 'anon';
    const resourceId = (req.params && typeof req.params.id === 'string') ? req.params.id.trim() : '';
    // Fully qualified, user & resource scoped idempotency key
    const cacheKey = `idem:${userScope}:${req.method}:${options.scope}:${resourceId}:${key}`;
    const bodyHash = hashBody(req.body);

    // 1. Check in-flight lock: if an identical request is actively executing right now,
    // wait for it rather than creating a concurrent race condition.
    const inFlightPromise = inFlightRequests.get(cacheKey);
    if (inFlightPromise) {
      try {
        const inFlightResult = await inFlightPromise;
        res.setHeader('Idempotent-Replay', 'true');
        return res.status(inFlightResult.status).json(inFlightResult.body);
      } catch {
        // In-flight request errored out, proceed with fresh execution
      }
    }

    // 2. Check durable multi-tier store (Redis -> PostgreSQL -> Memory)
    const cachedRecord = await getStoredIdempotencyRecord(cacheKey);

    if (cachedRecord) {
      // Key reuse with a different payload is a conflict
      if (cachedRecord.bodyHash !== bodyHash) {
        return res.status(409).json({
          success: false,
          error: 'Idempotency-Key was reused with a different request body.',
          code: 'IDEMPOTENCY_KEY_CONFLICT',
        });
      }

      res.setHeader('Idempotent-Replay', 'true');
      return res.status(cachedRecord.status).json(cachedRecord.body);
    }

    // Set up in-flight resolver
    let resolveInFlight!: (val: { status: number; body: unknown }) => void;
    let rejectInFlight!: (err: unknown) => void;
    const currentInFlight = new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      resolveInFlight = resolve;
      rejectInFlight = reject;
    });
    inFlightRequests.set(cacheKey, currentInFlight);

    // Intercept the response to capture result and cache it
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      inFlightRequests.delete(cacheKey);

      // Only cache 2xx responses — never cache errors
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const record: IdempotentRecord = {
          status: res.statusCode,
          body,
          bodyHash,
          expiresAt: Date.now() + ttl * 1000,
        };

        // Persist to Postgres L2 + Redis L1 + Local RAM L0
        void saveIdempotencyRecord(
          cacheKey,
          record,
          userScope,
          req.method,
          req.originalUrl || req.baseUrl || options.scope,
          options.scope,
          ttl,
        );

        resolveInFlight({ status: res.statusCode, body });
      } else {
        rejectInFlight(new Error(`Request failed with status ${res.statusCode}`));
      }

      return originalJson(body);
    };

    res.on('close', () => {
      inFlightRequests.delete(cacheKey);
    });

    return next();
  };
};
