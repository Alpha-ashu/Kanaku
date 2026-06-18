/**
 * Email module — one home for transactional email.
 *
 *   providers/  → SendGrid transport + sender identity (sendEmail)
 *   templates/  → branded HTML templates ({ subject, html })
 *   services/   → intent-named senders per event (sendWelcomeEmail, …)
 *   jobs        → the async email worker lives at ../workers/email.worker.ts
 *
 * Prefer the services for event emails:
 *   import { sendWelcomeEmail } from '../emails';
 *
 * See ./README.md for the event catalog and configuration.
 */
export * from './providers/sendgrid.provider';
export * from './templates';
export * from './services/email.service';
