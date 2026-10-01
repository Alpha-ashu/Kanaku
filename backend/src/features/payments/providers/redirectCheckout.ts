/**
 * Shared plumbing for redirect gateways (PhonePe, Paytm): the browser leaves the
 * app for the provider's payment page and is sent back afterwards.
 *
 *   - Where "back" is: the wallet page, with the order id, so the app can show
 *     the result (`purchaseReturnUrl`). Nothing is credited on the way back —
 *     the order settles from the provider's status API or a verified webhook.
 *   - Launch links: Paytm's page must be opened with a form POST, which a link
 *     (or the system browser the native app hands off to) cannot do. The API
 *     serves a tiny auto-submitting page instead, reachable only through a link
 *     signed for that one order and expiring with it.
 *   - The provider's redirect URL / transaction token only comes back from the
 *     create call; a retried "Buy" (double tap) replays the order without a new
 *     call, so the checkout is kept in memory for the order's lifetime. After a
 *     restart the order still settles — the app just polls its status.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const CHECKOUT_TTL_MS = 60 * 60_000;
const MAX_REMEMBERED = 5000;
const remembered = new Map<string, { value: Record<string, unknown>; expiresAt: number }>();

export function rememberCheckout(providerOrderId: string, value: Record<string, unknown>) {
  const now = Date.now();
  if (remembered.size >= MAX_REMEMBERED) {
    for (const [key, entry] of remembered) {
      if (entry.expiresAt <= now) remembered.delete(key);
    }
    if (remembered.size >= MAX_REMEMBERED) remembered.delete(remembered.keys().next().value as string);
  }
  remembered.set(providerOrderId, { value, expiresAt: now + CHECKOUT_TTL_MS });
}

export function recallCheckout(providerOrderId: string): Record<string, unknown> | null {
  const entry = remembered.get(providerOrderId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    remembered.delete(providerOrderId);
    return null;
  }
  return entry.value;
}

const trimSlash = (value: string) => value.replace(/\/+$/, '');

/** Public base URL of this API (Render sets RENDER_EXTERNAL_URL automatically). */
export const apiPublicBase = () => trimSlash(process.env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '');

/** Where the user's browser lands after paying: the wallet page, told which order to check. */
export const purchaseReturnUrl = (orderId: string) => {
  const base = trimSlash(process.env.PAYMENT_RETURN_URL || (process.env.FRONTEND_URL ? `${trimSlash(process.env.FRONTEND_URL)}/wallet` : ''));
  if (!base) return '';
  return `${base}${base.includes('?') ? '&' : '?'}purchase=${encodeURIComponent(orderId)}`;
};

const launchSecret = () => process.env.PAYMENT_LINK_SECRET || process.env.JWT_SECRET || '';

const sign = (payload: string) => createHmac('sha256', launchSecret()).update(`payment-launch:${payload}`).digest('base64url');

/** `<expiry>.<signature>` for one order's launch link. */
export function signLaunchToken(orderId: string, ttlMs = CHECKOUT_TTL_MS): string {
  const expires = Math.floor((Date.now() + ttlMs) / 1000);
  return `${expires}.${sign(`${orderId}:${expires}`)}`;
}

export function verifyLaunchToken(orderId: string, token: string | undefined): boolean {
  if (!token || !launchSecret()) return false;
  const [expiresRaw, signature] = token.split('.');
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires * 1000 < Date.now() || !signature) return false;
  const expected = Buffer.from(sign(`${orderId}:${expires}`));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Order ids are UUIDs; anything else never reaches a query or a redirect. */
export const isOrderId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * A page that POSTs `fields` to `action` as soon as it loads. The script runs
 * under a per-response nonce (the caller sets the matching CSP header); a
 * visible button covers browsers with scripts off.
 */
export function autoSubmitPage(action: string, fields: Record<string, string>, nonce: string): string {
  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening payment…</title></head>`
    + `<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">`
    + `<form id="pay" method="post" action="${escapeHtml(action)}">${inputs}<p>Opening the secure payment page…</p><button type="submit">Continue to payment</button></form>`
    + `<script nonce="${escapeHtml(nonce)}">document.getElementById('pay').submit();</script></body></html>`;
}

/** A plain page for a launch link that can no longer be used. */
export function messagePage(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>`
    + `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1 style="font-size:1.25rem">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
}
