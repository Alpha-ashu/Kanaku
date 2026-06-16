import { Worker, Queue } from 'bullmq';
import { logger } from '../config/logger';
import * as admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import { prisma } from '../db/prisma';
import { sendEmail } from '../utils/email';
import { redisConnection as sharedRedisConnection } from '../config/queue';

// Initialize Firebase Admin if not already done
let firebaseInitialized = false;
let firebaseApp: any = null;

const initializeFirebase = () => {
  if (firebaseInitialized) return;

  try {
    // Firebase credentials should be in .env as JSON string
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : undefined;

    if (!serviceAccount) {
      logger.warn('Firebase service account not configured. Push notifications will not work.');
      firebaseInitialized = true;
      return;
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    logger.info('Firebase Admin SDK initialized');
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', error);
    firebaseInitialized = true;
  }
};

// Email transporter setup
const getEmailTransporter = () => {
  if (process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  // Fallback SMTP config
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
};

/**
 * Initialize push notification worker
 */
export const initializePushWorker = (pushQueue: Queue) => {
  initializeFirebase();

  // Reuse the same Redis connection the queues are created with (config/queue.ts
  // resolves REDIS_URL in production, not just REDIS_HOST/PORT) — otherwise this
  // worker silently connects to a different (often unreachable) Redis instance
  // and never picks up jobs that were actually enqueued.
  const worker = new Worker(
    'push-notifications',
    async (job) => {
      try {
        const { notificationId, userId, deviceId, fcmToken, title, message, deepLink, priority } =
          job.data;

        logger.info('Processing push notification', {
          notificationId,
          deviceId,
          jobId: job.id,
        });

        if (!firebaseApp) {
          logger.warn('Firebase not initialized. Skipping push notification.');
          return { status: 'skipped', reason: 'firebase_not_initialized' };
        }

        // firebase-admin v13: use send() with token field instead of sendToDevice()
        const fcmMessage = {
          notification: {
            title,
            body: message,
          },
          data: {
            notificationId,
            userId,
            deviceId,
            type: 'in-app-notification',
            ...(deepLink && { deepLink }),
          },
          token: fcmToken,
          android: {
            priority: (priority === 'high' ? 'high' : 'normal') as 'high' | 'normal',
            ttl: 86400 * 1000, // 24 hours in ms
          },
        };

        const messageId = await admin.messaging().send(fcmMessage);

        logger.info('Push notification sent', {
          notificationId,
          deviceId,
          messageId,
        });

        return {
          status: 'sent',
          notificationId,
          deviceId,
          messageId,
        };
      } catch (error) {
        logger.error('Push notification worker error', {
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id,
        });
        throw error;
      }
    },
    {
      connection: sharedRedisConnection as any,
      concurrency: 10, // Process 10 notifications concurrently
    }
  );

  worker.on('completed', (job) => {
    logger.debug(`Push job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Push job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    // Suppress/log connection errors when Redis is offline in dev
  });

  logger.info('Push notification worker initialized');
  return worker;
};

/**
 * Initialize email notification worker
 */
export const initializeEmailWorker = (emailQueue: Queue) => {
  // Reuse the same Redis connection the queues are created with (see note on
  // initializePushWorker above).

  // Reserved for any future non-SendGrid SMTP fallback; the active send path
  // below goes through utils/email.ts (SendGrid) to match the rest of the app.
  void getEmailTransporter;

  const worker = new Worker(
    'email-notifications',
    async (job) => {
      const { notificationId, userId, title, message, category, deepLink } = job.data;

      try {
        logger.info('Processing email notification', {
          notificationId,
          userId,
          category,
          jobId: job.id,
        });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.email) {
          logger.warn('Email notification skipped: user not found or has no email', { userId });
          return { status: 'skipped', reason: 'user_email_not_found' };
        }

        const sent = await sendEmail({
          to: user.email,
          subject: title,
          html: buildNotificationEmailHtml({ title, message, category, deepLink }),
          categories: ['kanaku-notification', category || 'general'],
          headers: {
            'X-Notification-ID': notificationId,
            'X-User-ID': userId,
          },
        });

        if (notificationId) {
          try {
            const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
            if (notification) {
              const deliveryStatus = (typeof notification.deliveryStatus === 'string'
                ? JSON.parse(notification.deliveryStatus)
                : (notification.deliveryStatus || {})) as any;
              deliveryStatus.email = sent ? 'sent' : 'failed';
              await prisma.notification.update({
                where: { id: notificationId },
                data: { deliveryStatus: JSON.stringify(deliveryStatus) },
              });
            }
          } catch (statusErr) {
            logger.warn('Failed to update notification delivery status', statusErr);
          }
        }

        if (!sent) {
          throw new Error('SendGrid delivery failed');
        }

        logger.info('Email notification sent', { notificationId, userId, to: user.email });

        return { status: 'sent', notificationId, userId };
      } catch (error) {
        logger.error('Email notification worker error', {
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id,
        });
        throw error;
      }
    },
    {
      connection: sharedRedisConnection as any,
      concurrency: 5, // Process 5 emails concurrently
    }
  );

  worker.on('completed', (job) => {
    logger.debug(`Email job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Email job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    // Suppress/log connection errors when Redis is offline in dev
  });

  logger.info('Email notification worker initialized');
  return worker;
};

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

function buildNotificationEmailHtml(args: { title: string; message: string; category?: string; deepLink?: string }): string {
  const { title, message, category, deepLink } = args;
  const actionButton = deepLink
    ? `<a href="${process.env.FRONTEND_URL || ''}${deepLink}" style="display: inline-block; padding: 12px 24px; background-color: #5B21B6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px;">View Details</a>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
          .card { background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .header { margin-bottom: 24px; border-bottom: 2px solid #5B21B6; padding-bottom: 16px; }
          .logo { font-size: 24px; font-weight: bold; color: #5B21B6; }
          .title { font-size: 22px; font-weight: 600; margin: 16px 0 8px 0; color: #1f2937; }
          .category { font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
          .message { font-size: 16px; margin: 20px 0; color: #4b5563; line-height: 1.8; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header"><div class="logo">KANAKU</div></div>
            ${category ? `<div class="category">${escapeHtml(category)}</div>` : ''}
            <div class="title">${escapeHtml(title)}</div>
            <div class="message">${escapeHtml(message)}</div>
            ${actionButton}
            <div class="footer">
              <p>This is an automated notification from Kanaku.</p>
              <p>&copy; ${new Date().getFullYear()} Kanaku. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Initialize all notification workers
 */
export const initializeNotificationWorkers = (pushQueue: Queue, emailQueue: Queue) => {
  try {
    const pushWorker = initializePushWorker(pushQueue);
    const emailWorker = initializeEmailWorker(emailQueue);

    return {
      pushWorker,
      emailWorker,
    };
  } catch (error) {
    logger.error('Failed to initialize notification workers:', error);
    throw error;
  }
};
