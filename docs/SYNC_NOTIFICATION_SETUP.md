# Implementation Guide: Cross-Device Sync & Notifications

**Status:** Step-by-step setup guide with code templates  
**Target:** Phase 1-2 (Foundation + Event Triggers)

---

## Prerequisites Setup

### 1. Install Required Dependencies

```bash
cd backend

# Job queue & caching
npm install bull bullmq redis

# Firebase Cloud Messaging
npm install firebase-admin

# Email services (choose one)
npm install @sendgrid/mail  # OR
npm install mailgun-js      # OR
npm install nodemailer

# Encryption
npm install tweetnacl nacl-util

# Cron jobs
npm install node-cron

# Additional utilities
npm install dotenv uuid
```

### 2. Update Environment Variables

**`.env` / `.env.production`:**
```bash
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Firebase Cloud Messaging
FIREBASE_PROJECT_ID=your-project
FIREBASE_PRIVATE_KEY_ID=key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-admin@project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# Email Service
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
# OR
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_API_KEY=key-xxxxxxxxxxxx

# Frontend URL for deep links
FRONTEND_URL=http://localhost:5173

# Notification settings
NOTIFICATION_RATE_LIMIT=20          # requests per minute
NOTIFICATION_BATCH_SIZE=50          # emails per batch
NOTIFICATION_RETRY_ATTEMPTS=3
```

### 3. Initialize Firebase Admin SDK

```typescript
// backend/src/config/firebase.ts
import admin from 'firebase-admin';
import { logger } from './logger';

let firebaseApp: admin.app.App | null = null;

export function initializeFirebase() {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      clientId: process.env.FIREBASE_CLIENT_ID,
      authUri: process.env.FIREBASE_AUTH_URI,
      tokenUri: process.env.FIREBASE_TOKEN_URI,
    };

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as any),
    });

    logger.info('Firebase initialized successfully');
    return firebaseApp;
  } catch (error) {
    logger.error('Failed to initialize Firebase', { error });
    throw error;
  }
}

export function getFirebaseMessaging() {
  if (!firebaseApp) {
    initializeFirebase();
  }
  return admin.messaging(firebaseApp!);
}
```

### 4. Initialize Redis & Bull

```typescript
// backend/src/config/queue.ts
import Bull from 'bull';
import { logger } from './logger';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
};

export const emailQueue = new Bull('email-notifications', redisConfig);
export const pushQueue = new Bull('push-notifications', redisConfig);
export const syncQueue = new Bull('sync-operations', redisConfig);

// Set up error handling
emailQueue.on('error', (err) => logger.error('Email queue error', { err }));
pushQueue.on('error', (err) => logger.error('Push queue error', { err }));
syncQueue.on('error', (err) => logger.error('Sync queue error', { err }));

// Log completed jobs
emailQueue.on('completed', (job) => {
  logger.info(`Email job completed: ${job.id}`, { data: job.data });
});

pushQueue.on('completed', (job) => {
  logger.info(`Push job completed: ${job.id}`, { data: job.data });
});

// Log failed jobs
emailQueue.on('failed', (job, err) => {
  logger.error(`Email job failed: ${job.id}`, { error: err.message, data: job.data });
});

pushQueue.on('failed', (job, err) => {
  logger.error(`Push job failed: ${job.id}`, { error: err.message, data: job.data });
});
```

---

## Phase 1: Schema & Database Setup

### Step 1: Update Prisma Schema

**Edit `backend/prisma/schema.prisma`:**

```prisma
// Add fields to Device model
model Device {
  id              String   @id @default(uuid())
  userId          String
  deviceId        String   @unique
  deviceName      String?
  deviceType      String?  // "web", "android", "ios"
  platform        String?
  appVersion      String?
  fcmToken        String?  // Add this
  publicKey       String?  // Add this for E2E encryption
  isActive        Boolean  @default(true)
  isTrusted       Boolean  @default(false)
  lastSeenAt      DateTime @default(now())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([deviceId])
  @@index([isActive])
  @@index([userId])
  @@schema("public")
}

// Enhance Notification model
model Notification {
  id                String    @id @default(uuid())
  userId            String
  title             String
  message           String
  type              String    @default("info")
  category          String?
  deepLink          String?
  channels          String    @default("app")
  isRead            Boolean   @default(false)
  readAt            DateTime?
  deliveryStatus    String    @default("pending")
  deliveredAt       DateTime?
  failureReason     String?
  encryptionKey     String?
  encryptedPayload  String?
  createdAt         DateTime  @default(now())
  deletedAt         DateTime?
  sourceUserId      String?
  sourceEntity      String?
  sourceEntityId    String?
  syncStatus        String    @default("synced")
  sentToDevices     String    @default("[]")
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([createdAt])
  @@index([isRead])
  @@index([userId])
  @@index([deliveryStatus])
  @@index([type])
  @@schema("public")
}

// Enhance SyncQueue model
model SyncQueue {
  id           String    @id @default(uuid())
  userId       String
  deviceId     String
  entityType   String
  entityId     String
  operation    String
  data         String?
  status       String    @default("pending")
  errorMessage String?
  retryCount   Int       @default(0)
  maxRetries   Int       @default(5)
  createdAt    DateTime  @default(now())
  processedAt  DateTime?
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([createdAt])
  @@index([deviceId])
  @@index([entityType])
  @@index([status])
  @@index([userId, status])
  @@schema("public")
}
```

### Step 2: Create Migration

```bash
cd backend

# Generate migration
npx prisma migrate dev --name add_sync_notifications_fields

# Output should show:
# ✓ Prisma schema updated
# ✓ Database migration
```

### Step 3: Verify Schema

```bash
# Check updated schema
npx prisma studio

# Verify changes in PostgreSQL:
# psql $DATABASE_URL
# \d "Device"
# \d "Notification"
# \d "SyncQueue"
```

---

## Phase 1 Cont'd: Core Services

### Step 4: Create Notification Service

**File: `backend/src/modules/notifications/notification.service.ts`**

```typescript
import { prisma } from '../../db/prisma';
import { emailQueue, pushQueue } from '../../config/queue';
import { logger } from '../../config/logger';
import { Decimal } from '@prisma/client/runtime/library';

export interface NotificationPayload {
  userId: string;
  type: 'friend_request' | 'group_invite' | 'loan_due' | 'reminder' | 'goal_update' | 'transaction_update';
  title: string;
  message: string;
  channels: ('app' | 'email' | 'push')[];
  deepLink?: string;
  sourceUserId?: string;
  sourceEntityId?: string;
  sourceEntity?: string;
  data?: Record<string, any>;
}

export async function createNotification(payload: NotificationPayload) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        channels: payload.channels.join(','),
        deepLink: payload.deepLink,
        sourceUserId: payload.sourceUserId,
        sourceEntityId: payload.sourceEntityId,
        sourceEntity: payload.sourceEntity,
        syncStatus: 'pending',
        sentToDevices: JSON.stringify([]),
      },
    });

    logger.info('Notification created', {
      notificationId: notification.id,
      userId: payload.userId,
      type: payload.type,
    });

    // Queue delivery
    await queueNotificationDelivery(notification);

    return notification;
  } catch (error) {
    logger.error('Failed to create notification', {
      error,
      payload,
    });
    throw error;
  }
}

async function queueNotificationDelivery(notification: any) {
  const channels = notification.channels.split(',');

  if (channels.includes('app')) {
    // Broadcast via Socket.IO (handled in socket manager)
    // Mark as sent to active devices
    const devices = await prisma.device.findMany({
      where: { userId: notification.userId, isActive: true },
    });

    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        sentToDevices: JSON.stringify(devices.map(d => d.id)),
        deliveryStatus: devices.length > 0 ? 'sent' : 'pending',
      },
    });
  }

  if (channels.includes('email')) {
    await emailQueue.add(
      {
        type: 'notification',
        notificationId: notification.id,
        userId: notification.userId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );
  }

  if (channels.includes('push')) {
    await pushQueue.add(
      {
        type: 'notification',
        notificationId: notification.id,
        userId: notification.userId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );
  }
}

export async function markNotificationAsRead(
  notificationId: string,
  userId: string
) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    throw new Error('Notification not found or access denied');
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

export async function deleteNotification(
  notificationId: string,
  userId: string
) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    throw new Error('Notification not found or access denied');
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: {
      deletedAt: new Date(),
    },
  });
}
```

### Step 5: Create Email Queue Worker

**File: `backend/src/workers/email.worker.ts`**

```typescript
import { emailQueue } from '../config/queue';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

interface EmailJob {
  type: 'notification';
  notificationId: string;
  userId: string;
}

export function startEmailWorker() {
  emailQueue.process(async (job) => {
    const jobData = job.data as EmailJob;

    if (jobData.type === 'notification') {
      return handleNotificationEmail(jobData);
    }

    throw new Error(`Unknown email job type: ${jobData.type}`);
  });

  logger.info('Email worker started');
}

async function handleNotificationEmail({
  notificationId,
  userId,
}: {
  notificationId: string;
  userId: string;
}) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new Error(`Notification not found: ${notificationId}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user?.email) {
    logger.warn('User has no email, skipping email delivery', { userId });
    return;
  }

  // Build email content
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${notification.title}</h2>
      <p>${notification.message}</p>
      ${
        notification.deepLink
          ? `<a href="${process.env.FRONTEND_URL}${notification.deepLink}" style="
            display: inline-block;
            padding: 10px 20px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
          ">View Details</a>`
          : ''
      }
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
      <p style="font-size: 12px; color: #666;">
        You received this email because of your Finora notification preferences.
        <a href="${process.env.FRONTEND_URL}/settings/notifications">Manage preferences</a>
      </p>
    </div>
  `;

  try {
    await sgMail.send({
      to: user.email,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@finora.app',
      subject: notification.title,
      html: emailHtml,
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
    });

    logger.info('Email sent successfully', {
      notificationId,
      userId,
      email: user.email,
    });

    // Update notification status
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        deliveryStatus: 'sent',
        deliveredAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('Failed to send email', {
      notificationId,
      userId,
      error,
    });

    throw error; // Bull will retry
  }
}
```

### Step 6: Create Push Notification Worker

**File: `backend/src/workers/push.worker.ts`**

```typescript
import { pushQueue } from '../config/queue';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { getFirebaseMessaging } from '../config/firebase';

interface PushJob {
  type: 'notification';
  notificationId: string;
  userId: string;
}

export function startPushWorker() {
  pushQueue.process(async (job) => {
    const jobData = job.data as PushJob;

    if (jobData.type === 'notification') {
      return handleNotificationPush(jobData);
    }

    throw new Error(`Unknown push job type: ${jobData.type}`);
  });

  logger.info('Push notification worker started');
}

async function handleNotificationPush({
  notificationId,
  userId,
}: {
  notificationId: string;
  userId: string;
}) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new Error(`Notification not found: ${notificationId}`);
  }

  // Get user's active devices with FCM tokens
  const devices = await prisma.device.findMany({
    where: {
      userId,
      isActive: true,
      fcmToken: { not: null },
    },
    select: { fcmToken: true },
  });

  const fcmTokens = devices
    .map(d => d.fcmToken)
    .filter((token): token is string => !!token);

  if (fcmTokens.length === 0) {
    logger.info('No FCM tokens available for user', { userId });
    return;
  }

  try {
    const messaging = getFirebaseMessaging();

    const message = {
      notification: {
        title: notification.title,
        body: notification.message,
      },
      data: {
        type: notification.type,
        notificationId: notification.id,
        deepLink: notification.deepLink || '',
      },
      webpush: {
        fcmOptions: {
          link: notification.deepLink
            ? `${process.env.FRONTEND_URL}${notification.deepLink}`
            : process.env.FRONTEND_URL,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            alert: {
              title: notification.title,
              body: notification.message,
            },
            badge: 1,
          },
        },
      },
      android: {
        notification: {
          sound: 'default',
          clickAction: notification.deepLink
            ? `${process.env.FRONTEND_URL}${notification.deepLink}`
            : undefined,
        },
      },
    };

    const response = await messaging.sendMulticast(message);

    logger.info('Push notifications sent', {
      notificationId,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    // Update notification status
    const deliveryStatus =
      response.failureCount === 0
        ? 'sent'
        : response.successCount > 0
        ? 'sent' // Partial success still counts as sent
        : 'failed';

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        deliveryStatus,
        deliveredAt: new Date(),
      },
    });

    // Log failed tokens for cleanup
    if (response.failureCount > 0) {
      const failedTokens = response.responses
        .map((resp, idx) => (!resp.success ? fcmTokens[idx] : null))
        .filter(Boolean);

      logger.warn('Some push deliveries failed', {
        notificationId,
        failedTokens,
      });

      // Mark failed tokens as inactive (optional cleanup)
      if (failedTokens.length > 0) {
        await prisma.device.updateMany({
          where: {
            fcmToken: { in: failedTokens as string[] },
          },
          data: {
            isActive: false,
          },
        });
      }
    }
  } catch (error) {
    logger.error('Failed to send push notifications', {
      notificationId,
      userId,
      error,
    });

    throw error; // Bull will retry
  }
}
```

---

## Phase 2: API Routes & Event Triggers

### Step 7: Create Notification Routes

**File: `backend/src/modules/notifications/notification.routes.ts`**

```typescript
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { z } from 'zod';
import {
  getNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from './notification.controller';

const router = Router();

// List notifications
router.get(
  '/',
  authMiddleware,
  validate('query', z.object({
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
    unreadOnly: z.enum(['true', 'false']).default('false'),
    type: z.string().optional(),
  })),
  getNotifications
);

// Get single notification
router.get(
  '/:id',
  authMiddleware,
  validate('params', z.object({ id: z.string().uuid() })),
  getNotification
);

// Mark as read
router.patch(
  '/:id/read',
  authMiddleware,
  validate('params', z.object({ id: z.string().uuid() })),
  markAsRead
);

// Mark all as read
router.patch(
  '/read-all',
  authMiddleware,
  markAllAsRead
);

// Delete notification
router.delete(
  '/:id',
  authMiddleware,
  validate('params', z.object({ id: z.string().uuid() })),
  deleteNotification
);

export { router as notificationRoutes };
```

**File: `backend/src/modules/notifications/notification.controller.ts`**

```typescript
import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import {
  markNotificationAsRead,
  deleteNotification as deleteNotifService,
} from './notification.service';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { limit, offset, unreadOnly, type } = req.query as {
      limit: string;
      offset: string;
      unreadOnly: string;
      type?: string;
    };

    const where: any = { userId, deletedAt: null };

    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    if (type) {
      where.type = type;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      success: true,
      data: notifications,
      pagination: { offset: parseInt(offset), limit: parseInt(limit), total },
    });
  } catch (error) {
    logger.error('Failed to fetch notifications', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
};

export const getNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    logger.error('Failed to fetch notification', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch notification' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const notification = await markNotificationAsRead(id, userId);

    res.json({ success: true, data: notification });
  } catch (error) {
    logger.error('Failed to mark notification as read', { error });
    res.status(500).json({ success: false, error: 'Failed to mark as read' });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false, deletedAt: null },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({ success: true, data: { updated: result.count } });
  } catch (error) {
    logger.error('Failed to mark all notifications as read', { error });
    res.status(500).json({ success: false, error: 'Failed to mark all as read' });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    await deleteNotifService(id, userId);

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    logger.error('Failed to delete notification', { error });
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
};
```

---

### Step 8: Device Registration Route

**File: `backend/src/modules/auth/device.routes.ts` (new file)**

```typescript
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { Response } from 'express';
import { logger } from '../../config/logger';
import { randomUUID } from 'crypto';

const router = Router();

router.post(
  '/devices/register',
  authMiddleware,
  validate('body', z.object({
    deviceId: z.string().min(1),
    deviceName: z.string().optional(),
    deviceType: z.enum(['web', 'android', 'ios']).default('web'),
    appVersion: z.string().optional(),
    fcmToken: z.string().optional(),
    publicKey: z.string().optional(), // Base64-encoded NaCl public key
  })),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = getUserId(req);
      const { deviceId, deviceName, deviceType, appVersion, fcmToken, publicKey } = req.body;

      // Check if device already exists
      let device = await prisma.device.findUnique({
        where: { deviceId },
      });

      if (device) {
        // Update existing device
        device = await prisma.device.update({
          where: { deviceId },
          data: {
            fcmToken: fcmToken || device.fcmToken,
            publicKey: publicKey || device.publicKey,
            appVersion,
            deviceName,
            isActive: true,
            lastSeenAt: new Date(),
          },
        });

        logger.info('Device updated', { userId, deviceId });
      } else {
        // Create new device
        device = await prisma.device.create({
          data: {
            id: randomUUID(),
            userId,
            deviceId,
            deviceName,
            deviceType,
            appVersion,
            fcmToken,
            publicKey,
            isActive: true,
          },
        });

        logger.info('Device registered', { userId, deviceId });
      }

      res.json({
        success: true,
        data: {
          id: device.id,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          isActive: device.isActive,
          registeredAt: device.createdAt,
        },
      });
    } catch (error) {
      logger.error('Failed to register device', { error });
      res.status(500).json({ success: false, error: 'Failed to register device' });
    }
  }
);

router.get(
  '/devices',
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = getUserId(req);

      const devices = await prisma.device.findMany({
        where: { userId },
        select: {
          id: true,
          deviceId: true,
          deviceName: true,
          platform: true,
          appVersion: true,
          isActive: true,
          lastSeenAt: true,
          createdAt: true,
        },
        orderBy: { lastSeenAt: 'desc' },
      });

      res.json({ success: true, data: devices });
    } catch (error) {
      logger.error('Failed to fetch devices', { error });
      res.status(500).json({ success: false, error: 'Failed to fetch devices' });
    }
  }
);

export { router as deviceRoutes };
```

### Step 9: Register Routes in App

**Update `backend/src/routes/index.ts`:**

```typescript
import { notificationRoutes } from '../modules/notifications/notification.routes';
import { deviceRoutes } from '../modules/auth/device.routes';
// ... other imports

export function setupApiRoutes(app: Express) {
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/auth', deviceRoutes);
  // ... other routes
}
```

---

## Phase 2: Initialize Workers

### Step 10: Start Workers on Server Boot

**Update `backend/src/server.ts`:**

```typescript
import { startEmailWorker } from './workers/email.worker';
import { startPushWorker } from './workers/push.worker';
import { initializeFirebase } from './config/firebase';
import { logger } from './config/logger';

async function startServer() {
  // ... existing setup

  // Initialize external services
  try {
    initializeFirebase();
    logger.info('Firebase initialized');
  } catch (error) {
    logger.warn('Firebase initialization skipped', { error });
  }

  // Start background workers
  if (process.env.NODE_ENV !== 'test') {
    try {
      startEmailWorker();
      startPushWorker();
      logger.info('Background workers started');
    } catch (error) {
      logger.error('Failed to start workers', { error });
    }
  }

  // ... rest of startup
}
```

---

## Testing Checklist

### Unit Tests

```bash
cd backend

# Create test file
cat > tests/notifications.test.ts << 'EOF'
import { describe, it, expect, beforeEach } from 'vitest';
import { createNotification } from '../src/modules/notifications/notification.service';
import { prisma } from '../src/db/prisma';

describe('Notification Service', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.notification.deleteMany({});
  });

  it('should create a notification', async () => {
    const notification = await createNotification({
      userId: 'test-user-123',
      type: 'friend_request',
      title: 'New Friend Request',
      message: 'John added you as a friend',
      channels: ['app', 'email'],
      deepLink: '/friends',
    });

    expect(notification).toBeDefined();
    expect(notification.type).toBe('friend_request');
    expect(notification.channels).toContain('app');
  });

  it('should mark notification as read', async () => {
    const notification = await createNotification({
      userId: 'test-user-123',
      type: 'friend_request',
      title: 'New Friend Request',
      message: 'John added you as a friend',
      channels: ['app'],
    });

    const updated = await markNotificationAsRead(notification.id, 'test-user-123');
    expect(updated.isRead).toBe(true);
    expect(updated.readAt).toBeDefined();
  });
});
EOF

# Run tests
npm test
```

### Integration Test (API)

```bash
# Test notification endpoints
curl -X GET http://localhost:3000/api/v1/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Register device
curl -X POST http://localhost:3000/api/v1/auth/devices/register \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-123",
    "deviceName": "My Phone",
    "deviceType": "android",
    "fcmToken": "fcm-token-xxx",
    "publicKey": "base64-encoded-key"
  }'

# Check devices
curl -X GET http://localhost:3000/api/v1/auth/devices \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Next Steps

1. **Complete Phase 1** → Run migrations and verify schema
2. **Deploy workers** → Start email and push workers
3. **Test integration** → Verify notifications are created and delivered
4. **Phase 2** → Implement friend request notifications (see next document)
5. **Phase 3** → Add group expense notifications
6. **Phase 4** → Implement loan reminders with cron jobs

Continue to [SYNC_NOTIFICATION_PHASE2.md](./SYNC_NOTIFICATION_PHASE2.md) for friend requests & group notifications implementation.
