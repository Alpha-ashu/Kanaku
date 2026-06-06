import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { prisma } from '../../db/prisma';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

// Get user's notifications
export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { unread, limit = 20, page = 1 } = req.query;

    let where: any = { userId };

    if (unread === 'true') {
      where.isRead = false;
    }

    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const parsedPage = Math.max(1, parseInt(page as string) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [notifications, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parsedLimit,
        skip,
      }),
      prisma.notification.count({ where }),
    ]);

    res.setHeader('X-Total-Count', totalCount.toString());
    res.setHeader('X-Page', parsedPage.toString());
    res.setHeader('X-Limit', parsedLimit.toString());
    res.json(notifications);
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.json([]);
    }

    res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
  }
};

// Get notification details
export const getNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(notification);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch notification' });
  }
};

// Mark notification as read
export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const updated = await prisma.notification.updateMany({
      where: { id, userId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return res.status(403).json({ error: 'Access denied or notification not found' });
    }

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    res.json(notification);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to mark notification as read' });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to mark notifications as read' });
  }
};

// Delete notification
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.notification.delete({
      where: { id },
    });

    res.json({ message: 'Notification deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete notification' });
  }
};

// Clear all notifications
export const clearAllNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    await prisma.notification.deleteMany({
      where: { userId },
    });

    res.json({ message: 'All notifications cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to clear notifications' });
  }
};

// Send notification (admin/system)
export const sendNotification = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, title, message, type = 'info', category, deepLink } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'Missing required fields: userId, title, message' });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        category: category || 'system',
        deepLink: deepLink || undefined,
      },
    });

    res.status(201).json(notification);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to send notification' });
  }
};

// Get unread count
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    res.json({ unreadCount: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch unread count' });
  }
};
