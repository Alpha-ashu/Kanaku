import { prisma } from '../../utils/prisma';
import { Queue } from 'bullmq';
import { DeviceService } from '../devices/device.service';

/**
 * Cross-Device Sync Notification Service
 * Handles broadcasting notifications and sync events across user devices
 */
export class CrossDeviceSyncService {
  constructor(
    private emailQueue: Queue,
    private pushQueue: Queue
  ) {}

  /**
   * Broadcast notification to all user devices
   */
  async broadcastToUserDevices(
    userId: string,
    notification: {
      title: string;
      message: string;
      type: string;
      deepLink?: string;
      priority?: 'high' | 'normal' | 'low';
      channels?: ('app' | 'email' | 'push')[];
    },
    excludeDeviceId?: string
  ) {
    try {
      // Get active devices for the user
      const activeDevices = await DeviceService.getActiveDevicesForUser(userId, excludeDeviceId);

      if (activeDevices.length === 0) {
        console.log(`No active devices for user ${userId}`);
        return {
          broadcastId: undefined,
          devicesTargeted: 0,
          status: 'no_devices',
        };
      }

      // Create notification record
      const createdNotification = await prisma.notification.create({
        data: {
          userId,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          deepLink: notification.deepLink,
          priority: notification.priority || 'normal',
          channels: notification.channels || ['app', 'push'],
          metadata: {
            broadcastDevices: activeDevices.length,
            targetDeviceIds: activeDevices.map((d) => d.deviceId),
          },
        },
      });

      // Queue push notifications for FCM devices
      const fcmDevices = activeDevices.filter((d) => d.fcmToken);
      if (fcmDevices.length > 0 && notification.channels?.includes('push')) {
        for (const device of fcmDevices) {
          await this.pushQueue.add(
            `push-notification-${createdNotification.id}`,
            {
              notificationId: createdNotification.id,
              userId,
              deviceId: device.deviceId,
              fcmToken: device.fcmToken,
              title: notification.title,
              message: notification.message,
              deepLink: notification.deepLink,
              priority: notification.priority || 'normal',
            },
            {
              priority: notification.priority === 'high' ? 10 : 5,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
              removeOnComplete: true,
            }
          );
        }
      }

      // Queue email notification if requested
      if (notification.channels?.includes('email')) {
        await this.emailQueue.add(
          `email-notification-${createdNotification.id}`,
          {
            notificationId: createdNotification.id,
            userId,
            title: notification.title,
            message: notification.message,
            type: notification.type,
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: true,
          }
        );
      }

      return {
        broadcastId: createdNotification.id,
        devicesTargeted: activeDevices.length,
        status: 'queued',
      };
    } catch (error) {
      console.error('Broadcast to devices error:', error);
      throw error;
    }
  }

  /**
   * Queue sync event for specific devices
   */
  async queueSyncEvent(
    userId: string,
    syncData: {
      entityType: 'transaction' | 'account' | 'goal' | 'loan' | 'group' | string;
      entityId: string;
      action: 'create' | 'update' | 'delete';
      timestamp: Date;
      sourceDeviceId?: string;
    }
  ) {
    try {
      // Create sync queue entry
      const syncQueue = await prisma.syncQueue.create({
        data: {
          userId,
          entityType: syncData.entityType,
          entityId: syncData.entityId,
          action: syncData.action,
          sourceDeviceId: syncData.sourceDeviceId,
          status: 'pending',
          metadata: {
            queuedAt: new Date().toISOString(),
            priority: 'normal',
          },
        },
      });

      // Get user's other devices (excluding source)
      const targetDevices = await DeviceService.getActiveDevicesForUser(
        userId,
        syncData.sourceDeviceId
      );

      // Notify each device about pending sync
      for (const device of targetDevices) {
        await this.broadcastToUserDevices(
          userId,
          {
            title: `${syncData.action.charAt(0).toUpperCase() + syncData.action.slice(1)} Sync Available`,
            message: `A ${syncData.entityType} was ${syncData.action}d on another device`,
            type: 'sync',
            deepLink: `/sync?entity=${syncData.entityType}&id=${syncData.entityId}`,
            priority: 'high',
            channels: ['app', 'push'],
          },
          device.deviceId
        );
      }

      return syncQueue;
    } catch (error) {
      console.error('Queue sync event error:', error);
      throw error;
    }
  }

  /**
   * Mark sync as completed
   */
  async markSyncComplete(syncQueueId: string) {
    try {
      return await prisma.syncQueue.update({
        where: { id: syncQueueId },
        data: {
          status: 'completed',
          metadata: {
            completedAt: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Mark sync complete error:', error);
      throw error;
    }
  }

  /**
   * Get pending syncs for a device
   */
  async getPendingSyncsForDevice(userId: string, deviceId: string, limit: number = 50) {
    try {
      return await prisma.syncQueue.findMany({
        where: {
          userId,
          status: 'pending',
          NOT: {
            sourceDeviceId: deviceId,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });
    } catch (error) {
      console.error('Get pending syncs error:', error);
      return [];
    }
  }

  /**
   * Broadcast event to specific user (e.g., friend request, group invite)
   */
  async notifyUserEvent(
    userId: string,
    event: {
      title: string;
      message: string;
      type: 'friendship' | 'group' | 'reminder' | 'transaction' | string;
      deepLink?: string;
      relatedUserId?: string;
      priority?: 'high' | 'normal' | 'low';
    }
  ) {
    try {
      return await this.broadcastToUserDevices(userId, {
        title: event.title,
        message: event.message,
        type: event.type,
        deepLink: event.deepLink,
        priority: event.priority || 'normal',
        channels: ['app', 'push'],
      });
    } catch (error) {
      console.error('Notify user event error:', error);
      throw error;
    }
  }

  /**
   * Send reminder notification (scheduled)
   */
  async queueReminder(
    userId: string,
    reminder: {
      title: string;
      message: string;
      scheduledTime: Date;
      deepLink?: string;
      category?: string;
    }
  ) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          title: reminder.title,
          message: reminder.message,
          type: 'reminder',
          priority: 'high',
          deepLink: reminder.deepLink,
          channels: ['app', 'push'],
          metadata: {
            scheduledTime: reminder.scheduledTime.toISOString(),
            category: reminder.category,
            status: 'scheduled',
          },
        },
      });

      // Queue for later delivery
      // This could be integrated with node-cron or bull-repeatable
      return notification;
    } catch (error) {
      console.error('Queue reminder error:', error);
      throw error;
    }
  }
}
