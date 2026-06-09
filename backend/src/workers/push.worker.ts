import { Worker, Job } from "bullmq";
import { prisma } from "../utils/prisma";
import { redisConnection } from "../config/queue";
import { sendPushNotification } from "../config/firebase";

/**
 * Push Notification Worker
 * Processes Firebase Cloud Messaging (FCM) push notification jobs from the queue
 * Handles device registration, token refresh, and delivery tracking
 */

interface PushNotificationJob {
  notificationId: string;
  userId: string;
  deviceId: string;
  fcmToken: string;
  title: string;
  message: string;
  category?: string;
  deepLink?: string;
}

/**
 * Create and start push notification worker
 */
export function createPushWorker() {
  const pushWorker = new Worker(
    "push-notifications",
    async (job: Job<PushNotificationJob>) => {
      const {
        notificationId,
        userId,
        deviceId,
        fcmToken,
        title,
        message,
        category,
        deepLink,
      } = job.data;

      try {
        // Verify device still exists and is owned by user
        const device = await prisma.device.findUnique({
          where: { id: deviceId },
        });

        if (!device || device.userId !== userId || !device.isActive) {
          console.warn(
            `Device ${deviceId} no longer available for user ${userId}`
          );
          return { skipped: true, reason: "device_inactive" };
        }

        // Verify FCM token matches
        if (device.fcmToken !== fcmToken) {
          console.warn(`FCM token mismatch for device ${deviceId}`);
          return { skipped: true, reason: "token_mismatch" };
        }

        // Check notification preferences
        // const prefs = await prisma.userNotificationPreference.findUnique({
        //   where: { userId },
        // });
        // if (!prefs?.pushEnabled) {
        //   console.log(`Push notifications disabled for user ${userId}`);
        //   return { skipped: true, reason: "disabled" };
        // }

        // Rate limiting check
        const notificationCount = await prisma.notification.count({
          where: {
            userId,
            createdAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
            },
          },
        });

        const rateLimit = parseInt(
          process.env.NOTIFICATION_RATE_LIMIT_PER_HOUR || "50"
        );
        if (notificationCount > rateLimit) {
          console.warn(
            `Rate limit exceeded for user ${userId} (${notificationCount}/${rateLimit} in last hour)`
          );
          return { rateLimited: true };
        }

        // Send push notification
        const response = await sendPushNotification(fcmToken, {
          title,
          body: message,
          data: {
            notificationId,
            category: category || "",
            deepLink: deepLink || "",
            priority: "normal",
          },
        });

        console.log(
          `✓ Push notification sent to device ${deviceId} (notification: ${notificationId})`
        );

        // Update device last seen
        await prisma.device.update({
          where: { id: deviceId },
          data: { lastSeenAt: new Date() },
        });

        // Update notification delivery status
        const notification = await prisma.notification.findUnique({
          where: { id: notificationId },
        });

        if (notification) {
          const deliveryStatus = (typeof notification.deliveryStatus === 'string'
            ? JSON.parse(notification.deliveryStatus)
            : (notification.deliveryStatus || {})) as any;
          deliveryStatus.push = "sent";

          await prisma.notification.update({
            where: { id: notificationId },
            data: {
              deliveryStatus: JSON.stringify(deliveryStatus),
            },
          });
        }

        return { success: true, messageId: response };
      } catch (error) {
        console.error(
          `Error processing push notification ${notificationId}:`,
          error
        );

        // Handle specific Firebase errors
        if (error instanceof Error) {
          const errorMessage = error.message.toLowerCase();

          // Invalid registration token - remove from device
          if (
            errorMessage.includes("invalid") ||
            errorMessage.includes("unregistered")
          ) {
            console.log(`Removing invalid FCM token for device ${job.data.deviceId}`);
            await prisma.device.update({
              where: { id: job.data.deviceId },
              data: { fcmToken: null, isActive: false },
            });
          }
        }

        // Mark as failed if max retries exceeded
        if (job.attemptsMade >= (job.opts.attempts || 3)) {
          const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
          });

          if (notification) {
            const deliveryStatus = (typeof notification.deliveryStatus === 'string'
              ? JSON.parse(notification.deliveryStatus)
              : (notification.deliveryStatus || {})) as any;
            deliveryStatus.push = "failed";

            await prisma.notification.update({
              where: { id: notificationId },
              data: {
                deliveryStatus: JSON.stringify(deliveryStatus),
              },
            });
          }
        }

        throw error; // Re-throw for Bull to handle retry
      }
    },
    {
      connection: redisConnection as any,
      concurrency: parseInt(process.env.NOTIFICATION_EMAIL_BATCH_SIZE || "10"),
    }
  );

  // Event handlers
  pushWorker.on("completed", (job) => {
    console.log(`✓ Push notification job completed: ${job.id}`);
  });

  pushWorker.on("failed", (job, err) => {
    console.error(`✗ Push notification job failed: ${job?.id}`, err.message);
  });

  pushWorker.on("error", (err) => {
    console.error("Push worker error:", err);
  });

  console.log("✓ Push notification worker initialized");
  return pushWorker;
}

/**
 * Register device with FCM token
 * Called when user enables push notifications on a device
 */
export async function registerDeviceForPush(
  userId: string,
  deviceId: string,
  fcmToken: string
): Promise<any> {
  // Verify device belongs to user
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device || device.userId !== userId) {
    throw new Error("Device does not belong to user");
  }

  // Update device with FCM token
  return prisma.device.update({
    where: { id: deviceId },
    data: {
      fcmToken,
      isActive: true,
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Unregister device from push notifications
 * Called when user disables push or logs out
 */
export async function unregisterDeviceFromPush(
  userId: string,
  deviceId: string
): Promise<any> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
  });

  if (!device || device.userId !== userId) {
    throw new Error("Device does not belong to user");
  }

  return prisma.device.update({
    where: { id: deviceId },
    data: {
      fcmToken: null,
    },
  });
}

export default createPushWorker;
