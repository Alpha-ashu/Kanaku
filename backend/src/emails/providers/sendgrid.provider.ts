/**
 * SendGrid email provider — the single place that talks to SendGrid and owns the
 * sender identity. Fails safe (returns false, never throws) when SendGrid isn't
 * configured (e.g. local dev) so callers can treat email as best-effort.
 */
import sgMail from '@sendgrid/mail';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { isSmtpConfigured, sendSmtpEmail, SMTP_FROM_EMAIL, SMTP_FROM_NAME } from './smtp.provider';
import { isBrevoHttpConfigured, sendBrevoHttpEmail } from './brevo.provider';

// Sender identity comes from configuration (SendGrid or SMTP).
export const FROM_EMAIL = (process.env.EMAIL_PROVIDER === 'smtp' && SMTP_FROM_EMAIL)
  ? SMTP_FROM_EMAIL
  : (env.SENDGRID_FROM_EMAIL || SMTP_FROM_EMAIL);
export const FROM_NAME = (process.env.EMAIL_PROVIDER === 'smtp' && SMTP_FROM_NAME)
  ? SMTP_FROM_NAME
  : (env.SENDGRID_FROM_NAME || SMTP_FROM_NAME || 'Kanaku');

let initialized = false;
let sendEmailLoggedOnce = false;
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
  const brevoHttpConfigured = isBrevoHttpConfigured();

  // One-time startup diagnostic (logged once per process)
  if (!sendEmailLoggedOnce) {
    sendEmailLoggedOnce = true;
    logger.info('[Email] Provider configuration:', {
      preferred: preferredProvider,
      brevoHttp: brevoHttpConfigured ? 'configured' : 'NOT configured',
      sendgrid: sendgridConfigured ? 'configured' : 'NOT configured',
      smtp: smtpConfigured ? 'configured' : 'NOT configured',
      smtpHost: process.env.SMTP_HOST || '(not set)',
      sendgridFrom: env.SENDGRID_FROM_EMAIL || '(not set)',
    });
  }

  // 1. Try Brevo HTTP API first when preferred provider is 'smtp'.
  //    Brevo HTTP uses HTTPS (port 443) which is never blocked, unlike SMTP
  //    port 587 which PaaS providers like Render's free tier block.
  if (preferredProvider === 'smtp' && brevoHttpConfigured) {
    const brevoSuccess = await sendBrevoHttpEmail(opts);
    if (brevoSuccess) return true;
    logger.warn('[Email] Brevo HTTP API send failed, attempting SMTP relay fallback...');
  }

  // 2. Try SMTP relay if preferred and configured (e.g. Brevo SMTP port 587)
  if (preferredProvider === 'smtp' && smtpConfigured) {
    const smtpSuccess = await sendSmtpEmail(opts);
    if (smtpSuccess) return true;
    logger.warn('[Email] Preferred SMTP send failed, attempting SendGrid fallback...');
  }

  // 3. Try SendGrid if configured and either it is preferred OR previous providers failed
  if (sendgridConfigured) {
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
      // Fall through to remaining fallbacks
    }
  }

  // 4. Try SMTP fallback if it was not the preferred provider (or preferred but already failed)
  if (preferredProvider !== 'smtp' && smtpConfigured) {
    const smtpSuccess = await sendSmtpEmail(opts);
    if (smtpSuccess) return true;
  }

  // 5. Try Brevo HTTP as last resort if not already tried
  if (preferredProvider !== 'smtp' && brevoHttpConfigured) {
    const brevoSuccess = await sendBrevoHttpEmail(opts);
    if (brevoSuccess) return true;
  }

  // 6. Dev/test fallback: In non-production environments, simulate if no provider
  // is configured OR if the configured provider failed (e.g. provider quota exhausted,
  // network unreachable, invalid key). This prevents local development and testing
  // from being hard-blocked by third-party provider limits.
  if (process.env.NODE_ENV !== 'production') {
    logger.warn(`[Email/DevMock] Provider delivery failed or unconfigured. Simulating email send in dev mode to ${opts.to}: "${opts.subject}"`);
    return true;
  }

  // All configured providers have been tried and failed (or none were configured).
  logger.error('[Email] All providers failed — email not delivered', {
    to: opts.to,
    subject: opts.subject,
    sendgridConfigured,
    smtpConfigured,
    brevoHttpConfigured,
    preferredProvider,
    hint: !sendgridConfigured && !smtpConfigured && !brevoHttpConfigured
      ? 'No email provider configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS or SENDGRID_API_KEY/SENDGRID_FROM_EMAIL in Render env vars.'
      : 'Provider(s) configured but all sends failed. Check credentials, sender verification, and quotas.',
  });
  return false;
}

