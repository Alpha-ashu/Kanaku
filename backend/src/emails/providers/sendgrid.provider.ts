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
export const FROM_EMAIL = (process.env.EMAIL_PROVIDER === 'smtp' && SMTP_FROM_EMAIL)
  ? SMTP_FROM_EMAIL
  : (env.SENDGRID_FROM_EMAIL || SMTP_FROM_EMAIL);
export const FROM_NAME = (process.env.EMAIL_PROVIDER === 'smtp' && SMTP_FROM_NAME)
  ? SMTP_FROM_NAME
  : (env.SENDGRID_FROM_NAME || SMTP_FROM_NAME || 'Kanaku');

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
  const preferredProvider = process.env.EMAIL_PROVIDER || (isSmtpConfigured() ? 'smtp' : 'sendgrid');
  const sendgridConfigured = ensureInitialized() && Boolean(env.SENDGRID_FROM_EMAIL);
  const smtpConfigured = isSmtpConfigured();

  // 1. Try SMTP if preferred and configured (e.g. Brevo SMTP)
  if (preferredProvider === 'smtp' && smtpConfigured) {
    const smtpSuccess = await sendSmtpEmail(opts);
    if (smtpSuccess) return true;
    logger.warn('[Email] Preferred SMTP send failed, attempting SendGrid fallback...');
  }

  // 2. Try SendGrid if configured
  if (sendgridConfigured && preferredProvider !== 'smtp') {
    try {
      await sgMail.send({
        to: opts.to,
        from: { email: env.SENDGRID_FROM_EMAIL!, name: FROM_NAME },
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
        status: err?.code ?? err?.response?.statusCode,
        error: err?.response?.body || err.message,
      });
      // Fall through to SMTP if configured
    }
  }

  // 3. Try SMTP fallback if SendGrid wasn't preferred or failed
  if (preferredProvider !== 'smtp' && smtpConfigured) {
    const smtpSuccess = await sendSmtpEmail(opts);
    if (smtpSuccess) return true;
  }

  // 4. Dev/test fallback: In non-production environments, simulate if no provider
  // is configured OR if the configured provider failed (e.g. provider quota exhausted,
  // network unreachable, invalid key). This prevents local development and testing
  // from being hard-blocked by third-party provider limits.
  if (process.env.NODE_ENV !== 'production') {
    logger.warn(`[Email/DevMock] Provider delivery failed or unconfigured. Simulating email send in dev mode to ${opts.to}: "${opts.subject}"`);
    return true;
  }

  if (!sendgridConfigured && !smtpConfigured) {
    logger.warn('[Email] No email provider configured (SENDGRID_API_KEY + SENDGRID_FROM_EMAIL, or SMTP_HOST) — skipping send', {
      to: opts.to,
      subject: opts.subject,
    });
  }
  return false;
}
