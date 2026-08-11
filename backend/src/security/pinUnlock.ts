/**
 * Server-side PIN-unlock enforcement.
 *
 * The app PIN is a real security control, not just a client-side UI lock: the
 * backend will not serve financial data until the user has proven PIN possession
 * (POST /pin/verify) recently. Without this, anyone holding a valid access token
 * could call /accounts, /transactions, etc. directly and bypass the PIN.
 *
 * ── Why this is token-based rather than a server-side marker ──
 *
 * The original implementation kept the unlock in Redis, falling back to a
 * per-process Map. Redis was subsequently removed from this codebase for good
 * (config/redis-connections.ts reports 'disabled' unconditionally), which left
 * the in-memory Map as the only path — and that is not a viable place to keep an
 * authorization decision:
 *
 *   • it evaporates on every restart, and the Render free plan sleeps after
 *     15 min idle, so every cold start would silently re-lock every user;
 *   • it is per-process, so it breaks the moment the service runs more than one
 *     instance.
 *
 * Both failure modes push a 403 at a client that believes it is unlocked. So the
 * unlock is now carried by a short-lived signed token instead:
 *
 *   1. POST /pin/verify (or /pin/create) issues a `pin_unlock` JWT whose lifetime
 *      is the re-lock window.
 *   2. The client sends it back as `X-Pin-Unlock` on every request.
 *   3. pinGate verifies it and re-issues a refreshed one on the response, which
 *      is what makes the window *slide* with activity.
 *
 * That is stateless: restart-proof, multi-instance-safe, and needs no Redis and
 * no schema change. As a safety net, a request arriving without a usable token
 * falls back to the durable `UserPin.lastVerifiedAt` column, so a client that
 * lost its token (reload, storage cleared) recovers without re-prompting.
 *
 * Rollout: controlled by PIN_GATE_ENABLED. The window is PIN_GATE_TIMEOUT_MINUTES
 * (default 5, matching the client auto-lock).
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

const PIN_GATE_ENABLED = process.env.PIN_GATE_ENABLED === 'true';
const PIN_GATE_TIMEOUT_MINUTES = Number(process.env.PIN_GATE_TIMEOUT_MINUTES || 5);
const PIN_GATE_TIMEOUT_MS = Math.max(60_000, PIN_GATE_TIMEOUT_MINUTES * 60 * 1000);
const PIN_GATE_TIMEOUT_SECONDS = Math.ceil(PIN_GATE_TIMEOUT_MS / 1000);

export const PIN_UNLOCK_HEADER = 'x-pin-unlock';
const TOKEN_TYPE = 'pin_unlock';

/**
 * Signing key. Deliberately the same resolution order as the step-up security
 * token (middleware/securityGate.ts) so a deployment that can issue one can
 * issue the other — one fewer secret to get wrong.
 */
const getUnlockSecret = (): string => {
  const envSecret =
    process.env.SECURITY_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET;

  if (envSecret) return envSecret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL CONFIGURATION ERROR: PIN gate requires SECURITY_JWT_SECRET (or JWT_SECRET) in production. ' +
      'Startup aborted rather than issuing unlock tokens under a per-boot random key, which would ' +
      're-lock every user on each container cycle.',
    );
  }

  logger.warn('[pinUnlock] No JWT secret configured; using a per-boot random key (non-production only).');
  return crypto.randomBytes(32).toString('hex');
};

let cachedSecret: string | null = null;
const unlockSecret = (): string => {
  if (!cachedSecret) cachedSecret = getUnlockSecret();
  return cachedSecret;
};

export const isPinGateEnabled = (): boolean =>
  PIN_GATE_ENABLED && process.env.NODE_ENV !== 'test';

/** Milliseconds a PIN unlock stays valid without further activity. */
export const getPinGateWindowMs = (): number => PIN_GATE_TIMEOUT_MS;

// ── Token issue / verify ─────────────────────────────────────────────────────

/**
 * Mints an unlock token for `userId`. Returns null when the gate is disabled, so
 * callers can pass the result straight through without branching.
 */
export const issuePinUnlockToken = (userId: string): string | null => {
  if (!userId || !isPinGateEnabled()) return null;
  try {
    return jwt.sign({ sub: userId, type: TOKEN_TYPE }, unlockSecret(), {
      expiresIn: PIN_GATE_TIMEOUT_SECONDS,
    });
  } catch (err) {
    logger.warn('[pinUnlock] Failed to issue unlock token', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
};

/** True when `token` is a live unlock token belonging to `userId`. */
export const verifyPinUnlockToken = (token: string | undefined, userId: string): boolean => {
  if (!token || !userId) return false;
  try {
    const decoded = jwt.verify(token, unlockSecret()) as jwt.JwtPayload;
    return decoded?.type === TOKEN_TYPE && decoded?.sub === userId;
  } catch {
    // Expired or tampered — treated as "no token", so the DB fallback still runs.
    return false;
  }
};

// ── Durable fallback ─────────────────────────────────────────────────────────

/**
 * Was this user's last successful /pin/verify inside the window?
 *
 * `lastVerifiedAt` is written by pin.service on every successful verify/create,
 * so it survives restarts and is shared across instances. This is the recovery
 * path for a client whose token was lost, and it never *extends* the window —
 * only a real verify moves it.
 */
const hasRecentVerification = async (userId: string): Promise<boolean> => {
  try {
    const record = await prisma.userPin.findUnique({
      where: { userId },
      select: { lastVerifiedAt: true, isActive: true },
    });

    const lastVerifiedAt = record?.lastVerifiedAt;
    if (!record?.isActive || !lastVerifiedAt) return false;

    return Date.now() - new Date(lastVerifiedAt).getTime() <= PIN_GATE_TIMEOUT_MS;
  } catch (err) {
    // Fail OPEN on storage failure — a DB hiccup must never lock real users out
    // of their own money.
    logger.warn('[pinUnlock] lastVerifiedAt lookup failed; allowing request', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
};

// ── Public API ───────────────────────────────────────────────────────────────

export interface PinUnlockEvaluation {
  unlocked: boolean;
  /** A refreshed token to hand back on the response, when one was established. */
  refreshedToken: string | null;
}

/**
 * Decides whether a gated request may proceed, and returns the token to echo
 * back so the window slides with activity.
 */
export const evaluatePinUnlockRequest = async (
  userId: string,
  presentedToken: string | undefined,
): Promise<PinUnlockEvaluation> => {
  if (!isPinGateEnabled() || !userId) {
    return { unlocked: true, refreshedToken: null };
  }

  if (verifyPinUnlockToken(presentedToken, userId)) {
    // Slide: a fresh token on every accepted request keeps an active session
    // alive without any server-side state.
    return { unlocked: true, refreshedToken: issuePinUnlockToken(userId) };
  }

  if (await hasRecentVerification(userId)) {
    return { unlocked: true, refreshedToken: issuePinUnlockToken(userId) };
  }

  return { unlocked: false, refreshedToken: null };
};

/**
 * Read-only check — does NOT slide the window. Used by reads such as
 * /auth/profile that decide how much PII to include without extending access.
 * Returns true (fail-open) when the gate is disabled.
 */
export const isPinUnlocked = async (userId: string, presentedToken?: string): Promise<boolean> => {
  if (!isPinGateEnabled() || !userId) return true;
  if (verifyPinUnlockToken(presentedToken, userId)) return true;
  return hasRecentVerification(userId);
};

/**
 * Mark the user as PIN-unlocked after a successful /pin/verify or /pin/create,
 * and return the token the client should carry.
 *
 * pin.service already stamps `lastVerifiedAt` as part of verification, so this
 * only needs to mint the token.
 */
export const establishPinUnlock = async (userId: string): Promise<string | null> => {
  if (!userId) return null;
  return issuePinUnlockToken(userId);
};

/**
 * Drop the unlock on logout / explicit lock.
 *
 * Unlock tokens are stateless and therefore not individually revocable; clearing
 * `lastVerifiedAt` removes the durable fallback so the *next* request cannot
 * recover an unlock from it. The token itself is bounded by its short expiry and
 * is discarded client-side on logout, and it is not a credential on its own —
 * every gated route still requires a valid access token.
 */
export const clearPinUnlock = async (userId: string): Promise<void> => {
  if (!userId) return;
  try {
    await prisma.userPin.updateMany({
      where: { userId },
      data: { lastVerifiedAt: null },
    });
  } catch (err) {
    logger.warn('[pinUnlock] Failed to clear PIN-unlock marker', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

/**
 * @deprecated Superseded by evaluatePinUnlockRequest, which also returns the
 * refreshed token. Retained for callers that only need the boolean.
 */
export const evaluatePinUnlock = async (userId: string): Promise<boolean> =>
  (await evaluatePinUnlockRequest(userId, undefined)).unlocked;
