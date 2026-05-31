# Cross-Device Sync & Notification System Architecture

**Date:** May 2026  
**Status:** Implementation Guide  
**Scope:** Integrate push notifications, real-time sync, and reminder system while preserving offline-first architecture

---

## Executive Summary

This document describes how to integrate a **production-grade cross-device syncing and notification system** into Finora while maintaining:
- ✅ Offline-first data flow (Dexie → API → PostgreSQL)
- ✅ Server-authoritative monetary logic
- ✅ Role-based access control
- ✅ Financial-grade security (OAuth, HTTPS, encryption)
- ✅ Existing React/Capacitor UI framework

**Key deliverables:**
1. Real-time delta sync across user's devices
2. Push notifications (email + in-app) for friend requests, group invites, loan due dates
3. Reminder system for deadlines and tasks
4. Encrypted device communication
5. Secure notification channels (OAuth 2.0 + HTTPS)

---

## Current Architecture Assessment

### What's Already in Place

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| **Socket.IO** | ✅ Active | `backend/src/sockets/` | Multi-device tracking, user/device mapping |
| **JWT + Supabase Auth** | ✅ Configured | `backend/src/middleware/auth.ts` | OAuth-ready, rate-limited |
| **Notifications Table** | ✅ Exists | Prisma schema | Basic model; needs enhancement |
| **Device Model** | ✅ Multi-device | Prisma schema | deviceId, platform, isActive tracking |
| **SyncQueue Table** | ✅ Exists | Prisma schema | Pending operations queue |
| **Helmet + CORS** | ✅ Enforced | `backend/src/app.ts` | CSP headers, rate limits |
| **API Versioning** | ✅ Enforced | `/api/v1/*` | All routes use versioning |
| **Validation Middleware** | ✅ Active | `backend/src/middleware/validate.ts` | Input sanitization |
| **GroupExpenseMember** | ✅ Relations | Prisma schema | Many-to-many group participation |
| **Dexie Sync** | ✅ Framework | Frontend services | Local-first write, async cloud sync |

### Security Posture

**Strengths:**
- JWT + Supabase auth foundation
- Helmet CSP + CORS controls
- Rate limiting on auth endpoints (5 req/min)
- Request ID stamping for audit trail
- Device-level tracking

**Gaps to Address:**
- Notification encryption (data at rest + in transit)
- Cross-device token refresh strategy
- Push notification provider integration
- Real-time event encryption for Socket.IO
- Rate limiting for notification dispatch
- Reminder trigger security

---

## System Design: Cross-Device Sync & Notifications

### 1. Enhanced Notification Model

**Extend Prisma Schema:**
```prisma
model Notification {
  id                String       @id @default(uuid())
  userId            String
  
  // Core
  title             String
  message           String
  type              String       @default("info")  // friend_request, group_invite, loan_due, reminder, transaction_update
  category          String?
  deepLink          String?
  
  // Multi-channel support
  channels          String       @default("app")   // "app", "email", "push" (comma-separated)
  
  // Tracking
  isRead            Boolean      @default(false)
  readAt            DateTime?
  deliveryStatus    String       @default("pending") // pending, sent, failed, bounced
  deliveredAt       DateTime?
  failureReason     String?
  
  // Encryption
  encryptionKey     String?      // Device-specific key reference
  encryptedPayload  String?      // Optional: encrypted sensitive data
  
  // Metadata
  createdAt         DateTime     @default(now())
  deletedAt         DateTime?
  sourceUserId      String?      // Who triggered the notification (friend, group creator, system)
  sourceEntity      String?      // "friend", "group", "loan", "reminder", "goal"
  sourceEntityId    String?      // ID of triggering entity
  
  // Sync tracking
  syncStatus        String       @default("synced")  // pending, synced, failed
  sentToDevices     String       @default("[]")      // JSON array of device IDs
  
  user              User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([createdAt])
  @@index([isRead])
  @@index([userId])
  @@index([deliveryStatus])
  @@index([sourceUserId])
  @@index([type])
  @@schema("public")
}
```

### 2. Multi-Device Real-Time Sync Architecture

#### A. WebSocket-Based Delta Sync

**Socket.IO Rooms per User:**
```typescript
// User joins room on app startup/re-auth
socket.on('connect', () => {
  socket.emit('device:register', {
    deviceId: 'abc-123',
    platform: 'web' | 'android' | 'ios',
    appVersion: '1.2.3'
  });
  
  socket.join(`user:${userId}`);  // Broadcast room for all user's devices
  socket.join(`device:${deviceId}`);  // Device-specific room
});

// Server broadcasts sync deltas to all user devices
io.to(`user:${userId}`).emit('sync:delta', {
  timestamp: Date.now(),
  entities: [
    { type: 'notification', id, status: 'sent', deliveredAt: ... },
    { type: 'transaction', id, syncStatus: 'synced' },
    { type: 'groupExpense', id, paidBy: '...', status: 'updated' }
  ]
});
```

**Sync Operations:**
1. **Write on Primary Device:** Dexie.js local store + optimistic UI update
2. **API Call:** `/api/v1/sync/batch` with encrypted payload
3. **Database Commit:** Transaction-wrapped update (balance changes + notifications)
4. **Broadcast:** Socket.IO emit delta to all other devices
5. **Local Merge:** Other devices merge delta into Dexie

#### B. Conflict Resolution

```typescript
// Last-write-wins for non-monetary fields
if (incoming.timestamp > local.timestamp) {
  local = incoming;
}

// Server-authoritative for balance/amounts
// Client never accepts balance changes from sync delta
// Always re-fetch account balance from API
const balance = await api.get(`/api/v1/accounts/${id}/balance`);
```

#### C. Offline Queue Management

**SyncQueue Enhancement:**
```prisma
model SyncQueue {
  id           String    @id @default(uuid())
  userId       String
  deviceId     String    // Source device
  entityType   String    // transaction, notification, groupExpense, friend, goal, etc.
  entityId     String
  operation    String    // CREATE, UPDATE, DELETE, ACKNOWLEDGE
  data         String?   // JSON payload
  status       String    @default("pending") // pending, processing, synced, failed
  errorMessage String?
  retryCount   Int       @default(0)
  maxRetries   Int       @default(5)
  createdAt    DateTime  @default(now())
  processedAt  DateTime?
  
  @@index([userId, deviceId, createdAt])
  @@index([status])
}
```

---

### 3. Notification Dispatch System

#### A. Notification Triggers

**Create helper to trigger notifications across channels:**

```typescript
// backend/src/modules/notifications/notification.service.ts

export interface NotificationPayload {
  userId: string;
  type: 'friend_request' | 'group_invite' | 'loan_due' | 'reminder' | 'goal_update';
  title: string;
  message: string;
  channels: ('app' | 'email' | 'push')[];
  deepLink?: string;
  sourceUserId?: string;
  sourceEntityId?: string;
  sourceEntity?: string;
  data?: Record<string, any>; // Custom metadata for deepLink resolution
}

export async function createNotification(payload: NotificationPayload): Promise<Notification> {
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
  
  // Queue async delivery
  await queueNotificationDelivery(notification);
  
  return notification;
}

async function queueNotificationDelivery(notification: Notification) {
  // Get user's active devices
  const devices = await prisma.device.findMany({
    where: { userId: notification.userId, isActive: true },
  });
  
  if (notification.channels.includes('app')) {
    // Broadcast via Socket.IO
    io.to(`user:${notification.userId}`).emit('notification:new', {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      deepLink: notification.deepLink,
      createdAt: notification.createdAt,
    });
    
    // Mark as sent to active devices
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        sentToDevices: JSON.stringify(devices.map(d => d.id)),
        deliveryStatus: devices.length > 0 ? 'sent' : 'pending',
      },
    });
  }
  
  if (notification.channels.includes('email')) {
    // Queue email job (see Section 3B)
    await emailQueue.add({
      type: 'notification',
      notificationId: notification.id,
      userId: notification.userId,
    });
  }
  
  if (notification.channels.includes('push')) {
    // Queue push notification job (see Section 3C)
    await pushQueue.add({
      type: 'notification',
      notificationId: notification.id,
      userId: notification.userId,
      devices: devices,
    });
  }
}
```

#### B. Email Notifications (Queue-Based)

**Use a job queue library (Bull/BullMQ with Redis):**

```typescript
// backend/src/modules/notifications/email.queue.ts
import Bull from 'bull';

const emailQueue = new Bull('email', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.NODE_ENV === 'production' ? {} : undefined,
  },
});

emailQueue.process(async (job) => {
  const { notificationId, userId } = job.data;
  
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  
  try {
    await sendEmailNotification(user, notification);
    
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        deliveryStatus: 'sent',
        deliveredAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('Email delivery failed', { notificationId, error });
    throw error; // Bull will retry
  }
});

async function sendEmailNotification(user: any, notification: any) {
  // Use SendGrid, Mailgun, or similar
  const emailContent = renderEmailTemplate({
    recipient: user.name,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    deepLink: notification.deepLink ? `${FRONTEND_URL}${notification.deepLink}` : undefined,
  });
  
  await emailProvider.send({
    to: user.email,
    subject: notification.title,
    html: emailContent,
  });
}
```

#### C. Push Notifications (Firebase Cloud Messaging)

```typescript
// backend/src/modules/notifications/push.queue.ts
import admin from 'firebase-admin';

const pushQueue = new Bull('push-notifications', { redis: redisConfig });

pushQueue.process(async (job) => {
  const { notificationId, userId, devices } = job.data;
  
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  
  // Get FCM tokens for user's active devices
  const tokens = await prisma.device.findMany({
    where: { userId, id: { in: devices.map(d => d.id) }, isActive: true },
    select: { fcmToken: true },
  });
  
  const fcmTokens = tokens
    .filter(t => t.fcmToken)
    .map(t => t.fcmToken as string);
  
  if (fcmTokens.length === 0) {
    logger.warn('No FCM tokens available', { userId });
    return;
  }
  
  try {
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
        fcmOptions: { link: `${FRONTEND_URL}${notification.deepLink || ''}` },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            alert: { title: notification.title, body: notification.message },
          },
        },
      },
    };
    
    const response = await admin.messaging().sendMulticast({
      tokens: fcmTokens,
      ...message,
    });
    
    logger.info('Push notifications sent', { 
      successCount: response.successCount, 
      failureCount: response.failureCount 
    });
    
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        deliveryStatus: response.failureCount === 0 ? 'sent' : 'failed',
        deliveredAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('Push notification failed', { notificationId, error });
    throw error;
  }
});
```

---

### 4. Event-Driven Notification Triggers

#### A. Friend Request

**Route: `/api/v1/friends/request` (POST)**

```typescript
// backend/src/modules/friends/friend.controller.ts

export async function sendFriendRequest(req: AuthRequest, res: Response) {
  const userId = getUserId(req);
  const { friendEmail, message } = req.body;
  
  // Validate input
  if (!friendEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friendEmail)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  
  // Get friend user
  const friendUser = await prisma.user.findUnique({
    where: { email: friendEmail },
    select: { id: true, email: true, name: true },
  });
  
  if (!friendUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Create local friend record
  const friend = await prisma.friend.create({
    data: {
      userId,
      name: friendUser.name,
      email: friendEmail,
      syncStatus: 'synced',
    },
  });
  
  // Trigger notification to friend
  await createNotification({
    userId: friendUser.id,
    type: 'friend_request',
    title: 'New Friend Request',
    message: `${user.name} sent you a friend request${message ? `: "${message}"` : '.'}`,
    channels: ['app', 'email'],
    deepLink: `/notifications/friend-requests`,
    sourceUserId: userId,
    sourceEntity: 'friend',
    sourceEntityId: friend.id,
  });
  
  res.json({ success: true, data: friend });
}
```

#### B. Group Expense Created

**Route: `/api/v1/groups/expenses` (POST)**

```typescript
export async function createGroupExpense(req: AuthRequest, res: Response) {
  const userId = getUserId(req);
  const { name, totalAmount, members, paidBy, description } = req.body;
  
  // Create transaction in DB
  const groupExpense = await prisma.groupExpense.create({
    data: {
      userId,
      name,
      totalAmount: new Decimal(totalAmount),
      paidBy,
      description,
      syncStatus: 'synced',
    },
  });
  
  // Create group members
  const createdMembers = await Promise.all(
    members.map(member =>
      prisma.groupExpenseMember.create({
        data: {
          groupExpenseId: groupExpense.id,
          name: member.name,
          email: member.email,
          shareAmount: new Decimal(member.shareAmount),
        },
      })
    )
  );
  
  // Notify each member
  for (const member of createdMembers) {
    if (member.email) {
      // Find user by email
      const memberUser = await prisma.user.findUnique({
        where: { email: member.email },
        select: { id: true },
      });
      
      if (memberUser) {
        await createNotification({
          userId: memberUser.id,
          type: 'group_invite',
          title: `You're added to "${name}"`,
          message: `${user.name} added you to a group expense: $${member.shareAmount}`,
          channels: ['app', 'email', 'push'],
          deepLink: `/groups/${groupExpense.id}`,
          sourceUserId: userId,
          sourceEntity: 'group',
          sourceEntityId: groupExpense.id,
          data: { groupExpenseId: groupExpense.id, shareAmount: member.shareAmount },
        });
      }
    }
  }
  
  res.json({ success: true, data: groupExpense });
}
```

#### C. Loan Due Date Reminder

**Scheduled Job: Every night at 8 PM**

```typescript
// backend/src/jobs/loan-reminders.job.ts

import cron from 'node-cron';

// Run daily at 8 PM UTC
cron.schedule('0 20 * * *', async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const endOfTomorrow = new Date(tomorrow);
  endOfTomorrow.setHours(23, 59, 59, 999);
  
  // Find loans due tomorrow
  const dueLoansTomorrow = await prisma.loan.findMany({
    where: {
      dueDate: {
        gte: tomorrow,
        lte: endOfTomorrow,
      },
      status: 'active',
    },
    include: { user: { select: { id: true, name: true } } },
  });
  
  for (const loan of dueLoansTomorrow) {
    await createNotification({
      userId: loan.userId,
      type: 'loan_due',
      title: 'Loan Payment Due Tomorrow',
      message: `${loan.name} is due tomorrow: $${loan.emiAmount || loan.principalAmount}`,
      channels: ['app', 'email', 'push'],
      deepLink: `/loans/${loan.id}`,
      sourceEntity: 'loan',
      sourceEntityId: loan.id,
    });
  }
});

export function startLoanReminderJob() {
  logger.info('Loan reminder job started');
}
```

---

### 5. Security Implementation: OAuth 2.0 & Encryption

#### A. OAuth 2.0 Integration (Supabase)

**Supabase already provides OAuth providers. Extend auth routes:**

```typescript
// backend/src/modules/auth/oauth.controller.ts

export async function initializeOAuth(req: Request, res: Response) {
  // Supabase SDK handles OAuth flow
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google' | 'github' | 'microsoft',
    options: {
      redirectTo: `${FRONTEND_URL}/auth/callback`,
      scopes: 'email profile', // Request minimal scopes
    },
  });
  
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  
  // Return OAuth consent URL
  res.json({ redirectTo: data.url });
}

export async function handleOAuthCallback(req: Request, res: Response) {
  const { code, state } = req.query;
  
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    code as string
  );
  
  if (error) {
    return res.redirect(`${FRONTEND_URL}/login?error=${error.message}`);
  }
  
  // Create/update user in our DB
  const user = await prisma.user.upsert({
    where: { email: data.user.email! },
    create: {
      id: data.user.id,
      email: data.user.email!,
      name: data.user.user_metadata.name || data.user.email!.split('@')[0],
      password: 'oauth', // Placeholder
      role: 'user',
    },
    update: {
      name: data.user.user_metadata.name,
    },
  });
  
  // Return JWT token for client
  res.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: { id: user.id, email: user.email, name: user.name },
  });
}
```

#### B. End-to-End Encryption for Sensitive Fields

**Use libsodium (TweetNaCl.js) for notification encryption:**

```typescript
// backend/src/utils/encryption.ts
import nacl from 'tweetnacl';
import { randomBytes } from 'crypto';

interface EncryptedData {
  ciphertext: string;
  nonce: string;
  publicKey: string;
}

export function generateKeyPair() {
  return nacl.box.keyPair();
}

export function encryptForDevice(
  message: string,
  recipientPublicKey: Uint8Array
): EncryptedData {
  const senderKeyPair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  const plaintext = Buffer.from(message, 'utf-8');
  const ciphertext = nacl.box(
    plaintext,
    nonce,
    recipientPublicKey,
    senderKeyPair.secretKey
  );
  
  return {
    ciphertext: Buffer.from(ciphertext).toString('base64'),
    nonce: Buffer.from(nonce).toString('base64'),
    publicKey: Buffer.from(senderKeyPair.publicKey).toString('base64'),
  };
}

export function decryptFromServer(
  encrypted: EncryptedData,
  mySecretKey: Uint8Array
): string {
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
  const nonce = Buffer.from(encrypted.nonce, 'base64');
  const publicKey = Buffer.from(encrypted.publicKey, 'base64');
  
  const plaintext = nacl.box.open(
    ciphertext,
    nonce,
    publicKey,
    mySecretKey
  );
  
  if (!plaintext) {
    throw new Error('Decryption failed');
  }
  
  return Buffer.from(plaintext).toString('utf-8');
}
```

**Update Device model:**
```prisma
model Device {
  id              String   @id @default(uuid())
  userId          String
  deviceId        String   @unique
  deviceName      String?
  deviceType      String?
  platform        String?
  appVersion      String?
  fcmToken        String?  // Firebase Cloud Messaging token
  publicKey       String?  // Base64-encoded NaCl public key for E2E encryption
  isActive        Boolean  @default(true)
  isTrusted       Boolean  @default(false)
  lastSeenAt      DateTime @default(now())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([deviceId])
  @@index([userId])
}
```

---

### 6. API Routes Summary

**New routes to implement:**

```
POST   /api/v1/notifications                  # Create notification (internal only)
GET    /api/v1/notifications                  # List user notifications
GET    /api/v1/notifications/:id              # Get notification detail
PATCH  /api/v1/notifications/:id/read         # Mark as read
PATCH  /api/v1/notifications/read-all         # Mark all as read
DELETE /api/v1/notifications/:id              # Delete notification

POST   /api/v1/sync/batch                     # Sync multiple entities (Dexie → Server)
GET    /api/v1/sync/delta                     # Get sync delta since timestamp
POST   /api/v1/devices/register               # Register device + FCM token + public key

POST   /api/v1/friends/request                # Send friend request
POST   /api/v1/friends/:id/accept             # Accept friend request
DELETE /api/v1/friends/:id                    # Remove friend

POST   /api/v1/groups/expenses                # Create group expense (triggers notifications)
PATCH  /api/v1/groups/expenses/:id            # Update group expense
POST   /api/v1/groups/expenses/:id/settle     # Mark as settled (notify members)

POST   /api/v1/goals/:id/join                 # Join group goal (triggers notification)
POST   /api/v1/loans/:id/pay                  # Record loan payment (if no reminder exists, create)

POST   /api/v1/auth/oauth/init                # Initialize OAuth flow
POST   /api/v1/auth/oauth/callback            # Handle OAuth callback
POST   /api/v1/auth/token/refresh             # Refresh JWT token
```

---

### 7. Frontend Implementation

#### A. Socket.IO Client Integration

**Update frontend services:**

```typescript
// frontend/src/services/realtime.ts
import io from 'socket.io-client';

let socket: ReturnType<typeof io> | null = null;

export async function initializeRealtime(token: string, deviceId: string) {
  socket = io(BACKEND_URL, {
    auth: { token, deviceId },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });
  
  socket.on('connect', () => {
    console.log('Connected to real-time server');
  });
  
  socket.on('notification:new', (notification) => {
    // Add to local store + trigger UI update
    dexie.notifications.add(notification);
    // Trigger toast/badge
    notificationContext.showNotification(notification);
  });
  
  socket.on('sync:delta', async (delta) => {
    // Merge delta into local Dexie
    for (const entity of delta.entities) {
      if (entity.type === 'notification') {
        await dexie.notifications.update(entity.id, entity);
      } else if (entity.type === 'groupExpense') {
        await dexie.groupExpenses.update(entity.id, entity);
      }
      // ... handle other types
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from real-time server');
  });
}

export function closeRealtime() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

#### B. Dexie Schema Enhancement

```typescript
// frontend/src/lib/db.ts
import Dexie from 'dexie';

export const db = new Dexie('FinoraDB');

db.version(2).stores({
  transactions: 'id, userId, date, syncStatus',
  accounts: 'id, userId, syncStatus',
  notifications: 'id, userId, createdAt, type, isRead',  // NEW
  groupExpenses: 'id, userId, date, syncStatus',
  friends: 'id, userId, email, syncStatus',
  loans: 'id, userId, dueDate',
  goals: 'id, userId, targetDate',
  syncQueue: 'id, userId, entityType, status, createdAt',  // NEW/Enhanced
});

interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  deepLink?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  syncStatus: 'pending' | 'synced' | 'failed';
}

interface SyncQueueItem {
  id: string;
  userId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACKNOWLEDGE';
  data?: any;
  status: 'pending' | 'processing' | 'synced' | 'failed';
  retryCount: number;
  createdAt: Date;
}
```

#### C. Notification Context + Hook

```typescript
// frontend/src/contexts/NotificationContext.tsx
import React, { useCallback, useEffect } from 'react';
import { db } from '../lib/db';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  showNotification: (notification: Notification) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const NotificationContext = React.createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  
  // Load notifications from Dexie on mount
  useEffect(() => {
    loadNotifications();
  }, []);
  
  const loadNotifications = async () => {
    const userId = getCurrentUserId();
    const notifs = await db.notifications
      .where('userId')
      .equals(userId)
      .sortBy('createdAt');
    
    setNotifications(notifs.reverse());
    setUnreadCount(notifs.filter(n => !n.isRead).length);
  };
  
  const showNotification = useCallback(async (notification: Notification) => {
    // Add to local db
    await db.notifications.add(notification);
    
    // Update UI
    setNotifications(prev => [notification, ...prev]);
    if (!notification.isRead) {
      setUnreadCount(prev => prev + 1);
    }
    
    // Show toast/badge
    toast.info(notification.message);
  }, []);
  
  const markAsRead = useCallback(async (id: string) => {
    // Update local
    await db.notifications.update(id, { isRead: true, readAt: new Date() });
    
    // Queue for sync
    await db.syncQueue.add({
      id: uuidv4(),
      userId: getCurrentUserId(),
      deviceId: getDeviceId(),
      entityType: 'notification',
      entityId: id,
      operation: 'ACKNOWLEDGE',
      status: 'pending',
      createdAt: new Date(),
    });
    
    // Sync to backend
    await syncQueue();
    
    // Update UI
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);
  
  const markAllAsRead = useCallback(async () => {
    const userId = getCurrentUserId();
    const unread = await db.notifications
      .where({ userId, isRead: false })
      .toArray();
    
    // Batch update local
    await db.notifications.bulkUpdate(
      unread.map(n => ({ key: n.id, changes: { isRead: true } }))
    );
    
    // Queue sync
    await db.syncQueue.bulkAdd(
      unread.map(n => ({
        id: uuidv4(),
        userId,
        deviceId: getDeviceId(),
        entityType: 'notification',
        entityId: n.id,
        operation: 'ACKNOWLEDGE',
        status: 'pending',
        createdAt: new Date(),
      }))
    );
    
    await syncQueue();
    
    // Update UI
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);
  
  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      unreadCount,
      showNotification,
      markAsRead,
      markAllAsRead,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = React.useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Update Prisma schema (Notification enhancement, Device encryption fields)
- [ ] Run migration: `npx prisma migrate dev --name add-sync-notifications`
- [ ] Implement notification.service.ts core functions
- [ ] Update Socket.IO event handlers for real-time sync
- [ ] Add POST /api/v1/notifications endpoint (internal only)
- [ ] Update Device model with FCM token + public key fields

### Phase 2: Event Triggers (Week 2-3)
- [ ] Integrate friend request notifications
- [ ] Integrate group expense notifications
- [ ] Set up cron job for loan due date reminders
- [ ] Add email queue (Bull/BullMQ + Redis)
- [ ] Test email delivery via SendGrid/Mailgun

### Phase 3: Multi-Channel Delivery (Week 3-4)
- [ ] Integrate FCM for push notifications
- [ ] Add device registration endpoint with FCM token capture
- [ ] Test push notifications across Android/iOS/Web
- [ ] Implement push notification queue

### Phase 4: Frontend Integration (Week 4-5)
- [ ] Update Dexie schema with notifications + syncQueue
- [ ] Build Socket.IO client integration
- [ ] Create NotificationContext + useNotifications hook
- [ ] Build notification UI components (badge, toast, drawer)
- [ ] Implement sync delta merging

### Phase 5: Security & Encryption (Week 5-6)
- [ ] Implement end-to-end encryption for sensitive notifications
- [ ] Add OAuth 2.0 routes (if extending beyond Supabase)
- [ ] Test HTTPS + certificate pinning
- [ ] Audit rate limiting on notification endpoints
- [ ] Implement notification rate limiting per user

### Phase 6: Testing & Monitoring (Week 6-7)
- [ ] Write unit tests for notification service
- [ ] Write integration tests for event triggers
- [ ] Set up Sentry/Datadog for error tracking
- [ ] Load test notification delivery system
- [ ] Test offline → online sync scenarios

---

## Security Checklist

### Authentication & Authorization
- ✅ JWT validation on all protected routes
- ✅ Device ownership verification before access
- ✅ Rate limiting on sensitive endpoints (5 req/min for auth, 20 req/min for API)
- ✅ Supabase OAuth integration for external auth
- ✅ Token refresh strategy with short-lived access tokens

### Data Protection
- [ ] Encrypt notifications at rest (AES-256 for DB fields)
- [ ] Use HTTPS + TLS 1.3 for all API calls
- [ ] Implement field-level encryption for sensitive data
- [ ] Hash device identifiers in logs
- [ ] Implement secure session management

### Multi-Device Sync
- [ ] Validate device ID ownership before sync
- [ ] Use device-specific encryption keys
- [ ] Implement conflict resolution for concurrent writes
- [ ] Never sync balance/monetary fields; re-fetch from server
- [ ] Audit all sync operations in request logs

### Push Notifications
- [ ] Validate FCM tokens before sending
- [ ] Implement exponential backoff for failed deliveries
- [ ] Redact sensitive data in notification payloads
- [ ] Monitor failed delivery rates
- [ ] Implement rate limiting per device (10 notif/min max)

### Email Notifications
- [ ] Use SMTP with TLS
- [ ] Implement DKIM/SPF/DMARC
- [ ] Track email delivery bounce rates
- [ ] Implement unsubscribe mechanism
- [ ] Never send sensitive data in email plain text

---

## Monitoring & Alerting

```typescript
// backend/src/monitoring/metrics.ts

export const metrics = {
  notificationCreated: Counter('notifications_created_total', {
    help: 'Total notifications created',
    labelNames: ['type', 'channel'],
  }),
  
  notificationDelivered: Counter('notifications_delivered_total', {
    help: 'Total notifications successfully delivered',
    labelNames: ['type', 'channel'],
  }),
  
  notificationFailed: Counter('notifications_failed_total', {
    help: 'Total notification delivery failures',
    labelNames: ['type', 'channel', 'reason'],
  }),
  
  syncDuration: Histogram('sync_duration_seconds', {
    help: 'Time taken to sync data',
    labelNames: ['entityType'],
  }),
  
  socketConnectionsActive: Gauge('socket_connections_active', {
    help: 'Currently active Socket.IO connections',
  }),
};

// Set up alerts for:
// - > 5% notification delivery failure rate
// - > 30s average sync duration
// - > 10% Socket.IO reconnection rate
// - Email bounce rate > 2%
```

---

## Conclusion

This architecture preserves your existing:
- ✅ React 18 + Vite + Capacitor UI framework
- ✅ Offline-first Dexie sync strategy
- ✅ Backend-authoritative financial logic
- ✅ Role-based access control
- ✅ Helmet + CORS security posture

While adding:
- ✅ Real-time cross-device sync via Socket.IO
- ✅ Multi-channel notifications (app, email, push)
- ✅ Automated reminders for loans/deadlines
- ✅ End-to-end encryption for sensitive data
- ✅ Production-ready job queue system
- ✅ OAuth 2.0 support

**Key success metrics:**
- <100ms notification delivery to active devices
- >95% email delivery success rate
- <30s sync latency across devices
- 99.5% uptime for notification system

---

**Next Steps:**
1. Review this architecture with your team
2. Begin Phase 1 implementation (Prisma schema + Socket.IO updates)
3. Set up Redis + Bull for job queues
4. Configure Firebase Cloud Messaging credentials
5. Start Phase 2 with friend request notifications as proof-of-concept
