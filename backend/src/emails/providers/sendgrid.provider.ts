/**
 * SendGrid email provider — the single place that talks to SendGrid and owns the
 * sender identity. Fails safe (returns false, never throws) when SendGrid isn't
 * configured (e.g. local dev) so callers can treat email as best-effort.
 */
import sgMail from '@sendgrid/mail';
import { logger } from '../../config/logger';
import { env } from '../../config/env';

// Sender identity comes ONLY from validated configuration. SENDGRID_FROM_EMAIL is
// a `required` config item in production (config/env.ts) — the app refuses to
// boot without it — so there is deliberately NO fallback sender address here (and
// never a personal one). FROM_NAME is a non-secret display label; 'Kanaku' is the
// brand default when SENDGRID_FROM_NAME is unset.
export const FROM_EMAIL = env.SENDGRID_FROM_EMAIL;
export const FROM_NAME = env.SENDGRID_FROM_NAME || 'Kanaku';

let initialized = false;
function ensureInitialized(): boolean {
  if (initialized) return true;
  const key = process.env.SENDGRID_API_KEY;
  // Need both an API key AND a validated sender address to send.
  if (!key || !FROM_EMAIL) return false;
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

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const from = FROM_EMAIL;
  if (!ensureInitialized() || !from) {
    logger.warn('[Email] SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL) — skipping send', { to: opts.to, subject: opts.subject });
    return false;
  }

  try {
    await sgMail.send({
      to: opts.to,
      from: { email: from, name: FROM_NAME },
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
