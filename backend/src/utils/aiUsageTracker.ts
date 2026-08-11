/**
 * Per-user AI usage quota tracker.
 *
 * Enforces daily limits on Gemini / OCR calls to:
 *  - Protect the project's API budget
 *  - Prevent a single user from exhausting shared quota
 *
 * Uses Redis when available; falls back to an in-memory Map.
 */

import { cacheGetJson, getRedisClient } from '../cache/redis';
import { logger } from '../config/logger';

/** Max AI (Gemini / OCR) calls a single user can make per day. */
const DEFAULT_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT_PER_USER || 50);

/** TTL for the counter key (seconds)  24 h with a small buffer. */
const TTL_SECONDS = 86_400 + 60; // 24 h + 1 min

/** In-memory fallback when Redis is unavailable. */
const memoryCounters = new Map<string, { count: number; resetsAt: number }>();

function memoryKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `ai_usage:${userId}:${day}`;
}

/** Get current usage count for a user (today). */
export async function getAIUsage(userId: string): Promise<number> {
  const key = memoryKey(userId);
  const redis = getRedisClient();

  if (redis) {
    try {
      const cached = await cacheGetJson<{ count: number }>(key);
      return cached?.count ?? 0;
    } catch {
      // fall through to memory
    }
  }

  const entry = memoryCounters.get(key);
  if (!entry || entry.resetsAt <= Date.now()) return 0;
  return entry.count;
}

/** Increment usage and return `{ allowed, remaining, limit }`. */
export async function incrementAIUsage(
  userId: string,
  limit: number = DEFAULT_DAILY_LIMIT,
): Promise<{ allowed: boolean; remaining: number; limit: number; current: number }> {
  const key = memoryKey(userId);
  const redis = getRedisClient();

  let current = 0;

  if (redis) {
    try {
      const raw = await redis.incr(key);
      if (raw === 1) {
        // First call today  set expiry
        await redis.expire(key, TTL_SECONDS);
      }
      current = raw;
    } catch {
      // fall through to in-memory
      current = incrementMemory(key);
    }
  } else {
    current = incrementMemory(key);
  }

  const allowed = current <= limit;
  const remaining = Math.max(0, limit - current);

  if (!allowed) {
    logger.warn('AI usage limit reached', { userId, current, limit });
  }

  return { allowed, remaining, limit, current };
}

function incrementMemory(key: string): number {
  const now = Date.now();
  const entry = memoryCounters.get(key);

  if (!entry || entry.resetsAt <= now) {
    const resetsAt = now + TTL_SECONDS * 1_000;
    memoryCounters.set(key, { count: 1, resetsAt });
    return 1;
  }

  entry.count += 1;
  return entry.count;
}

/** Expose quota info via health/admin endpoints. */
export async function getAIQuotaInfo(userId: string): Promise<{
  used: number;
  remaining: number;
  limit: number;
}> {
  const limit = DEFAULT_DAILY_LIMIT;
  const used = await getAIUsage(userId);
  return { used, remaining: Math.max(0, limit - used), limit };
}
