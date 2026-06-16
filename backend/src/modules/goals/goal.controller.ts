import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { inviteParticipants } from '../collaboration/invitation.service';

export const getGoals = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const goals = await prisma.goal.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId },
          { goalMembers: { some: { userId, deletedAt: null } } },
        ],
      },
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
    const { name, targetAmount, targetDate, category, isGroupGoal, clientRequestId } = req.body;

    if (!name || !targetAmount || !targetDate) {
      throw AppError.badRequest('Missing required fields: name, targetAmount, and targetDate are mandatory.', 'MISSING_FIELDS');
    }

    const numericTarget = Number(targetAmount);
    if (!isFinite(numericTarget) || numericTarget <= 0) {
      return res.status(400).json({ success: false, error: 'Target amount must be a positive number' });
    }

    // Validate uniqueness of goal name for this user (not deleted)
    const existingName = await prisma.goal.findFirst({
      where: { 
        userId, 
        name: sanitize(name),
        deletedAt: null
      }
    });
    if (existingName) {
      throw AppError.badRequest('A goal with this name already exists.', 'DUPLICATE_GOAL_NAME');
    }

    // Idempotency check
    if (clientRequestId && typeof clientRequestId === 'string') {
      const existing = await prisma.goal.findFirst({
        where: { clientRequestId, userId }
      });
      if (existing) {
        logger.info(`Idempotent goal creation request: ${clientRequestId}`);
        return res.status(200).json({ success: true, data: existing });
      }
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
        clientRequestId: clientRequestId || null,
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
      where: {
        id,
        deletedAt: null,
        OR: [
          { userId },
          { goalMembers: { some: { userId, deletedAt: null } } },
        ],
      },
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
    if (updates.name && updates.name.toLowerCase() !== goal.name.toLowerCase()) {
      const existingName = await prisma.goal.findFirst({
        where: {
          userId,
          name: updates.name,
          deletedAt: null,
          NOT: { id }
        }
      });
      if (existingName) {
        throw AppError.badRequest('A goal with this name already exists.', 'DUPLICATE_GOAL_NAME');
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

export const getGoalMembers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const goal = await prisma.goal.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [{ userId }, { goalMembers: { some: { userId, deletedAt: null } } }],
      },
    });
    if (!goal) {
      throw AppError.notFound('Goal');
    }

    const members = await prisma.goalMember.findMany({
      where: { goalId: id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
};

export const addGoalMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { email, name } = req.body as { email: string; name?: string };

    // Only the goal owner can add participants
    const goal = await prisma.goal.findFirst({ where: { id, userId, deletedAt: null } });
    if (!goal) {
      throw AppError.notFound('Goal');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const resolvedUser = await prisma.user.findFirst({ where: { email: normalizedEmail, status: 'verified' } });

    const existingMember = await prisma.goalMember.findFirst({
      where: { goalId: id, email: normalizedEmail, deletedAt: null },
    });
    if (existingMember) {
      throw AppError.badRequest('This person has already been added to the goal.', 'DUPLICATE_MEMBER');
    }

    const member = await prisma.goalMember.create({
      data: {
        goalId: id,
        userId: resolvedUser?.id || null,
        name: name || resolvedUser?.name || normalizedEmail,
        email: normalizedEmail,
      },
    });

    if (!goal.isGroupGoal) {
      await prisma.goal.update({ where: { id }, data: { isGroupGoal: true } });
    }

    // Resolves registered vs. pending, tracks the invite, and sends the
    // matching in-app notification or "Join Kanaku" invitation email.
    await inviteParticipants({
      moduleType: 'goal',
      moduleId: id,
      moduleName: goal.name,
      creatorId: userId,
      participants: [{ email: normalizedEmail, name }],
    });

    await cacheDeleteByPrefix('goals:');

    res.status(201).json({ success: true, data: member });
  } catch (error) {
    next(error);
  }
};

export const removeGoalMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id, memberId } = req.params;

    const goal = await prisma.goal.findFirst({ where: { id, userId, deletedAt: null } });
    if (!goal) {
      throw AppError.notFound('Goal');
    }

    const result = await prisma.goalMember.updateMany({
      where: { id: memberId, goalId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      throw AppError.notFound('Goal member');
    }

    await cacheDeleteByPrefix('goals:');

    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    next(error);
  }
};
