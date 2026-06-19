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

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,                  // Allow over HTTP in dev for localhost.
  sameSite: isProd ? 'strict' : 'lax',
  path: '/api/v1/auth',            // Scope to auth routes only.
  domain: COOKIE_DOMAIN,
};

export const setRefreshCookie = (res: Response, token: string, ttlSeconds: number): void => {
  res.cookie(COOKIE_NAME, token, {
    ...baseCookieOptions,
    maxAge: ttlSeconds * 1000,
  });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(COOKIE_NAME, baseCookieOptions);
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

