import { Worker, Job } from "bullmq";
import { prisma } from "../utils/prisma";
import sgMail from "@sendgrid/mail";
import { redisConnection } from "../config/queue";

/**
 * Email Worker
 * Processes email notification jobs from the queue
 * Handles retries, failures, and delivery status tracking
 */

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY || "");

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "notifications@kanaku.app";
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://kanaku-fawn.vercel.app').replace(/\/$/, '');

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

        // Compose email
        const html = generateEmailHTML({
          title,
          message,
          category,
          deepLink,
        });

        // Send email via SendGrid
        await sgMail.send({
          to: user.email,
          from: { email: FROM_EMAIL, name: 'Kanaku' },
          subject: title,
          html,
          categories: ["kanaku-notifications", category || "general"],
          headers: {
            "X-Notification-ID": notificationId,
            "List-Unsubscribe": `<${FRONTEND_URL}/settings/notifications>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });

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

/**
 * Generate HTML email template
 */
function generateEmailHTML({
  title,
  message,
  category,
  deepLink,
}: {
  title: string;
  message: string;
  category?: string;
  deepLink?: string;
}): string {
  const actionButton = deepLink
    ? `<a href="${FRONTEND_URL}${deepLink}" style="display: inline-block; padding: 12px 24px; background-color: #5B21B6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px;">View Details</a>`
    : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
          .card { background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .header { margin-bottom: 24px; border-bottom: 2px solid #5B21B6; padding-bottom: 16px; }
          .logo { font-size: 24px; font-weight: bold; color: #5B21B6; }
          .title { font-size: 22px; font-weight: 600; margin: 16px 0 8px 0; color: #1f2937; }
          .category { font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
          .message { font-size: 16px; margin: 20px 0; color: #4b5563; line-height: 1.8; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
          .button { display: inline-block; padding: 12px 24px; background-color: #5B21B6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <div class="logo">KANAKU</div>
            </div>
            ${category ? `<div class="category">${escapeHtml(category)}</div>` : ""}
            <div class="title">${escapeHtml(title)}</div>
            <div class="message">${escapeHtml(message)}</div>
            ${actionButton}
            <div class="footer">
              <p>This is an automated notification from KANAKU. You can manage your preferences in your account settings.</p>
              <p>&copy; ${new Date().getFullYear()} KANAKU. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

export default createEmailWorker;
