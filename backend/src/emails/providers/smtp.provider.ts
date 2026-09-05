/**
 * SMTP Email Provider (Nodemailer)
 *
 * Provides standard SMTP delivery (Gmail, Amazon SES, Brevo, Mailgun, Postmark, custom SMTP).
 * Automatically enabled when SMTP_HOST or SMTP_USER is configured in environment variables.
 */
import nodemailer from 'nodemailer';
import { logger } from '../../config/logger';
import type { SendEmailOptions } from './sendgrid.provider';

let transporter: nodemailer.Transporter | null = null;
let initialized = false;

export const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'no-reply@kanaku.app';
export const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'Kanaku';

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST || (process.env.SMTP_USER && process.env.SMTP_PASS));
}

function getTransporter(): nodemailer.Transporter | null {
  if (initialized) return transporter;
  initialized = true;

  if (!isSmtpConfigured()) {
    return null;
  }

  try {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    logger.info(`[Email/SMTP] Initialized transporter for ${host}:${port}`);
    return transporter;
  } catch (err: any) {
    logger.error('[Email/SMTP] Failed to initialize transporter:', err);
    return null;
  }
}

export async function sendSmtpEmail(opts: SendEmailOptions): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    return false;
  }

  try {
    const fromAddress = `"${SMTP_FROM_NAME}" <${SMTP_FROM_EMAIL}>`;
    await mailer.sendMail({
      from: fromAddress,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      headers: opts.headers,
    });
    logger.info(`[Email/SMTP] Email sent to ${opts.to}: "${opts.subject}"`);
    return true;
  } catch (err: any) {
    logger.error('[Email/SMTP] Failed to send email:', {
      to: opts.to,
      subject: opts.subject,
      error: err?.message || String(err),
    });
    return false;
  }
}
