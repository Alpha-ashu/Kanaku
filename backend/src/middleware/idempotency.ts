/**
 * Idempotency middleware (fintech-grade).
 *
 * Honors the `Idempotency-Key` request header on mutating endpoints
 * (transactions, goal contributions, loan payments, bulk imports, etc.).
 *
 * Flow:
 *  1. Client sends `Idempotency-Key: <uuid>` on a mutating POST.
 *  2. We compute `idem:{userId}:{routeKey}:{key}` and look it up in Redis.
 *  3. Cache hit  immediately re-serve the original response (status + body).
 *  4. Cache miss  wrap `res.json/.send` so the first successful response
 *     (2xx) is stored in Redis with the configured TTL (default 24h).
 *
 * Failure modes:
 *  - Redis unavailable  middleware degrades open (request proceeds, but no
 *    replay protection). Logged at warn level.
 *  - Key conflict (same key, different request body hash)  HTTP 409.
 *
 * Why this matters:
 *  Network retries, mobile reconnects, and SyncEngine backoff can re-issue
 *  the same logical create (e.g. "Add 500 lunch"). Without idempotency we
 *  produce duplicate transactions, double-debit accounts, and corrupt
 *  balances. Body-side `dedupHash` is best-effort; this gives a guaranteed
 *  client-driven idempotency contract.
 */

import { createHash } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';
import { cacheGetJson, cacheSetJson, getRedisStatus } from '../cache/redis';
import { logger } from '../config/logger';

interface IdempotentRecord {
  status: number;
  body: unknown;
  bodyHash: string;
}

interface IdempotencyOptions {
  /** Logical route identifier — keeps keys scoped per endpoint */
  scope: string;
  /** Cache TTL in seconds. Default: 24h */
  ttlSeconds?: number;
  /** If true, allow request to continue when Redis is down. Default: true */
  failOpen?: boolean;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
const HEADER_NAMES = ['idempotency-key', 'x-idempotency-key'];

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
      // Cap to a sane length to prevent abusive keys.
      return value.trim().slice(0, 128);
    }
  }
  return null;
};

export const idempotency = (options: IdempotencyOptions) => {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const failOpen = options.failOpen !== false;

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Only safe for mutating requests.
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const key = extractKey(req);
    if (!key) {
      // No key supplied — pass through. (We do not force keys to remain
      // backward-compatible; clients SHOULD send one but legacy callers
      // can still operate.)
      return next();
    }

    const userScope = req.userId ?? 'anon';
    const cacheKey = `idem:${userScope}:${options.scope}:${key}`;
    const bodyHash = hashBody(req.body);

    // If Redis is down, fail open (or closed per config) so we never
    // strand a user mid-payment.
    if (getRedisStatus() !== 'connected') {
      if (!failOpen) {
        return res.status(503).json({
          success: false,
          error: 'Idempotency service temporarily unavailable. Please retry.',
          code: 'IDEMPOTENCY_UNAVAILABLE',
        });
      }
      logger.warn('[idempotency] Redis unavailable — bypassing replay cache', {
        scope: options.scope,
        userId: req.userId,
      });
      return next();
    }

    try {
      const cached = await cacheGetJson<IdempotentRecord>(cacheKey);
      if (cached) {
        // Key reuse with a *different* payload is a client bug — reject.
        if (cached.bodyHash !== bodyHash) {
          return res.status(409).json({
            success: false,
            error: 'Idempotency-Key was reused with a different request body.',
            code: 'IDEMPOTENCY_KEY_CONFLICT',
          });
        }

        res.setHeader('Idempotent-Replay', 'true');
        return res.status(cached.status).json(cached.body);
      }
    } catch (err) {
      logger.warn('[idempotency] cache lookup failed', {
        scope: options.scope,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fall through to normal processing.
    }

    // Intercept the first successful response and store it.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only cache 2xx responses — never cache errors.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const record: IdempotentRecord = {
          status: res.statusCode,
          body,
          bodyHash,
        };
        void cacheSetJson(cacheKey, record, ttl);
      }
      return originalJson(body);
    };

    return next();
  };
};

