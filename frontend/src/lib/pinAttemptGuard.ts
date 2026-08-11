/**
 * Local brute-force throttle for the PIN lock screen.
 *
 * Context: `verifyPIN` is a pure local computation and the keypad auto-submits on
 * the 6th digit, so before this there was no attempt counter, no backoff and no
 * lockout anywhere on the client — a script could walk the whole 10^6 keyspace.
 * The server-side rate limit could not help either, because the unlock path
 * accepts a valid *local* verification without waiting for the server.
 *
 * Scope, honestly stated: this is a deterrent against casual and scripted retry,
 * not against an attacker who controls the device (they can clear localStorage).
 * The load-bearing defence is that the stored verifier is now salted PBKDF2 at
 * 100k iterations, which makes an offline sweep of the keyspace impractical.
 * This layer stops the *online* version of the same attack against a phone
 * someone picked up.
 */

const ATTEMPTS_KEY = 'KANAKU_pin_failed_attempts';
const LOCK_UNTIL_KEY = 'KANAKU_pin_locked_until';

/** Failures tolerated before any delay is applied. */
export const FREE_ATTEMPTS = 4;

/** Backoff applied to the 5th and subsequent consecutive failures, in ms. */
const BACKOFF_LADDER_MS = [
  30_000,      // 5th
  60_000,      // 6th
  5 * 60_000,  // 7th
  15 * 60_000, // 8th
  30 * 60_000, // 9th and beyond
];

const readInt = (key: string): number => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

const writeInt = (key: string, value: number): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage unavailable — throttling degrades to none, never blocks the user */
  }
};

export interface PinLockState {
  /** True while the keypad must stay disabled. */
  locked: boolean;
  /** Milliseconds until the lock lifts (0 when not locked). */
  remainingMs: number;
  /** Consecutive failures recorded so far. */
  attempts: number;
}

export const getPinLockState = (): PinLockState => {
  const attempts = readInt(ATTEMPTS_KEY);
  const lockedUntil = readInt(LOCK_UNTIL_KEY);
  const remainingMs = Math.max(0, lockedUntil - Date.now());

  return { locked: remainingMs > 0, remainingMs, attempts };
};

/**
 * Records one failed attempt and returns the resulting state.
 * Consecutive failures past FREE_ATTEMPTS arm an increasing lockout.
 */
export const recordPinFailure = (): PinLockState => {
  const attempts = readInt(ATTEMPTS_KEY) + 1;
  writeInt(ATTEMPTS_KEY, attempts);

  if (attempts <= FREE_ATTEMPTS) {
    return { locked: false, remainingMs: 0, attempts };
  }

  const ladderIndex = Math.min(attempts - FREE_ATTEMPTS - 1, BACKOFF_LADDER_MS.length - 1);
  const lockMs = BACKOFF_LADDER_MS[ladderIndex];
  writeInt(LOCK_UNTIL_KEY, Date.now() + lockMs);

  return { locked: true, remainingMs: lockMs, attempts };
};

/** Clears the counter after a successful unlock or a completed PIN reset. */
export const resetPinAttempts = (): void => {
  try {
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(LOCK_UNTIL_KEY);
  } catch {
    /* ignore */
  }
};

/** "1m 05s" / "45s" — for the lockout countdown copy. */
export const formatLockCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
};
