import { Worker, Job } from "bullmq";
import { prisma } from "../utils/prisma";
import { redisConnection } from "../config/queue";
import { sendNotificationEmail } from "../emails";

/**
 * Email Worker
 * Processes email notification jobs from the queue
 * Handles retries, failures, and delivery status tracking
 */

const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

interface EmailNotificationJob {
  notificationId: string;
  userId: string;
  title: string;
  message: string;
  category?: string;
  deepLink?: string;
}

/**
 * Create and start email worker
 */
export function createEmailWorker() {
  const emailWorker = new Worker(
    "email-notifications",
    async (job: Job<EmailNotificationJob>) => {
      const { notificationId, userId, title, message, category, deepLink } =
        job.data;

      try {
        // Get user email
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user || !user.email) {
          throw new Error(`User ${userId} not found or has no email`);
        }

        // Check notification preferences (implement your preference model)
        // const prefs = await prisma.userNotificationPreference.findUnique({
        //   where: { userId },
        // });
        // if (!prefs?.emailEnabled) {
        //   console.log(`Email notifications disabled for user ${userId}`);
        //   return { skipped: true };
        // }

        // Rate limiting check
        const emailCount = await prisma.notification.count({
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
        if (emailCount > rateLimit) {
          console.warn(
            `Rate limit exceeded for user ${userId} (${emailCount}/${rateLimit} in last hour)`
          );
          // Don't fail, just skip
          return { rateLimited: true };
        }

        // Render + send via the shared emails module (single SendGrid provider).
        const sent = await sendNotificationEmail({
          to: user.email,
          title,
          message,
          category,
          deepLink,
          headers: {
            "X-Notification-ID": notificationId,
            "List-Unsubscribe": `<${FRONTEND_URL}/settings/notifications>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        if (!sent) {
          throw new Error(`SendGrid send failed for notification ${notificationId}`);
        }

        console.log(`✓ Email sent to ${user.email} (notification: ${notificationId})`);

        // Update notification delivery status
        const notification = await prisma.notification.findUnique({
          where: { id: notificationId },
        });

        if (notification) {
          const deliveryStatus = (typeof notification.deliveryStatus === 'string'
            ? JSON.parse(notification.deliveryStatus)
            : (notification.deliveryStatus || {})) as any;
          deliveryStatus.email = "sent";

          await prisma.notification.update({
            where: { id: notificationId },
            data: {
              deliveryStatus: JSON.stringify(deliveryStatus),
            },
          });
        }

        return { success: true, email: user.email };
      } catch (error) {
        console.error(
          `Error processing email notification ${notificationId}:`,
          error
        );

        // Update delivery status to failed if max retries exceeded
        if (job.attemptsMade >= (job.opts.attempts || 3)) {
          const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
          });

          if (notification) {
            const deliveryStatus = (typeof notification.deliveryStatus === 'string'
              ? JSON.parse(notification.deliveryStatus)
              : (notification.deliveryStatus || {})) as any;
            deliveryStatus.email = "failed";

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
      concurrency: parseInt(process.env.EMAIL_WORKER_CONCURRENCY || process.env.NOTIFICATION_EMAIL_BATCH_SIZE || "50"),
    }
  );

  // Event handlers
  emailWorker.on("completed", (job) => {
    console.log(`✓ Email job completed: ${job.id}`);
  });

  emailWorker.on("failed", (job, err) => {
    console.error(`✗ Email job failed: ${job?.id}`, err.message);
  });

  emailWorker.on("error", (err) => {
    console.error("Email worker error:", err);
  });

  console.log("✓ Email worker initialized");
  return emailWorker;
}

export default createEmailWorker;
