import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { inviteParticipants } from '../collaboration/invitation.service';
import { FinancialLedgerService } from '../transactions/ledger.service';
import { FinancialEventDispatcher, GoalContributionEvent, GoalWithdrawalEvent } from '../transactions/dispatcher';

export const getGoals = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));

    const goals = await prisma.goal.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId },
          { goalMembers: { some: { userId, deletedAt: null } } },
        ],
      },
      orderBy: { targetDate: 'asc' },
      take: limit,
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

    try {
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

      return res.status(201).json({ success: true, data: goal });
    } catch (createErr: any) {
      if (createErr?.code === 'P2002' && clientRequestId) {
        const raceExisting = await prisma.goal.findFirst({
          where: { clientRequestId, userId }
        });
        if (raceExisting) {
          return res.status(200).json({ success: true, data: raceExisting });
        }
      }
      throw createErr;
    }
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
    const { email, phone, name } = req.body as { email?: string; phone?: string; name?: string };
    if (!email && !name && !phone) {
      throw AppError.badRequest('Participant name, email, or phone is required.', 'MEMBER_INFO_REQUIRED');
    }

    // Only the goal owner can add participants
    const goal = await prisma.goal.findFirst({ where: { id, userId, deletedAt: null } });
    if (!goal) {
      throw AppError.notFound('Goal');
    }

    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const cleanPhone = phone ? phone.trim() : null;
    const resolvedUser = await prisma.user.findFirst({
      where: {
        OR: [
          normalizedEmail ? { email: normalizedEmail } : null,
        ].filter(Boolean) as any,
        status: 'verified',
      },
    });

    if (normalizedEmail) {
      const existingMember = await prisma.goalMember.findFirst({
        where: { goalId: id, email: normalizedEmail, deletedAt: null },
      });
      if (existingMember) {
        throw AppError.badRequest('This person has already been added to the goal.', 'DUPLICATE_MEMBER');
      }
    }

    const member = await prisma.goalMember.create({
      data: {
        goalId: id,
        userId: resolvedUser?.id || null,
        name: name || resolvedUser?.name || normalizedEmail || 'Goal Participant',
        email: normalizedEmail,
        phone: cleanPhone,
      },
    });

    if (!goal.isGroupGoal) {
      await prisma.goal.update({ where: { id }, data: { isGroupGoal: true } });
    }

    // Resolves registered vs. pending vs. pending_contact, tracks the invite,
    // and sends the matching notification or invitation email.
    await inviteParticipants({
      moduleType: 'goal',
      moduleId: id,
      moduleName: goal.name,
      creatorId: userId,
      participants: [{
        email: normalizedEmail,
        phone: cleanPhone,
        name: member.name,
        detail: `Target Amount: ₹${Number(goal.targetAmount).toFixed(0)} by ${new Date(goal.targetDate).toLocaleDateString()}.`,
      }],
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

export const getGoalContributions = async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    const contributions = await prisma.goalContribution.findMany({
      where: { goalId: id },
      orderBy: { date: 'desc' },
      include: {
        account: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    res.json({ success: true, data: contributions });
  } catch (error) {
    next(error);
  }
};

export const addGoalContribution = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { amount, accountId, memberName, notes } = req.body;

    if (!amount) {
      throw AppError.badRequest('Amount is required', 'AMOUNT_REQUIRED');
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw AppError.badRequest('Amount must be a positive number', 'INVALID_AMOUNT');
    }

    if (!accountId) {
      throw AppError.badRequest('accountId is required', 'ACCOUNT_REQUIRED');
    }

    const result = await prisma.$transaction(async (tx) => {
      const goal = await tx.goal.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!goal) {
        throw AppError.notFound('Goal');
      }

      const account = await tx.account.findFirst({
        where: { id: accountId, userId, deletedAt: null },
      });
      if (!account) {
        throw AppError.notFound('Account');
      }

      const currentBalance = Number(account.balance);
      if (currentBalance < numericAmount) {
        throw AppError.badRequest('Insufficient account balance', 'INSUFFICIENT_BALANCE');
      }

      await tx.account.update({
        where: { id: accountId },
        data: {
          balance: { decrement: numericAmount },
        },
      });

      const updatedGoal = await tx.goal.update({
        where: { id },
        data: {
          currentAmount: { increment: numericAmount },
        },
      });

      const created = await tx.goalContribution.create({
        data: {
          userId,
          goalId: id,
          accountId,
          amount: numericAmount,
          date: new Date(),
          memberName: memberName ? sanitize(memberName) : null,
          status: 'paid',
          notes: notes ? sanitize(notes) : null,
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          accountId,
          type: 'expense',
          amount: numericAmount,
          category: 'Savings Goal',
          description: `Contribution to ${goal.name}`,
          date: new Date(),
        },
      });

      if (FinancialLedgerService.isEnabled('goals')) {
        await FinancialEventDispatcher.publish(tx, new GoalContributionEvent(
          userId,
          id,
          accountId,
          numericAmount,
          goal.name,
          goal.isGroupGoal,
          `goal-contrib-${created.id}`,
        ));
      }

      return { contribution: created, goal: updatedGoal };
    });

    await cacheDeleteByPrefix('goals:');
    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const withdrawFromGoal = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { amount, accountId, notes } = req.body;

    if (!amount) {
      throw AppError.badRequest('Amount is required', 'AMOUNT_REQUIRED');
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw AppError.badRequest('Amount must be a positive number', 'INVALID_AMOUNT');
    }

    if (!accountId) {
      throw AppError.badRequest('accountId is required', 'ACCOUNT_REQUIRED');
    }

    const result = await prisma.$transaction(async (tx) => {
      const goal = await tx.goal.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!goal) {
        throw AppError.notFound('Goal');
      }

      const currentGoalAmount = Number(goal.currentAmount);
      if (currentGoalAmount < numericAmount) {
        throw AppError.badRequest('Withdrawal amount exceeds goal balance', 'EXCEEDS_GOAL_BALANCE');
      }

      const account = await tx.account.findFirst({
        where: { id: accountId, userId, deletedAt: null },
      });
      if (!account) {
        throw AppError.notFound('Account');
      }

      await tx.account.update({
        where: { id: accountId },
        data: {
          balance: { increment: numericAmount },
        },
      });

      const updatedGoal = await tx.goal.update({
        where: { id },
        data: {
          currentAmount: { decrement: numericAmount },
        },
      });

      const created = await tx.goalContribution.create({
        data: {
          userId,
          goalId: id,
          accountId,
          amount: numericAmount,
          date: new Date(),
          status: 'withdrawn',
          notes: notes ? sanitize(notes) : null,
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          accountId,
          type: 'income',
          amount: numericAmount,
          category: 'Goal Withdrawal',
          description: `Withdrawal from ${goal.name}`,
          date: new Date(),
        },
      });

      if (FinancialLedgerService.isEnabled('goals')) {
        await FinancialEventDispatcher.publish(tx, new GoalWithdrawalEvent(
          userId,
          id,
          accountId,
          numericAmount,
          goal.name,
          goal.isGroupGoal,
          `goal-withdraw-${created.id}`,
        ));
      }

      return { withdrawal: created, goal: updatedGoal };
    });

    await cacheDeleteByPrefix('goals:');
    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
