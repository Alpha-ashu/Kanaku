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

/**
 * Account verification — `verifyUrl` must be an app-generated, single-use link.
 *
 * ⚠️ DEFERRED (Registration remediation, decision 6): email verification is NOT
 * enforced at registration yet. On the current free email tier (personal verified
 * sender) deliverability is unreliable, so mandatory verification would lock users
 * out. This function + `renderVerificationEmail` are kept intentionally so the full
 * flow (token issuance, `User.status='pending'` gate, a `/auth/verify-email`
 * endpoint) can be wired once we move to a paid provider on a custom domain.
 * Do not remove.
 */
export async function sendVerificationEmail(to: string, verifyUrl: string, name?: string): Promise<boolean> {
  const { subject, html } = renderVerificationEmail({ name, verifyUrl });
  return sendEmail({ to, subject, html, categories: ['kanaku-verification'] });
}

/**
 * Security alert — a protected role account (admin/manager/advisor/user) signed
 * in. Sent to the owner/ops address (SECURITY_ALERT_EMAIL).
 */
export async function sendLoginAlertEmail(opts: {
  to: string;
  role: string;
  email: string;
  name?: string;
  ip?: string;
  userAgent?: string;
  when?: Date;
}): Promise<boolean> {
  const when = (opts.when ?? new Date()).toUTCString();
  const title = `Kanaku sign-in: ${opts.role} account`;
  const message =
    `The ${opts.role} account (${opts.email}${opts.name ? `, ${opts.name}` : ''}) just logged in to kanaku.app.\n\n` +
    `Time: ${when}\nIP: ${opts.ip || 'unknown'}\nDevice: ${opts.userAgent || 'unknown'}\n\n` +
    `If this wasn't you, rotate that account's password immediately.`;
  return sendNotificationEmail({ to: opts.to, title, message, category: 'security-login' });
}

/**
 * Admin-change summary — emailed to the admin who changed platform settings,
 * confirming the change was applied and reflected to all profiles.
 */
export async function sendAdminChangeEmail(opts: {
  to: string;
  adminName?: string;
  summary: string;
  when?: Date;
}): Promise<boolean> {
  const when = (opts.when ?? new Date()).toUTCString();
  const title = 'Kanaku: your admin change was applied';
  const message =
    `${opts.adminName ? `${opts.adminName} (admin)` : 'Admin'} made the following change, now reflected across all profiles:\n\n` +
    `${opts.summary}\n\nTime: ${when}`;
  return sendNotificationEmail({ to: opts.to, title, message, category: 'admin-change' });
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
