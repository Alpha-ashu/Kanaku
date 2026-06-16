import { logger } from '../config/logger';

/**
 * Structured, greppable lifecycle events for the invitation/notification email
 * pipeline. Every stage logs under the same "[InvitationLifecycle]" prefix with
 * a fixed event name so they can be correlated end-to-end in Fly logs:
 * INVITATION_CREATED -> EMAIL_QUEUED -> EMAIL_SENT -> EMAIL_DELIVERED ->
 * EMAIL_OPENED -> REGISTRATION_COMPLETED -> INVITATION_LINKED, with
 * EMAIL_BOUNCED / EMAIL_FAILED for failure paths.
 */
export type InvitationLifecycleEvent =
  | 'INVITATION_CREATED'
  | 'EMAIL_QUEUED'
  | 'EMAIL_SENT'
  | 'EMAIL_DELIVERED'
  | 'EMAIL_OPENED'
  | 'EMAIL_BOUNCED'
  | 'EMAIL_FAILED'
  | 'REGISTRATION_COMPLETED'
  | 'INVITATION_LINKED';

function maskEmail(email?: string | null): string {
  if (!email) return 'unknown';
  return `${email.substring(0, 3)}***`;
}

export function logInvitationEvent(
  event: InvitationLifecycleEvent,
  fields: Record<string, string | number | boolean | null | undefined> & { email?: string | null },
): void {
  const { email, ...rest } = fields;
  logger.info(`[InvitationLifecycle] ${event}`, { event, email: maskEmail(email), ...rest });
}
