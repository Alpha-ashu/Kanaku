/**
 * Server-side idle-session enforcement.
 *
 * Access tokens are short-lived (15 min) and the client auto-locks after
 * inactivity, but a *stolen* token — especially the 7-day refresh token —
 * could otherwise be replayed from another machine long after the real user
 * walked away. This module enforces a sliding inactivity window on the SERVER:
 * if no authenticated request is seen for IDLE_TIMEOUT_MINUTES, the session is
 * considered idle and both API calls and token refresh are rejected until the
 * user signs in again.
 *
 * Storage: a per-user "last activity" marker with a TTL equal to the idle
 * window, refreshed on every accepted request (sliding). Redis is used when
 * available (multi-instance safe); otherwise an in-memory map is the fallback
 * (single-instance). When the feature is disabled (IDLE_TIMEOUT_MINUTES
 * unset/0) or under tests, every check passes (fail-open) so nothing breaks in
 * environments that have not opted in.
 *
 * Enable by setting IDLE_TIMEOUT_MINUTES (e.g. 10) in the backend environment.
 */
import { getRedisClient, getRedisStatus } from '../cache/redis';
import { logger } from '../config/logger';
import { env } from '../config/env';

const IDLE_TIMEOUT_MINUTES = Number(env.IDLE_TIMEOUT_MINUTES || 0);
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
const IDLE_TIMEOUT_SECONDS = Math.max(1, Math.ceil(IDLE_TIMEOUT_MS / 1000));
const KEY_PREFIX = 'idle:';

// In-memory fallback when Redis is not connected. Maps userId -> lastSeen (ms).
const memoryStore = new Map<string, number>();
const MEMORY_PRUNE_THRESHOLD = 5000;

export const isIdleTimeoutEnabled = (): boolean =>
  IDLE_TIMEOUT_MINUTES > 0 && process.env.NODE_ENV !== 'test';

const redisReady = (): boolean => getRedisStatus() === 'connected' && !!getRedisClient();

const pruneMemory = () => {
  if (memoryStore.size < MEMORY_PRUNE_THRESHOLD) return;
  const cutoff = Date.now() - IDLE_TIMEOUT_MS;
  for (const [k, v] of memoryStore) {
    if (v < cutoff) memoryStore.delete(k);
  }
};

const readMarker = async (userId: string): Promise<number | null> => {
  if (redisReady()) {
    try {
      const raw = await getRedisClient()!.get(KEY_PREFIX + userId);
      return raw ? Number(raw) : null;
    } catch {
      // fall through to in-memory store
    }
  }
  const v = memoryStore.get(userId);
  if (v === undefined) return null;
  // Honour TTL semantics on the in-memory path (Redis does this for us via EX).
  if (Date.now() - v > IDLE_TIMEOUT_MS) {
    memoryStore.delete(userId);
    return null;
  }
  return v;
};

const writeMarker = async (userId: string, ts: number): Promise<void> => {
  if (redisReady()) {
    try {
      await getRedisClient()!.set(KEY_PREFIX + userId, String(ts), 'EX', IDLE_TIMEOUT_SECONDS);
      return;
    } catch {
      // fall through to in-memory store
    }
  }
  pruneMemory();
  memoryStore.set(userId, ts);
};

/** Record activity / (re)start the sliding window. Call on login & refresh. */
export const establishIdleSession = async (userId: string): Promise<void> => {
  if (!isIdleTimeoutEnabled() || !userId) return;
  try {
    await writeMarker(userId, Date.now());
  } catch (err) {
    logger.warn('Failed to establish idle-session marker', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

/** Drop the marker so the next request is treated as a brand-new session. */
export const clearIdleSession = async (userId: string): Promise<void> => {
  if (!userId) return;
  if (redisReady()) {
    try {
      await getRedisClient()!.del(KEY_PREFIX + userId);
    } catch {
      // best-effort
    }
  }
  memoryStore.delete(userId);
};

interface IdleEvalOptions {
  /**
   * When true, a token whose `iat` is within the idle window is allowed even
   * with no marker present — this covers a freshly issued access token (the
   * first request right after login, including Supabase-issued tokens that
   * never hit our /login controller). The refresh path passes false: an active
   * session must have a *live* marker, so an idle refresh token is rejected
   * even though it is long-lived and still cryptographically valid.
   */
  allowFreshTokenGrace: boolean;
  /** JWT `iat` claim in seconds, when available. */
  iatSeconds?: number;
}

/**
 * Decide whether a request may proceed, sliding the window forward when it may.
 * Returns false only when the session has been idle beyond the window.
 */
export const evaluateIdleSession = async (
  userId: string,
  options: IdleEvalOptions,
): Promise<boolean> => {
  if (!isIdleTimeoutEnabled() || !userId) return true;

  const now = Date.now();
  let marker: number | null;
  try {
    marker = await readMarker(userId);
  } catch (err) {
    // Storage failure must not lock real users out — fail open.
    logger.warn('Idle-session read failed; allowing request', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }

  if (marker !== null) {
    // Activity seen within the window — slide it forward.
    await writeMarker(userId, now);
    return true;
  }

  // No marker: either a brand-new session or an expired (idle) one.
  if (options.allowFreshTokenGrace && typeof options.iatSeconds === 'number') {
    const tokenAgeMs = now - options.iatSeconds * 1000;
    if (tokenAgeMs <= IDLE_TIMEOUT_MS) {
      // Freshly issued token — establish the marker and allow.
      await writeMarker(userId, now);
      return true;
    }
  }

  return false;
};
