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
import { getPurposeClient, getPurposeStatus } from '../config/redis-connections';
import { logger } from '../config/logger';
import { env } from '../config/env';

// Idle-session markers live on the dedicated SESSION logical DB (db2).
const getRedisClient = () => getPurposeClient('session');
const getRedisStatus = () => getPurposeStatus('session');

const IDLE_TIMEOUT_MINUTES = Number(env.IDLE_TIMEOUT_MINUTES || 0);
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;
const IDLE_TIMEOUT_SECONDS = Math.max(1, Math.ceil(IDLE_TIMEOUT_MS / 1000));
const KEY_PREFIX = 'idle:';

// Throttle sliding writes: only re-persist the marker when it is older than this
// interval, to avoid a Redis SET on every authenticated request. Kept well under
// the window so the session still effectively slides for active users.
const SLIDE_INTERVAL_MS = Math.max(30_000, Math.min(IDLE_TIMEOUT_MS / 2, 5 * 60_000));

// In-memory fallback when Redis is not connected. Maps userId -> lastSeen (ms).
const memoryStore = new Map<string, number>();
const MEMORY_PRUNE_THRESHOLD = 5000;

/**
 * When this process started.
 *
 * Needed because a missing marker is ambiguous, and the two readings have
 * opposite correct responses:
 *
 *   "this user has not been seen inside the window"  -> end the session
 *   "this process has never seen ANY user"           -> say nothing about them
 *
 * With a durable store only the first is possible. Without one — and Redis is
 * now permanently absent, `getPurposeClient` returns null by design (see
 * config/redis-connections.ts) — every restart empties the map for everyone at
 * once, and the second reading is the true one.
 *
 * That matters on this deployment specifically: the API runs on Render's free
 * plan, which spins down after a period of inactivity and cold-starts on the
 * next request. Treating that restart as "everyone has been idle" would sign
 * out every active user several times a day, at times that track the server's
 * lifecycle and so look entirely random to them.
 */
const PROCESS_STARTED_AT = Date.now();

export const isIdleTimeoutEnabled = (): boolean =>
  IDLE_TIMEOUT_MINUTES > 0 && process.env.NODE_ENV !== 'test';

const redisReady = (): boolean => getRedisStatus() === 'connected' && !!getRedisClient();

/**
 * True when a missing marker cannot be trusted to mean "idle": there is no
 * durable store, and this process has not yet been running for long enough to
 * have watched a full idle window.
 */
const inColdStartGrace = (now: number): boolean =>
  !redisReady() && now - PROCESS_STARTED_AT < IDLE_TIMEOUT_MS;

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
    // Activity seen within the window — slide it forward, but throttle the write
    // so we don't issue a SET on every single request (only once per interval).
    if (now - marker >= SLIDE_INTERVAL_MS) {
      await writeMarker(userId, now);
    }
    return true;
  }

  // No marker: a brand-new session, an expired (idle) one, or a process that
  // has simply forgotten everyone.
  if (options.allowFreshTokenGrace && typeof options.iatSeconds === 'number') {
    const tokenAgeMs = now - options.iatSeconds * 1000;
    if (tokenAgeMs <= IDLE_TIMEOUT_MS) {
      // Freshly issued token — establish the marker and allow.
      await writeMarker(userId, now);
      return true;
    }
  }

  // Cold-start grace. Until this process has been up for a full idle window it
  // cannot have observed the window it is being asked to judge, so a missing
  // marker tells us nothing about this user. Adopt them instead of evicting
  // them, and let the window run from here.
  //
  // The security property survives in steady state: once uptime exceeds the
  // window, an absent marker really does mean the user was not seen, and the
  // check bites as designed. What is given up is the first window after a
  // restart — which is the correct trade, because the alternative is a control
  // so disruptive that it has to be switched off, and a control that is off
  // protects nothing at all.
  if (inColdStartGrace(now)) {
    logger.info('Idle-session cold-start grace applied', {
      userId,
      processUptimeMs: now - PROCESS_STARTED_AT,
      idleWindowMs: IDLE_TIMEOUT_MS,
    });
    await writeMarker(userId, now);
    return true;
  }

  return false;
};
