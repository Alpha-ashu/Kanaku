/**
 * Bridges the client-side PIN unlock and the server-side PIN gate.
 *
 * Two facts are in tension:
 *
 *  1. The lock screen unlocks on LOCAL proof and does not wait for the network —
 *     blocking the keypad on a round trip against a cold backend froze it for the
 *     better part of a minute (see PINAuth.handleSubmit).
 *  2. The backend `pinGate` only opens once POST /pin/verify has landed and
 *     called establishPinUnlock().
 *
 * So there is a window, right after unlock, where the UI is open but the server
 * still answers 403 PIN_VERIFICATION_REQUIRED. Treating that 403 as "re-lock the
 * app" turns the window into a loop: unlock → sync → 403 → lock → unlock → …
 *
 * This module lets the API layer tell the two apart. While a verify is in flight,
 * a 403 means "not yet", not "locked" — the caller awaits the verify and retries
 * once. Only a 403 with no verify pending (or a failed one) is a genuine re-lock.
 *
 * Deliberately dependency-free: pinService already imports the API client, so
 * anything shared between them has to live outside both to avoid a cycle.
 */

let inFlightVerify: Promise<boolean> | null = null;

// ── PIN-unlock token ─────────────────────────────────────────────────────────
//
// Issued by POST /pin/verify, sent back on every request as `X-Pin-Unlock`, and
// re-issued by the server on each accepted response — that re-issue is what
// slides the re-lock window with activity.
//
// Persisted (not just in-memory) so a page reload inside an active window does
// not fall back to the slower server-side lastVerifiedAt lookup. It is a
// short-lived, PIN-scoped proof, not a credential on its own: every gated route
// still independently requires a valid access token.
const UNLOCK_TOKEN_KEY = 'KANAKU_pin_unlock_token';

let memoryUnlockToken: string | null = null;

const storage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const setPinUnlockToken = (token: string | null): void => {
  memoryUnlockToken = token;
  try {
    if (token) storage()?.setItem(UNLOCK_TOKEN_KEY, token);
    else storage()?.removeItem(UNLOCK_TOKEN_KEY);
  } catch {
    /* storage unavailable — the in-memory copy still works for this session */
  }
};

export const getPinUnlockToken = (): string | null => {
  if (memoryUnlockToken) return memoryUnlockToken;
  try {
    memoryUnlockToken = storage()?.getItem(UNLOCK_TOKEN_KEY) ?? null;
  } catch {
    memoryUnlockToken = null;
  }
  return memoryUnlockToken;
};

export const clearPinUnlockToken = (): void => setPinUnlockToken(null);

/**
 * Registers the in-flight /pin/verify. `promise` should resolve true when the
 * server accepted the PIN (server-side unlock established).
 */
export const trackPinVerify = (promise: Promise<boolean>): void => {
  inFlightVerify = promise;
  // Clear only if we are still the current attempt — a newer verify wins.
  const settle = () => {
    if (inFlightVerify === promise) inFlightVerify = null;
  };
  promise.then(settle, settle);
};

/** True while a /pin/verify is still outstanding. */
export const isPinVerifyInFlight = (): boolean => inFlightVerify !== null;

/**
 * Awaits an outstanding /pin/verify.
 *
 * Returns true if one was pending AND it established the server-side unlock, so
 * the caller should retry. Returns false when nothing was pending or the verify
 * failed — in which case the 403 is real and the app should re-lock.
 */
export const awaitPinUnlock = async (): Promise<boolean> => {
  const pending = inFlightVerify;
  if (!pending) return false;
  try {
    return await pending;
  } catch {
    return false;
  }
};

/** Drops any tracked verify and the unlock token (sign-out / explicit lock). */
export const resetPinUnlockTracking = (): void => {
  inFlightVerify = null;
  clearPinUnlockToken();
};
