/**
 * PII / secret redaction utilities for structured logs.
 *
 * Used by Winston format to deep-scrub log payloads of:
 *  - passwords, PINs, OTPs, challenge codes
 *  - JWT tokens, refresh tokens, API keys
 *  - Authorization headers, cookies
 *  - financial-account secrets (PAN, Aadhaar, CVV, cardNumber, etc.)
 *
 * Strategy:
 *  - Match by key name (case-insensitive contains) — catches `password`,
 *    `Password`, `userPassword`, `hashedPin`, `accessToken`, etc.
 *  - Match by header key for HTTP-style payloads.
 *  - Truncate long string values that *look* like tokens (>=40 chars,
 *    base64/hex/dot-separated) even if the key is unknown.
 *
 * Replacement value: `[REDACTED]`.
 *
 * Performance: O(n) over the keys of the payload. Safe to call on
 * arbitrary objects (handles arrays, nested objects, primitives).
 */

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /^pin$/i,
  /pin[_-]?hash/i,
  /hashed[_-]?pin/i,
  /^otp$/i,
  /otp[_-]?code/i,
  /challenge[_-]?code/i,
  /token$/i,
  /^auth/i,
  /authorization/i,
  /cookie/i,
  /secret/i,
  /api[_-]?key/i,
  /jwt/i,
  /refresh[_-]?token/i,
  /access[_-]?token/i,
  /session[_-]?id/i,
  /cvv|cvc/i,
  /card[_-]?number/i,
  /\bpan\b/i,
  /aadhaar/i,
  /ssn/i,
  /private[_-]?key/i,
];

const REDACTED = '[REDACTED]';
const TOKEN_LIKE = /^(eyJ[\w-]+\.[\w-]+\.[\w-]+|[A-Za-z0-9+/=]{40,}|[A-Fa-f0-9]{40,})$/;

const isSensitiveKey = (key: string): boolean =>
  SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));

export const redact = (value: unknown, depth = 0): unknown => {
  // Guard against pathological recursion / circular refs.
  if (depth > 8) return value;

  if (value == null) return value;

  if (typeof value === 'string') {
    return TOKEN_LIKE.test(value) ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }

  return value;
};

