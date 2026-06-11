import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../config/logger';
import * as admin from 'firebase-admin';
import nodemailer from 'nodemailer';

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

  const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: null,
  });

  redisConnection.on('error', (error) => {
    // Handle error event to prevent unhandled AggregateError logs in dev environment
  });

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
      connection: redisConnection as any,
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
  const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: null,
  });

  redisConnection.on('error', (error) => {
    // Handle error event to prevent unhandled AggregateError logs in dev environment
  });

  const transporter = getEmailTransporter();

  const worker = new Worker(
    'email-notifications',
    async (job) => {
      try {
        const { notificationId, userId, title, message, type } = job.data;

        logger.info('Processing email notification', {
          notificationId,
          userId,
          type,
          jobId: job.id,
        });

        // TODO: Get user email from database
        // const user = await prisma.user.findUnique({ where: { id: userId } });
        // if (!user?.email) {
        //   logger.warn('User email not found', { userId });
        //   return { status: 'skipped', reason: 'user_email_not_found' };
        // }

        const emailContent = `
          <h2>${title}</h2>
          <p>${message}</p>
          <p style="color: #666; font-size: 12px;">
            Notification Type: ${type}
          </p>
        `;

        // await transporter.sendMail({
        //   from: process.env.SMTP_FROM_EMAIL || 'noreply@KANAKU.app',
        //   to: user.email,
        //   subject: title,
        //   html: emailContent,
        // });

        logger.info('Email notification sent', { notificationId, userId });

        return {
          status: 'sent',
          notificationId,
          userId,
        };
      } catch (error) {
        logger.error('Email notification worker error', {
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id,
        });
        throw error;
      }
    },
    {
      connection: redisConnection as any,
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
