/**
 * Shared SendGrid email utility.
 * Used by OTP delivery, the notification queue worker, and the unified
 * collaboration invitation system — one place to configure the sender
 * and to fail safely when SendGrid isn't configured (e.g. local dev).
 */
import sgMail from '@sendgrid/mail';
import { logger } from '../config/logger';

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'shaik.social.life@gmail.com';
const FROM_NAME = 'Kanaku';

let initialized = false;
function ensureInitialized(): boolean {
  if (initialized) return true;
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return false;
  sgMail.setApiKey(key);
  initialized = true;
  return true;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  categories?: string[];
  headers?: Record<string, string>;
  /** Echoed back verbatim in SendGrid Event Webhook payloads — use this (not headers) to correlate delivery/open/bounce events back to a notification or invitation. */
  customArgs?: Record<string, string>;
}

/**
 * Send an email via SendGrid. Resolves to false (never throws) when SendGrid
 * isn't configured or the send fails — callers should treat email delivery
 * as best-effort and never block the underlying operation on it.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!ensureInitialized()) {
    logger.warn('[Email] SENDGRID_API_KEY not set — skipping send', { to: opts.to, subject: opts.subject });
    return false;
  }

  try {
    await sgMail.send({
      to: opts.to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: opts.subject,
      html: opts.html,
      categories: opts.categories,
      headers: opts.headers,
      customArgs: opts.customArgs,
    });
    return true;
  } catch (err: any) {
    logger.error('[Email] Send failed', {
      to: opts.to,
      subject: opts.subject,
      error: err?.response?.body || err.message,
    });
    return false;
  }
}
