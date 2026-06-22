/**
 * Notification dispatcher — the single sanctioned way to raise a notification.
 *
 * Flow (§7):
 *   1. Write the notification row to PostgreSQL (the source of truth).
 *   2. Enqueue the async channels (email / push) carrying the notificationId.
 *
 * Workers are idempotent on that notificationId + channel, so a retry or a
 * duplicate enqueue never double-sends. App-only notifications are "delivered"
 * the moment the row exists (the feed reads from PostgreSQL), so they are
 * written straight to status='sent' with no queue hop.
 *
 * Prefer this over calling prisma.notification.create + queue.add directly in
 * controllers — it keeps the lifecycle fields and per-channel status coherent.
 */
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { getEmailQueue, getPushQueue } from '../../config/queue';

export type NotificationChannel = 'app' | 'email' | 'push';

export interface DispatchNotificationInput {
  userId: string;
  title: string;
  message: string;
  type?: string;
  category?: string;
  deepLink?: string;
  priority?: 'high' | 'normal' | 'low';
  channels?: NotificationChannel[];
  sourceUserId?: string;
  metadata?: Record<string, unknown>;
}

const jobPriority = (p?: string) => (p === 'high' ? 1 : p === 'low' ? 3 : 2);

export async function dispatchNotification(input: DispatchNotificationInput) {
  const channels = input.channels ?? ['app'];
  const wantsEmail = channels.includes('email');
  const wantsPush = channels.includes('push');
  const wantsAsync = wantsEmail || wantsPush;

  const deliveryStatus: Record<string, string> = { app: 'sent' };
  if (wantsEmail) deliveryStatus.email = 'queued';
  if (wantsPush) deliveryStatus.push = 'queued';

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      sourceUserId: input.sourceUserId,
      title: input.title,
      message: input.message,
      type: input.type ?? 'info',
      category: input.category,
      deepLink: input.deepLink,
      priority: input.priority ?? 'normal',
      channels: JSON.stringify(channels),
      metadata: input.metadata as any,
      deliveryStatus: JSON.stringify(deliveryStatus),
      status: wantsAsync ? 'pending' : 'sent',
      sentAt: wantsAsync ? null : new Date(),
    },
  });

  const priority = jobPriority(input.priority);

  if (wantsEmail) {
    try {
      await getEmailQueue().add(
        'send-notification-email',
        {
          notificationId: notification.id,
          userId: input.userId,
          channel: 'email',
          title: input.title,
          message: input.message,
          category: input.category,
          deepLink: input.deepLink,
        },
        { priority },
      );
    } catch (err) {
      logger.warn('Failed to enqueue email notification', {
        notificationId: notification.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (wantsPush) {
    try {
      const device = await prisma.device.findFirst({
        where: { userId: input.userId, isActive: true, fcmToken: { not: null } },
      });
      if (device?.fcmToken) {
        await getPushQueue().add(
          'send-push-notification',
          {
            notificationId: notification.id,
            userId: input.userId,
            channel: 'push',
            deviceId: device.id,
            fcmToken: device.fcmToken,
            title: input.title,
            message: input.message,
            category: input.category,
            deepLink: input.deepLink,
            priority: input.priority ?? 'normal',
          },
          { priority },
        );
      }
    } catch (err) {
      logger.warn('Failed to enqueue push notification', {
        notificationId: notification.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return notification;
}
