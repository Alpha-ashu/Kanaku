/**
 * SendGrid email provider — the single place that talks to SendGrid and owns the
 * sender identity. Fails safe (returns false, never throws) when SendGrid isn't
 * configured (e.g. local dev) so callers can treat email as best-effort.
 */
import sgMail from '@sendgrid/mail';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { isSmtpConfigured, sendSmtpEmail, SMTP_FROM_EMAIL, SMTP_FROM_NAME } from './smtp.provider';

// Sender identity comes from configuration (SendGrid or SMTP).
export const FROM_EMAIL = env.SENDGRID_FROM_EMAIL || SMTP_FROM_EMAIL;
export const FROM_NAME = env.SENDGRID_FROM_NAME || SMTP_FROM_NAME || 'Kanaku';

let initialized = false;
function ensureInitialized(): boolean {
  if (initialized) return true;
  const key = process.env.SENDGRID_API_KEY;
  const from = env.SENDGRID_FROM_EMAIL;
  // Need both an API key AND a validated sender address to send via SendGrid.
  if (!key || !from) return false;
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
  // 1. Try SendGrid if configured
  if (ensureInitialized() && env.SENDGRID_FROM_EMAIL) {
    try {
      await sgMail.send({
        to: opts.to,
        from: { email: env.SENDGRID_FROM_EMAIL, name: FROM_NAME },
        subject: opts.subject,
        html: opts.html,
        categories: opts.categories,
        headers: opts.headers,
        customArgs: opts.customArgs,
      });
      return true;
    } catch (err: any) {
      logger.error('[Email/SendGrid] Send failed:', {
        to: opts.to,
        subject: opts.subject,
        error: err?.response?.body || err.message,
      });
      // Fall through to SMTP if configured
    }
  }

  // 2. Try SMTP if configured (Gmail, SES, Brevo, custom SMTP)
  if (isSmtpConfigured()) {
    const smtpSuccess = await sendSmtpEmail(opts);
    if (smtpSuccess) return true;
  }

  // 3. Fallback for Local Development / Testing (no email credentials required)
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[Email/DevMock] Simulated email send to ${opts.to}: "${opts.subject}"`);
    return true;
  }

  logger.warn('[Email] No email provider configured (SENDGRID_API_KEY / SMTP_HOST) — skipping send', {
    to: opts.to,
    subject: opts.subject,
  });
  return false;
}
