/**
 * Webhook signature verification.
 *
 * Inbound webhooks (Setu AA, Resend, MSG91, Stripe, etc.) must be
 * verified against an HMAC signature computed over the raw request body
 * with a shared secret. Without verification any attacker can call
 * `POST /api/v1/webhooks/*` and forge events (e.g. fake AA consent
 * approval, fake payment success).
 *
 * Express's `app.use(express.json(...))` parses the body before route
 * handlers see it, so we capture the raw bytes via the `verify` callback
 * (see `backend/src/app.ts:79`). This helper consumes those raw bytes
 * and runs a **constant-time** comparison so signatures cannot be
 * brute-forced byte-by-byte via timing attacks.
 *
 * Usage in a route:
 *
 *   if (!verifyWebhookSignature(req, env.WEBHOOK_SETU_SECRET, {
 *     headerName: 'x-setu-signature',
 *     algorithm: 'sha256',
 *     encoding: 'hex',
 *   })) {
 *     return res.status(401).json({ error: 'invalid signature' });
 *   }
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { logger } from '../config/logger';

export interface WebhookVerifyOptions {
  /** HTTP header that carries the signature (e.g. `x-setu-signature`). */
  headerName: string;
  /** HMAC algorithm. Default: `sha256`. */
  algorithm?: 'sha256' | 'sha512' | 'sha1';
  /** Encoding of the signature value. Default: `hex`. */
  encoding?: 'hex' | 'base64';
  /**
   * Optional vendor-specific prefix that must be stripped before the
   * comparison (e.g. Stripe sends `t=...,v1=<sig>`; pass a function
   * to extract the signature segment).
   */
  extract?: (rawHeader: string) => string | null;
}

/**
 * @returns `true` if the signature matches, `false` otherwise.
 *          Always logs a warning on mismatch so abuse can be flagged.
 */
export const verifyWebhookSignature = (
  req: Request,
  secret: string | undefined,
  options: WebhookVerifyOptions,
): boolean => {
  if (!secret) {
    logger.error('[webhook] verification attempted but secret is not configured', {
      header: options.headerName,
    });
    return false;
  }

  const rawBody: Buffer | undefined = (req as any).rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    logger.warn('[webhook] no rawBody captured — express.json verify callback missing?');
    return false;
  }

  const headerValueRaw = req.headers[options.headerName.toLowerCase()];
  if (typeof headerValueRaw !== 'string' || headerValueRaw.trim() === '') {
    logger.warn('[webhook] missing signature header', { header: options.headerName });
    return false;
  }

  const headerValue = options.extract ? options.extract(headerValueRaw) : headerValueRaw;
  if (!headerValue) {
    logger.warn('[webhook] signature header could not be extracted', { header: options.headerName });
    return false;
  }

  const algorithm = options.algorithm ?? 'sha256';
  const encoding = options.encoding ?? 'hex';

  const expected = createHmac(algorithm, secret).update(rawBody).digest(encoding);

  // Both buffers MUST be the same length for timingSafeEqual.
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(headerValue, 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    logger.warn('[webhook] signature length mismatch — likely tampering', {
      header: options.headerName,
      expectedLen: expectedBuf.length,
      actualLen: actualBuf.length,
    });
    return false;
  }

  const ok = timingSafeEqual(expectedBuf, actualBuf);
  if (!ok) {
    logger.warn('[webhook] signature mismatch', { header: options.headerName });
  }
  return ok;
};

