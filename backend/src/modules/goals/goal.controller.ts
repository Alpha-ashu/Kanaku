import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

export const getGoals = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const goals = await prisma.goal.findMany({
      where: { userId, deletedAt: null },
      orderBy: { targetDate: 'asc' },
    });

    res.json({ success: true, data: goals });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Goals fallback: database unavailable, returning empty dataset.');
      return res.json({ success: true, data: [] });
    }

    next(error);
  }
};

export const createGoal = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { name, targetAmount, targetDate, category, isGroupGoal } = req.body;

    if (!name || !targetAmount || !targetDate) {
      throw AppError.badRequest('Missing required fields: name, targetAmount, and targetDate are mandatory.', 'MISSING_FIELDS');
    }

    const numericTarget = Number(targetAmount);
    if (!isFinite(numericTarget) || numericTarget <= 0) {
      return res.status(400).json({ success: false, error: 'Target amount must be a positive number' });
    }

    const goal = await prisma.goal.create({
      data: {
        userId,
        name: sanitize(name),
        targetAmount: numericTarget,
        targetDate: new Date(targetDate),
        category,
        isGroupGoal: isGroupGoal || false,
        currentAmount: 0,
      },
    });

    await cacheDeleteByPrefix('goals:');

    res.status(201).json({ success: true, data: goal });
  } catch (error) {
    next(error);
  }
};

export const getGoal = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const goal = await prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!goal) {
      throw AppError.notFound('Goal');
    }

    res.json({ success: true, data: goal });
  } catch (error) {
    next(error);
  }
};

export const updateGoal = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body;

    // Verify ownership
    const goal = await prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!goal) {
      throw AppError.notFound('Goal');
    }

    // Validate numeric fields if provided
    if (body.targetAmount !== undefined) {
      const numTarget = Number(body.targetAmount);
      if (!Number.isFinite(numTarget) || numTarget <= 0) {
        throw AppError.badRequest('Target amount must be a positive number', 'INVALID_AMOUNT');
      }
    }

    if (body.currentAmount !== undefined) {
      const numCurrent = Number(body.currentAmount);
      if (!Number.isFinite(numCurrent) || numCurrent < 0) {
        throw AppError.badRequest('Current amount must be a non-negative number', 'INVALID_AMOUNT');
      }
    }

    // Whitelist only permitted fields to prevent mass assignment
    const allowedFields = ['name', 'targetAmount', 'currentAmount', 'targetDate', 'category', 'isGroupGoal', 'syncStatus'] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Sanitize name field
        if (field === 'name' && typeof body[field] === 'string') {
          updates[field] = sanitize(body[field]);
        } else {
          updates[field] = body[field];
        }
      }
    }
    if (updates.targetDate) updates.targetDate = new Date(updates.targetDate);

    const updated = await prisma.goal.update({
      where: { id },
      data: { ...updates, updatedAt: new Date() },
    });

    await cacheDeleteByPrefix('goals:');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteGoal = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    // Verify ownership
    const goal = await prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!goal) {
      throw AppError.notFound('Goal');
    }

    // Soft delete
    await prisma.goal.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await cacheDeleteByPrefix('goals:');

    res.json({ success: true, message: 'Goal deleted' });
  } catch (error) {
    next(error);
  }
};
