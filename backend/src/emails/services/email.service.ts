/**
 * Email services — high-level, intent-named senders for each email event.
 * Each composes a template with the provider and returns the provider's
 * best-effort boolean (false when SendGrid isn't configured or the send fails).
 */
import { sendEmail } from '../providers/sendgrid.provider';
import {
  renderWelcomeEmail,
  renderPasswordResetEmail,
  renderRoleAssignedEmail,
  renderVerificationEmail,
  renderNotificationEmail,
} from '../templates';

/** Sent after successful registration. */
export async function sendWelcomeEmail(to: string, name?: string): Promise<boolean> {
  const { subject, html } = renderWelcomeEmail({ name });
  return sendEmail({ to, subject, html, categories: ['kanaku-welcome'] });
}

/** Password reset — `resetUrl` must be an app-generated, single-use link. */
export async function sendPasswordResetEmail(to: string, resetUrl: string, name?: string): Promise<boolean> {
  const { subject, html } = renderPasswordResetEmail({ name, resetUrl });
  return sendEmail({ to, subject, html, categories: ['kanaku-password-reset'] });
}

/** Role-assigned — sent when an admin grants a role. */
export async function sendRoleAssignedEmail(to: string, role: string, name?: string): Promise<boolean> {
  const { subject, html } = renderRoleAssignedEmail({ name, role });
  return sendEmail({ to, subject, html, categories: ['kanaku-role'] });
}

/** Account verification — `verifyUrl` must be an app-generated, single-use link. */
export async function sendVerificationEmail(to: string, verifyUrl: string, name?: string): Promise<boolean> {
  const { subject, html } = renderVerificationEmail({ name, verifyUrl });
  return sendEmail({ to, subject, html, categories: ['kanaku-verification'] });
}

/** Generic in-app notification email (used by the email-notifications worker). */
export async function sendNotificationEmail(opts: {
  to: string;
  title: string;
  message: string;
  category?: string;
  deepLink?: string;
  headers?: Record<string, string>;
}): Promise<boolean> {
  const { subject, html } = renderNotificationEmail(opts);
  return sendEmail({
    to: opts.to,
    subject,
    html,
    categories: ['kanaku-notifications', opts.category || 'general'],
    headers: opts.headers,
  });
}
