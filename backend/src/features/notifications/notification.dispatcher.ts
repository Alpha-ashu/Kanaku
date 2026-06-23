/**
 * Notification dispatcher — the single sanctioned way to raise a notification.
 *
 * Flow:
 *   1. Write the notification row to PostgreSQL (the source of truth).
 *   2. For async channels (email/push) the row is left at status='pending' with
 *      per-channel deliveryStatus='queued'. The outbox drainer (workers/index.ts)
 *      polls for pending rows and delivers them — no queue/broker required.
 *
 * App-only notifications are "delivered" the moment the row exists (the feed
 * reads from PostgreSQL), so they are written straight to status='sent'.
 *
 * Prefer this over calling prisma.notification.create directly in controllers —
 * it keeps the lifecycle fields and per-channel status coherent for the drainer.
 */
import { prisma } from '../../db/prisma';

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
      // 'pending' makes the outbox drainer pick the row up; app-only rows rest at 'sent'.
      status: wantsAsync ? 'pending' : 'sent',
      sentAt: wantsAsync ? null : new Date(),
    },
  });

  // Async channels are delivered asynchronously by the notification outbox
  // drainer (workers/index.ts) — there is nothing to enqueue here.
  return notification;
}
