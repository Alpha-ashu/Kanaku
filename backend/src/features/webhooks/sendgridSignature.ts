import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../../config/logger';

/**
 * SendGrid Event Webhook signature verification (ECDSA P-256 over SHA-256).
 *
 * SendGrid signs the raw request body concatenated with the `X-Twilio-Email-Event-Webhook-Timestamp`
 * header using your account's verification key, then sends:
 *   - X-Twilio-Email-Event-Webhook-Signature   (base64 ECDSA signature)
 *   - X-Twilio-Email-Event-Webhook-Timestamp   (unix seconds)
 *
 * We:
 *   1. Reject if the verification key isn't configured (fail-closed in production).
 *   2. Reject if either header is missing.
 *   3. Reject if the timestamp is older than `MAX_AGE_S` (replay protection).
 *   4. Verify the ECDSA signature against `timestamp + rawBody`.
 *
 * Requires the global `express.json({ verify })` shim in app.ts (already
 * present) which stashes the exact request bytes on `req.rawBody` so the
 * digest matches what SendGrid signed.
 */

const TS_HEADER = 'x-twilio-email-event-webhook-timestamp';
const SIG_HEADER = 'x-twilio-email-event-webhook-signature';
const MAX_AGE_S = 600; // 10 minutes

const PEM_HEADER = '-----BEGIN PUBLIC KEY-----';
const PEM_FOOTER = '-----END PUBLIC KEY-----';

/** Coerce raw env value (base64 SPKI or full PEM) to a PEM-formatted public key. */
function toPemPublicKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes(PEM_HEADER)) {
    return trimmed.replace(/\\n/g, '\n');
  }
  const base64 = trimmed.replace(/\s+/g, '');
  const chunks = base64.match(/.{1,64}/g)?.join('\n') ?? base64;
  return `${PEM_HEADER}\n${chunks}\n${PEM_FOOTER}\n`;
}

export function verifySendGridSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const verificationKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  if (!verificationKey) {
    if (isProd) {
      logger.error('[sendgrid] SENDGRID_WEBHOOK_PUBLIC_KEY is not configured — rejecting webhook');
      res.status(503).json({ success: false, error: 'Webhook verification not configured', code: 'WEBHOOK_NOT_CONFIGURED' });
      return;
    }
    logger.warn('[sendgrid] SENDGRID_WEBHOOK_PUBLIC_KEY not set — allowing webhook in non-production');
    next();
    return;
  }

  const signature = req.header(SIG_HEADER);
  const timestamp = req.header(TS_HEADER);
  if (!signature || !timestamp) {
    logger.warn('[sendgrid] Missing signature/timestamp headers');
    res.status(401).json({ success: false, error: 'Missing webhook signature', code: 'WEBHOOK_SIGNATURE_MISSING' });
    return;
  }

  // Replay protection — reject stale (or future-dated) timestamps.
  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) {
    res.status(401).json({ success: false, error: 'Invalid webhook timestamp', code: 'WEBHOOK_TS_INVALID' });
    return;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > MAX_AGE_S) {
    logger.warn('[sendgrid] Webhook timestamp out of window', { skew: nowSeconds - tsSeconds });
    res.status(401).json({ success: false, error: 'Webhook timestamp out of window', code: 'WEBHOOK_TS_STALE' });
    return;
  }

  const rawBody: Buffer | undefined = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    // Should never happen — app.ts json({verify}) always populates this.
    logger.error('[sendgrid] req.rawBody missing — cannot verify signature');
    res.status(500).json({ success: false, error: 'Cannot verify webhook', code: 'WEBHOOK_RAWBODY_MISSING' });
    return;
  }

  try {
    const payload = Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(payload);
    verifier.end();

    const ok = verifier.verify(toPemPublicKey(verificationKey), signature, 'base64');
    if (!ok) {
      logger.warn('[sendgrid] Invalid webhook signature');
      res.status(401).json({ success: false, error: 'Invalid webhook signature', code: 'WEBHOOK_SIGNATURE_INVALID' });
      return;
    }
    next();
  } catch (err) {
    logger.error('[sendgrid] Signature verification threw', { error: err });
    res.status(401).json({ success: false, error: 'Webhook signature verification failed', code: 'WEBHOOK_SIGNATURE_ERROR' });
  }
}

