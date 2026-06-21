/**
 * Server-side PIN-unlock enforcement.
 *
 * The app PIN is a real security control, not just a client-side UI lock: the
 * backend will not serve financial data until the user has proven PIN possession
 * (POST /pin/verify) recently. Without this, anyone holding a valid access token
 * could call /accounts, /transactions, etc. directly and bypass the PIN.
 *
 * Storage: a per-user "PIN unlocked" marker with a sliding TTL (the PIN re-lock
 * window). Established on a successful /pin/verify (or /pin/create), refreshed on
 * every accepted gated request, and dropped on logout. Redis when available
 * (multi-instance safe), in-memory fallback otherwise.
 *
 * Rollout: OFF by default (fail-open) so the mechanism can ship inert. Enable by
 * setting PIN_GATE_ENABLED=true once the client handles the 403 re-lock. The
 * window is PIN_GATE_TIMEOUT_MINUTES (default 5, matching the client auto-lock).
 */
import { getRedisClient, getRedisStatus } from '../cache/redis';
import { logger } from '../config/logger';

const PIN_GATE_ENABLED = process.env.PIN_GATE_ENABLED === 'true';
const PIN_GATE_TIMEOUT_MINUTES = Number(process.env.PIN_GATE_TIMEOUT_MINUTES || 5);
const PIN_GATE_TIMEOUT_MS = PIN_GATE_TIMEOUT_MINUTES * 60 * 1000;
const PIN_GATE_TIMEOUT_SECONDS = Math.max(1, Math.ceil(PIN_GATE_TIMEOUT_MS / 1000));
const KEY_PREFIX = 'pinunlock:';

// In-memory fallback when Redis is not connected. Maps userId -> lastSeen (ms).
const memoryStore = new Map<string, number>();
const MEMORY_PRUNE_THRESHOLD = 5000;

export const isPinGateEnabled = (): boolean =>
  PIN_GATE_ENABLED && process.env.NODE_ENV !== 'test';

const redisReady = (): boolean => getRedisStatus() === 'connected' && !!getRedisClient();

const pruneMemory = () => {
  if (memoryStore.size < MEMORY_PRUNE_THRESHOLD) return;
  const cutoff = Date.now() - PIN_GATE_TIMEOUT_MS;
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
  if (Date.now() - v > PIN_GATE_TIMEOUT_MS) {
    memoryStore.delete(userId);
    return null;
  }
  return v;
};

const writeMarker = async (userId: string, ts: number): Promise<void> => {
  if (redisReady()) {
    try {
      await getRedisClient()!.set(KEY_PREFIX + userId, String(ts), 'EX', PIN_GATE_TIMEOUT_SECONDS);
      return;
    } catch {
      // fall through to in-memory store
    }
  }
  pruneMemory();
  memoryStore.set(userId, ts);
};

/** Mark the user as PIN-unlocked. Call on a successful /pin/verify or /pin/create. */
export const establishPinUnlock = async (userId: string): Promise<void> => {
  if (!userId) return;
  try {
    await writeMarker(userId, Date.now());
  } catch (err) {
    logger.warn('Failed to establish PIN-unlock marker', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

/** Drop the marker (e.g. on logout / explicit lock) so the next gated request re-locks. */
export const clearPinUnlock = async (userId: string): Promise<void> => {
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

/**
 * Read-only check of whether the user holds a live PIN unlock — does NOT slide
 * the window (used by reads like /auth/profile that shouldn't extend the data
 * window). Returns true (fail-open) when the gate is disabled or on error.
 */
export const isPinUnlocked = async (userId: string): Promise<boolean> => {
  if (!isPinGateEnabled() || !userId) return true;
  try {
    return (await readMarker(userId)) !== null;
  } catch {
    return true;
  }
};

/**
 * Whether the user currently holds a live PIN-unlock, sliding the window forward
 * when they do. Returns true (fail-open) when the gate is disabled or on storage
 * failure — a backend hiccup must never lock real users out of their own data.
 */
export const evaluatePinUnlock = async (userId: string): Promise<boolean> => {
  if (!isPinGateEnabled() || !userId) return true;

  let marker: number | null;
  try {
    marker = await readMarker(userId);
  } catch (err) {
    logger.warn('PIN-unlock read failed; allowing request', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }

  if (marker !== null) {
    await writeMarker(userId, Date.now()); // slide
    return true;
  }
  return false;
};
