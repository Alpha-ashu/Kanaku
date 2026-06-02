import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { getSocketManager } from '../../sockets';

export const getFriends = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const friends = await prisma.friend.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: friends });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Friends fallback: database unavailable, returning empty dataset.');
      return res.json({ success: true, data: [] });
    }

    next(error);
  }
};

export const createFriend = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { name, email, phone } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw AppError.badRequest('Friend name is required.', 'NAME_REQUIRED');
    }

    if (!email && !phone) {
      throw AppError.badRequest('Either email or phone is required to identify a friend.', 'CONTACT_REQUIRED');
    }

    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanPhone = phone ? String(phone).trim() : null;

    // 1. Prevent duplicate friend records
    // Check if the user has already added this friend (not deleted)
    const existing = await prisma.friend.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          cleanEmail ? { email: cleanEmail } : null,
          cleanPhone ? { phone: cleanPhone } : null,
        ].filter(Boolean) as any,
      },
    });

    if (existing) {
      throw AppError.badRequest('Friend already added or request already sent.', 'FRIEND_ALREADY_EXISTS');
    }

    // Fetch current user details
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw AppError.notFound('User');
    }

    // 2. Check if the target user exists in the system
    const targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          cleanEmail ? { email: cleanEmail } : null,
          cleanPhone ? { phone: cleanPhone } : null,
        ].filter(Boolean) as any,
      },
    });

    let isMutual = false;
    let targetFriendRecordId = null;

    if (targetUser) {
      // Check if target user has already added current user
      const targetFriend = await prisma.friend.findFirst({
        where: {
          userId: targetUser.id,
          deletedAt: null,
          OR: [
            currentUser.email ? { email: currentUser.email } : null,
            currentUser.phone ? { phone: currentUser.phone } : null,
          ].filter(Boolean) as any,
        },
      });

      if (targetFriend) {
        isMutual = true;
        targetFriendRecordId = targetFriend.id;
      }
    }

    // Create friend record for current user
    const friend = await prisma.friend.create({
      data: {
        userId,
        name: sanitize(name.trim()),
        email: cleanEmail,
        phone: cleanPhone,
        syncStatus: 'synced',
      },
    });

    if (targetUser) {
      if (isMutual) {
        // Send notification to B (target user) that B's request was accepted
        const notificationB = await prisma.notification.create({
          data: {
            userId: targetUser.id,
            sourceUserId: userId,
            title: 'Friend Request Accepted',
            message: `${currentUser.name} accepted your friend request.`,
            type: 'friend_accepted',
            priority: 'high',
            channels: '["app"]',
            deliveryStatus: '{}',
          },
        });

        // Send notification to A (current user) that they are now friends
        const notificationA = await prisma.notification.create({
          data: {
            userId,
            sourceUserId: targetUser.id,
            title: 'Friend Request Accepted',
            message: `You are now friends with ${targetUser.name}.`,
            type: 'friend_accepted',
            priority: 'high',
            channels: '["app"]',
            deliveryStatus: '{}',
          },
        });

        // Notify both via sockets immediately
        try {
          const socketManager = getSocketManager();
          socketManager.notifyUser(targetUser.id, 'friend_accepted', { friendId: friend.id, friendName: currentUser.name });
          socketManager.notifyUser(targetUser.id, 'notification', notificationB);

          socketManager.notifyUser(userId, 'friend_accepted', { friendId: targetFriendRecordId, friendName: targetUser.name });
          socketManager.notifyUser(userId, 'notification', notificationA);
        } catch (socketError) {
          logger.warn('Socket notification failed', { error: socketError });
        }
      } else {
        // B hasn't added A yet, this is a new friend request to B
        const notificationB = await prisma.notification.create({
          data: {
            userId: targetUser.id,
            sourceUserId: userId,
            title: 'New Friend Request',
            message: `${currentUser.name} sent you a friend request.`,
            type: 'friend_request',
            priority: 'high',
            channels: '["app"]',
            deliveryStatus: '{}',
          },
        });

        // Notify B via sockets
        try {
          const socketManager = getSocketManager();
          socketManager.notifyUser(targetUser.id, 'friend_request', { friendId: friend.id, friendName: currentUser.name });
          socketManager.notifyUser(targetUser.id, 'notification', notificationB);
        } catch (socketError) {
          logger.warn('Socket notification failed', { error: socketError });
        }
      }
    }

    res.status(201).json({ success: true, data: friend });
  } catch (error) {
    next(error);
  }
};

export const updateFriend = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name, email, phone } = req.body;

    const existing = await prisma.friend.findFirst({ where: { id, userId } });
    if (!existing) {
      throw AppError.notFound('Friend');
    }

    const updated = await prisma.friend.update({
      where: { id },
      data: {
        name: name !== undefined ? sanitize(String(name).trim()) : undefined,
        email: email !== undefined ? (email ? String(email).trim() : null) : undefined,
        phone: phone !== undefined ? (phone ? String(phone).trim() : null) : undefined,
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteFriend = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.friend.findFirst({ where: { id, userId } });
    if (!existing) {
      throw AppError.notFound('Friend');
    }

    await prisma.friend.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Friend deleted successfully' });
  } catch (error) {
    next(error);
  }
};
