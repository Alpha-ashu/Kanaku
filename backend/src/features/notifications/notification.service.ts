import { prisma } from "../../utils/prisma";
import { v4 as uuidv4 } from "uuid";
import * as nacl from "tweetnacl";
import * as naclUtil from "tweetnacl-util";

export interface CreateNotificationInput {
  userId: string;
  title: string;
  message: string;
  type?: string;
  category?: string;
  deepLink?: string;
  priority?: "high" | "normal" | "low";
  channels?: ("app" | "email" | "push")[];
  sourceUserId?: string;
  encryptPayload?: boolean;
  devicePublicKey?: string;
}

export interface NotificationChannel {
  app?: "sent" | "queued" | "failed";
  email?: "sent" | "queued" | "failed";
  push?: "sent" | "queued" | "failed";
}

/**
 * Notification Service
 * Handles creation, retrieval, and management of notifications.
 * Async channels (email/push) are delivered by the notification outbox drainer
 * (workers/index.ts), which polls for rows at status='pending' — no queue/broker.
 */
export class NotificationService {
  /**
   * Create a notification and hand async channels to the outbox drainer
   */
  async createNotification(
    input: CreateNotificationInput
  ): Promise<any> {
    const {
      userId,
      title,
      message,
      type = "info",
      category,
      deepLink,
      priority = "normal",
      channels = ["app"],
      sourceUserId,
      encryptPayload = false,
      devicePublicKey,
    } = input;

    const wantsEmail = channels.includes("email");
    const wantsPush = channels.includes("push");
    const wantsAsync = wantsEmail || wantsPush;

    // Initialize delivery status (only the requested async channels are queued).
    const deliveryStatus: NotificationChannel = {
      app: "sent",
      ...(wantsEmail ? { email: "queued" as const } : {}),
      ...(wantsPush ? { push: "queued" as const } : {}),
    };

    // Optional E2E encryption
    let encryptedPayload: string | null = null;
    if (encryptPayload && devicePublicKey) {
      encryptedPayload = this.encryptPayload(
        { title, message },
        devicePublicKey
      );
    }

    // Create notification in database
    const notification = await prisma.notification.create({
      data: {
        id: uuidv4(),
        userId,
        sourceUserId,
        title,
        message,
        type,
        category,
        deepLink,
        priority,
        channels: JSON.stringify(channels),
        deliveryStatus: JSON.stringify(deliveryStatus),
        encryptedPayload,
        // 'pending' lets the outbox drainer pick up email/push; app-only is 'sent'.
        status: wantsAsync ? "pending" : "sent",
        sentAt: wantsAsync ? null : new Date(),
      },
    });

    // Email/push are delivered asynchronously by the notification outbox drainer
    // (workers/index.ts) — there is nothing to enqueue here.
    return notification;
  }

  /**
   * Get notifications for a user with pagination
   */
  async getNotifications(
    userId: string,
    options: {
      isRead?: boolean;
      type?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { isRead, type, limit = 20, offset = 0 } = options;

    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        ...(isRead !== undefined && { isRead }),
        ...(type && { type }),
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    return notifications;
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    // Verify ownership and update atomically
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new Error("Unauthorized: notification does not belong to user or not found");
    }

    return prisma.notification.findUnique({
      where: { id: notificationId },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        deletedAt: null,
      },
      data: {
        isRead: true,
        readAt: now,
      },
    });

    return result;
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
        deletedAt: null,
      },
    });
  }

  /**
   * Soft delete a notification
   */
  async deleteNotification(notificationId: string, userId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error("Unauthorized: notification does not belong to user");
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Update notification delivery status
   */
  async updateDeliveryStatus(
    notificationId: string,
    channel: "app" | "email" | "push",
    status: "sent" | "queued" | "failed"
  ) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    const currentStatus = (typeof notification.deliveryStatus === "string"
      ? JSON.parse(notification.deliveryStatus)
      : (notification.deliveryStatus || {})) as any as NotificationChannel;
    currentStatus[channel] = status;

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        deliveryStatus: JSON.stringify(currentStatus),
      },
    });
  }

  /**
   * Optional: Encrypt payload using TweetNaCl.js
   * Requires device public key
   */
  private encryptPayload(payload: any, publicKeyString: string): string {
    try {
      // Convert base64 public key to Uint8Array
      const publicKey = naclUtil.decodeBase64(publicKeyString);
      const ephemeralSecretKey = nacl.box.keyPair();

      // Encrypt the message
      const messageBytes = naclUtil.decodeUTF8(JSON.stringify(payload));
      const nonce = nacl.randomBytes(nacl.box.nonceLength);

      const encryptedBox = nacl.box(
        messageBytes,
        nonce,
        publicKey,
        ephemeralSecretKey.secretKey
      );

      // Combine ephemeral public key + nonce + ciphertext
      const fullMessage = new Uint8Array(
        ephemeralSecretKey.publicKey.length + nonce.length + encryptedBox.length
      );
      fullMessage.set(ephemeralSecretKey.publicKey);
      fullMessage.set(nonce, ephemeralSecretKey.publicKey.length);
      fullMessage.set(encryptedBox, ephemeralSecretKey.publicKey.length + nonce.length);

      return naclUtil.encodeBase64(fullMessage);
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Failed to encrypt payload");
    }
  }

  /**
   * Get notification statistics for a user
   */
  async getStats(userId: string) {
    const total = await prisma.notification.count({
      where: { userId, deletedAt: null },
    });

    const unread = await prisma.notification.count({
      where: { userId, isRead: false, deletedAt: null },
    });

    const byType = await prisma.notification.groupBy({
      by: ["type"],
      where: { userId, deletedAt: null },
      _count: true,
    });

    return {
      total,
      unread,
      byType: byType.map((t: any) => ({
        type: t.type,
        count: t._count,
      })),
    };
  }
}

export default NotificationService;
