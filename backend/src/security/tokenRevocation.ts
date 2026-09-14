/**
 * Server-side revocation of the tokens a client hands back at logout.
 *
 * Access (15 min) and refresh (7 day) tokens are stateless JWTs, so before this
 * a token captured before logout kept authenticating until its own expiry —
 * logging out only cleared the web cookie. Logout now records a SHA-256
 * fingerprint of every token it is presented with, until that token's `exp`;
 * the auth middleware, POST /auth/refresh and the socket handshake reject any
 * fingerprint on the list.
 *
 * Revocation is per token, not per user: signing out on one device does not
 * end the user's sessions elsewhere.
 *
 * Storage: in-process, like the idle-session and PIN-unlock fallbacks — the API
 * runs as a single instance. A restart forgets revocations, which then decay to
 * the previous behaviour (tokens valid until `exp`) rather than locking anyone
 * out. DB-backed refresh-token tracking (the unused RefreshToken model) remains
 * the long-term replacement.
 */
import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';

const revoked = new Map<string, number>(); // fingerprint -> expiry (ms)
const PRUNE_THRESHOLD = 5000;

const fingerprint = (token: string) => createHash('sha256').update(token).digest('hex');

const prune = () => {
  if (revoked.size < PRUNE_THRESHOLD) return;
  const now = Date.now();
  for (const [key, expiresAt] of revoked) {
    if (expiresAt <= now) revoked.delete(key);
  }
};

/** Revoke a token until it would have expired anyway. No-op for blank/expired tokens. */
export const revokeToken = (token: string | null | undefined): void => {
  const value = token?.trim();
  if (!value) return;
  const decoded = jwt.decode(value) as { exp?: number } | null;
  if (!decoded) return; // not a JWT — it could never authenticate
  const expiresAt = typeof decoded.exp === 'number'
    ? decoded.exp * 1000
    // Every token we mint carries exp; keep exp-less legacy tokens out for a refresh-token lifetime.
    : Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (expiresAt <= Date.now()) return;
  prune();
  revoked.set(fingerprint(value), expiresAt);
};

export const isTokenRevoked = (token: string | null | undefined): boolean => {
  const value = token?.trim();
  if (!value) return false;
  const key = fingerprint(value);
  const expiresAt = revoked.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    revoked.delete(key);
    return false;
  }
  return true;
};
