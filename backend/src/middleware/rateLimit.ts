import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { audit } from '../utils/auditLogger';
import { getPurposeClient, getPurposeStatus } from '../config/redis-connections';

// Rate-limit counters live on the dedicated RATE_LIMIT logical DB (db3).
const getRedisClient = () => getPurposeClient('ratelimit');
const getRedisStatus = () => getPurposeStatus('ratelimit');

type RateLimitOptions = {
  windowMs: number;
  max: number;
  scope?: string;
  keyGenerator?: (req: Request) => string;
  message?: string;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup of expired buckets to prevent memory leaks.
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

/** Try Redis INCR with TTL; returns null when Redis is unavailable. */
async function redisIncrement(
  key: string,
  windowMs: number,
  max: number,
): Promise<{ count: number; resetAt: number } | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  if (getRedisStatus() !== 'connected') return null;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      // First request in the window: set the TTL; reset time is known exactly.
      await redis.pexpire(key, windowMs);
      return { count, resetAt: Date.now() + windowMs };
    }
    // Only pay for a PTTL round-trip when we actually need an accurate reset —
    // i.e. the caller is about to return 429. On the common under-limit path we
    // approximate the reset header, halving Redis commands per request.
    if (count > max) {
      const pttl = await redis.pttl(key);
      return { count, resetAt: Date.now() + Math.max(pttl, 0) };
    }
    return { count, resetAt: Date.now() + windowMs };
  } catch {
    return null; // fall back to in-memory
  }
}

export const rateLimit = ({ windowMs, max, scope = 'global', keyGenerator, message }: RateLimitOptions) =>
  async (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting in test/development environments
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      return next();
    }

    const rawKey = keyGenerator?.(req) || req.ip || 'anonymous';
    const key = `rl:${scope}:${rawKey}`;
    const now = Date.now();

    // Try Redis first (persistent across restarts / instances)
    let count: number;
    let resetAt: number;
    const redisResult = await redisIncrement(key, windowMs, max);

    if (redisResult) {
      count = redisResult.count;
      resetAt = redisResult.resetAt;
    } else {
      // In-memory fallback
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        resetAt = now + windowMs;
        buckets.set(key, { count: 1, resetAt });
        count = 1;
      } else {
        bucket.count += 1;
        count = bucket.count;
        resetAt = bucket.resetAt;
      }
    }

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (count > max) {
      const retryAfter = Math.ceil((resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      audit({
        event: 'security.rate_limit_hit',
        ip: req.ip || undefined,
        action: `${req.method} ${req.path}`,
        meta: { scope, key: rawKey, limit: max },
      });
      return res.status(429).json({ error: message || 'Too many requests. Please try again later.' });
    }

    return next();
  };

export const authenticatedRateLimit = (options: Omit<RateLimitOptions, 'keyGenerator'>) =>
  rateLimit({
    ...options,
    keyGenerator: (req) => {
      const authReq = req as Request & { userId?: string; user?: { id?: string } };
      let userId = authReq.userId || authReq.user?.id;

      if (!userId) {
        const bearerToken = req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice('Bearer '.length).trim()
          : '';
        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

        if (bearerToken && secret) {
          try {
            const decoded = jwt.verify(bearerToken, secret) as { userId?: string; id?: string };
            userId = decoded.userId || decoded.id;
          } catch {
            // Fallback to IP-based throttling for invalid/expired tokens.
          }
        }
      }

      const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'anonymous';
      return userId ? `user:${userId}` : `ip:${ip}`;
    },
  });
