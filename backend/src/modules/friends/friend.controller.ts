import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

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

    const friend = await prisma.friend.create({
      data: {
        userId,
        name: sanitize(name.trim()),
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
      },
    });

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
