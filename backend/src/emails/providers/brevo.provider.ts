/**
 * Brevo HTTP API Email Provider
 *
 * Uses Brevo's Transactional Email HTTP API (https://api.brevo.com/v3/smtp/email)
 * instead of SMTP relay. This avoids port 587 blocking on platforms like Render's
 * free tier, since it uses standard HTTPS (port 443).
 *
 * Activated when BREVO_API_KEY is set (or SMTP_PASS is a Brevo xsmtpsib-* key).
 * Falls back to the existing SMTP provider if not configured.
 */
import { logger } from '../../config/logger';
import type { SendEmailOptions } from './sendgrid.provider';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Resolve the Brevo API key.
 * Only xkeysib-* keys (from Brevo API settings) work with the HTTP API.
 * SMTP keys (xsmtpsib-*) do NOT work — they are SMTP-only credentials.
 */
function getBrevoApiKey(): string | null {
  return process.env.BREVO_API_KEY || null;
}

export function isBrevoHttpConfigured(): boolean {
  return Boolean(getBrevoApiKey());
}

/**
 * Send an email via the Brevo transactional HTTP API.
 * Returns true on success, false on failure (never throws).
 */
export async function sendBrevoHttpEmail(opts: SendEmailOptions): Promise<boolean> {
  const apiKey = getBrevoApiKey();
  if (!apiKey) return false;

  const fromEmail = process.env.SMTP_FROM_EMAIL
    || process.env.SENDGRID_FROM_EMAIL
    || 'no-reply@kanaku.app';
  const fromName = process.env.SMTP_FROM_NAME
    || process.env.SENDGRID_FROM_NAME
    || 'Kanaku';

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      logger.info(`[Email/BrevoHTTP] Email sent to ${opts.to}: "${opts.subject}" (messageId: ${data.messageId || 'n/a'})`);
      return true;
    }

    const errorBody = await res.text().catch(() => '');
    logger.error('[Email/BrevoHTTP] Send failed:', {
      to: opts.to,
      subject: opts.subject,
      status: res.status,
      error: errorBody,
    });
    return false;
  } catch (err: any) {
    logger.error('[Email/BrevoHTTP] Request error:', {
      to: opts.to,
      subject: opts.subject,
      error: err?.message || String(err),
    });
    return false;
  }
}
