/**
 * Email templates. Each returns a { subject, html } pair; the HTML is built from
 * the shared branded layout. User-provided values are escaped before insertion.
 */
import { renderLayout, escapeHtml, emailButton } from './layout';

export interface RenderedEmail {
  subject: string;
  html: string;
}

const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

/** Generic in-app notification email (used by the email-notifications worker). */
export function renderNotificationEmail(p: {
  title: string;
  message: string;
  category?: string;
  deepLink?: string;
}): RenderedEmail {
  const action = p.deepLink ? emailButton(`${FRONTEND_URL}${p.deepLink}`, 'View Details') : '';
  return {
    subject: p.title,
    html: renderLayout({
      heading: p.title,
      category: p.category,
      bodyHtml: `${escapeHtml(p.message)}${action ? `<div>${action}</div>` : ''}`,
    }),
  };
}

/** Welcome email — sent after successful registration. */
export function renderWelcomeEmail(p: { name?: string }): RenderedEmail {
  const greeting = p.name ? `Hi ${escapeHtml(p.name)},` : 'Welcome,';
  const cta = FRONTEND_URL ? `<div>${emailButton(FRONTEND_URL, 'Open KANAKU')}</div>` : '';
  return {
    subject: 'Welcome to KANAKU',
    html: renderLayout({
      heading: 'Welcome to KANAKU',
      category: 'Account',
      bodyHtml: `${greeting}<br/><br/>Your account is ready. KANAKU helps you track spending, set goals, and manage your financial life privately.${cta}`,
    }),
  };
}

/** Password reset email — contains a reset link. */
export function renderPasswordResetEmail(p: { name?: string; resetUrl: string }): RenderedEmail {
  const greeting = p.name ? `Hi ${escapeHtml(p.name)},` : 'Hello,';
  return {
    subject: 'Reset your KANAKU password',
    html: renderLayout({
      heading: 'Reset your password',
      category: 'Security',
      bodyHtml: `${greeting}<br/><br/>We received a request to reset your password. Click the button below to choose a new one. If you didn't request this, you can safely ignore this email.<div>${emailButton(p.resetUrl, 'Reset Password')}</div>`,
    }),
  };
}

/** Role-assigned email — sent when an admin grants a role (e.g. advisor). */
export function renderRoleAssignedEmail(p: { name?: string; role: string }): RenderedEmail {
  const greeting = p.name ? `Hi ${escapeHtml(p.name)},` : 'Hello,';
  const cta = FRONTEND_URL ? `<div>${emailButton(FRONTEND_URL, 'Go to KANAKU')}</div>` : '';
  return {
    subject: `You've been granted the ${p.role} role on KANAKU`,
    html: renderLayout({
      heading: 'Your role has been updated',
      category: 'Account',
      bodyHtml: `${greeting}<br/><br/>Your account has been granted the <strong>${escapeHtml(p.role)}</strong> role. New features may now be available to you.${cta}`,
    }),
  };
}

/** Account verification email — contains a verification link. */
export function renderVerificationEmail(p: { name?: string; verifyUrl: string }): RenderedEmail {
  const greeting = p.name ? `Hi ${escapeHtml(p.name)},` : 'Hello,';
  return {
    subject: 'Verify your KANAKU account',
    html: renderLayout({
      heading: 'Verify your account',
      category: 'Security',
      bodyHtml: `${greeting}<br/><br/>Please confirm your email address to finish setting up your account.<div>${emailButton(p.verifyUrl, 'Verify Account')}</div>`,
    }),
  };
}
