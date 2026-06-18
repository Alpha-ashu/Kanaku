import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { logInvitationEvent } from '../../utils/invitationLifecycle';

interface SendGridEvent {
  event: string; // delivered, open, bounce, dropped, deferred, spamreport, click, ...
  email?: string;
  sg_message_id?: string;
  timestamp?: number;
  reason?: string;
  // Custom args we set on send (flattened by SendGrid into the event object)
  kind?: string;
  notificationId?: string;
  userId?: string;
  moduleType?: string;
}

const EVENT_MAP: Record<string, 'EMAIL_DELIVERED' | 'EMAIL_OPENED' | 'EMAIL_BOUNCED' | 'EMAIL_FAILED'> = {
  delivered: 'EMAIL_DELIVERED',
  open: 'EMAIL_OPENED',
  bounce: 'EMAIL_BOUNCED',
  dropped: 'EMAIL_FAILED',
  deferred: 'EMAIL_FAILED',
  spamreport: 'EMAIL_BOUNCED',
};

/**
 * SendGrid Event Webhook receiver. Configure in SendGrid (Settings -> Mail
 * Settings -> Event Webhook) to POST here so delivered/opened/bounced events
 * actually get tracked, instead of only knowing whether the send API call
 * itself succeeded. This endpoint is unauthenticated (SendGrid calls it
 * directly) — signature verification is not yet implemented, so don't treat
 * its payload as trusted input beyond logging/best-effort status updates.
 */
export const receiveSendGridEvents = async (req: Request, res: Response) => {
  // Always 200 quickly — SendGrid retries aggressively on non-2xx and this
  // endpoint doing best-effort logging should never block/slow that down.
  res.status(200).json({ received: true });

  try {
    const events = (Array.isArray(req.body) ? req.body : []) as SendGridEvent[];

    for (const evt of events) {
      const mapped = EVENT_MAP[evt.event];
      if (!mapped) continue;

      logInvitationEvent(mapped, {
        email: evt.email,
        notificationId: evt.notificationId,
        userId: evt.userId,
        moduleType: evt.moduleType,
        kind: evt.kind,
        reason: evt.reason,
        sgMessageId: evt.sg_message_id,
      });

      if (evt.notificationId && (mapped === 'EMAIL_DELIVERED' || mapped === 'EMAIL_OPENED')) {
        try {
          const notification = await prisma.notification.findUnique({ where: { id: evt.notificationId } });
          if (notification) {
            const deliveryStatus = (typeof notification.deliveryStatus === 'string'
              ? JSON.parse(notification.deliveryStatus)
              : (notification.deliveryStatus || {})) as any;
            deliveryStatus.email = mapped === 'EMAIL_OPENED' ? 'opened' : 'delivered';
            await prisma.notification.update({
              where: { id: evt.notificationId },
              data: { deliveryStatus: JSON.stringify(deliveryStatus) },
            });
          }
        } catch (err) {
          logger.warn('Failed to update notification delivery status from SendGrid webhook', err);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to process SendGrid event webhook', { error });
  }
};
