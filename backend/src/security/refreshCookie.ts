/**
 * Refresh-token cookie helpers.
 *
 * Refresh tokens MUST live in an `HttpOnly; Secure; SameSite=Strict`
 * cookie so JavaScript on the page can never read them — even if an
 * attacker lands an XSS payload, the refresh token cannot be
 * exfiltrated. Access tokens stay in memory only (never localStorage).
 *
 * This file provides:
 *   - `setRefreshCookie(res, token, ttlSeconds)` — emits the cookie.
 *   - `clearRefreshCookie(res)` — invalidates it on logout / rotation.
 *   - `readRefreshCookie(req)` — parses it from the incoming request.
 *
 * We do NOT pull in `cookie-parser`; for a single named cookie a tiny
 * regex parser is plenty and keeps dependency surface minimal.
 *
 * Configure via env:
 *   REFRESH_COOKIE_NAME   (default: "kanaku_rt")
 *   REFRESH_COOKIE_DOMAIN (optional — set for prod multi-host setups)
 *
 * IMPORTANT: The CORS config in `app.ts` already sends
 * `Access-Control-Allow-Credentials: true`; combined with `credentials:
 * 'include'` on the frontend `fetch`, the browser will send the cookie
 * to `/api/v1/auth/refresh`.
 */

import type { Request, Response, CookieOptions } from 'express';

const COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'kanaku_rt';
const COOKIE_DOMAIN = process.env.REFRESH_COOKIE_DOMAIN || undefined;
const isProd = process.env.NODE_ENV === 'production';

// SameSite policy. Default: 'strict' in prod (strongest CSRF posture for the
// same-origin web app), 'lax' in dev. Override with REFRESH_COOKIE_SAMESITE —
// set it to 'none' if cross-site auth is required (e.g. the native Capacitor
// webview calling the API cross-origin); browsers only honour SameSite=None
// when the cookie is also Secure, which we enforce below.
const SAME_SITE = (() => {
  const v = (process.env.REFRESH_COOKIE_SAMESITE || '').toLowerCase();
  if (v === 'none' || v === 'lax' || v === 'strict') return v as 'none' | 'lax' | 'strict';
  return isProd ? 'strict' : 'lax';
})();

// Secure is REQUIRED under HTTPS (all prod traffic) and whenever SameSite=None.
// It is omitted only on local dev over plain HTTP, where browsers reject Secure
// cookies. This is what makes the refresh cookie `HttpOnly; Secure; SameSite`.
const COOKIE_SECURE = isProd || SAME_SITE === 'none';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: SAME_SITE,
  path: '/api/v1/auth',            // Scope to auth routes only.
  domain: COOKIE_DOMAIN,
};

const getDynamicSecureOption = (res: Response): boolean => {
  return true;
};

export const setRefreshCookie = (res: Response, token: string, ttlSeconds: number): void => {
  res.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions,
    secure: getDynamicSecureOption(res),
    maxAge: ttlSeconds * 1000,
  });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(COOKIE_NAME, {
    ...baseCookieOptions,
    secure: getDynamicSecureOption(res),
  });
};

/**
 * Parse the refresh cookie out of `Cookie:` header.
 * Returns `null` if missing or empty.
 */
export const readRefreshCookie = (req: Request): string | null => {
  const header = req.headers.cookie;
  if (!header || typeof header !== 'string') return null;

  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    if (name !== COOKIE_NAME) continue;
    const value = pair.slice(idx + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
};

export const REFRESH_COOKIE_NAME = COOKIE_NAME;

