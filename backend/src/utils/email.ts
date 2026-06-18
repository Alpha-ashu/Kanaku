/**
 * @deprecated Import from `../emails` (or `../../emails`) instead.
 *
 * Kept as a back-compat re-export so existing callers (otp.service,
 * collaboration/invitation.service, the notification worker) keep working while
 * code migrates to the consolidated emails module.
 */
export { sendEmail, FROM_EMAIL, FROM_NAME } from '../emails/providers/sendgrid.provider';
export type { SendEmailOptions } from '../emails/providers/sendgrid.provider';
