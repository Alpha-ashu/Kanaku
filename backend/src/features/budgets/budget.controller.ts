import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

/**
 * `alertChannels` is a Json column. Historically it was written with
 * `JSON.stringify(...)`, double-encoding it into a JSON *string* so the API
 * returned `alertChannels: "[\"app\"]"` instead of `["app"]`. We now store a
 * native array; this coerces any value (legacy string OR array) to an array so
 * every response is consistent even before the data is rewritten.
 */
const coerceChannels = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      /* fall through */
    }
  }
  return ['app'];
};

/** Shape a budget row so `alertChannels` is always a proper array on the wire. */
const serializeBudget = <T extends { alertChannels?: unknown }>(budget: T) => ({
  ...budget,
  alertChannels: coerceChannels(budget.alertChannels),
});

export const getBudgets = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { period, category } = req.query;

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (period) where.period = period;
    if (category) where.category = category;

    const budgets = await prisma.budget.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: budgets.map(serializeBudget) });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Budgets fallback: database unavailable');
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

export const createBudget = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const body = req.body;

    // Idempotency check
    if (body.clientRequestId) {
      const existing = await prisma.budget.findFirst({
        where: { clientRequestId: body.clientRequestId, userId },
      });
      if (existing) {
        return res.status(200).json({ success: true, data: existing });
      }
    }

    // Check for duplicate category+period
    const duplicate = await prisma.budget.findFirst({
      where: { userId, category: body.category, period: body.period, deletedAt: null },
    });
    if (duplicate) {
      throw AppError.badRequest(
        `Budget for "${body.category}" (${body.period}) already exists`,
        'DUPLICATE_BUDGET'
      );
    }

    const budget = await prisma.budget.create({
      data: {
        userId,
        category: body.category,
        amount: Number(body.amount),
        period: body.period,
        threshold: body.threshold ?? 80,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        alertEnabled: body.alertEnabled ?? true,
        // Store a native array (validated by zod) — not a JSON string.
        alertChannels: body.alertChannels ?? ['app'],
        clientRequestId: body.clientRequestId || null,
      },
    });

    res.status(201).json({ success: true, data: serializeBudget(budget) });
  } catch (error) {
    next(error);
  }
};

export const getBudget = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const budget = await prisma.budget.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!budget) throw AppError.notFound('Budget');

    res.json({ success: true, data: serializeBudget(budget) });
  } catch (error) {
    next(error);
  }
};

export const updateBudget = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.budget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Budget');

    const updates: Record<string, unknown> = {};
    if (body.amount !== undefined) updates.amount = Number(body.amount);
    if (body.spent !== undefined) updates.spent = Number(body.spent);
    if (body.threshold !== undefined) updates.threshold = body.threshold;
    if (body.alertEnabled !== undefined) updates.alertEnabled = body.alertEnabled;
    if (body.alertChannels !== undefined) updates.alertChannels = body.alertChannels;
    if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) updates.endDate = body.endDate ? new Date(body.endDate) : null;

    const updated = await prisma.budget.update({
      where: { id },
      data: updates,
    });

    res.json({ success: true, data: serializeBudget(updated) });
  } catch (error) {
    next(error);
  }
};

export const deleteBudget = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.budget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Budget');

    await prisma.budget.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Budget deleted' });
  } catch (error) {
    next(error);
  }
};

/** Recalculate spent amount for a budget based on actual transactions */
export const recalculateBudgetSpent = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const budget = await prisma.budget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!budget) throw AppError.notFound('Budget');

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;

    if (budget.period === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (budget.period === 'yearly') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      // monthly (default)
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const result = await prisma.transaction.aggregate({
      where: {
        userId,
        type: 'expense',
        category: budget.category,
        date: { gte: startDate, lte: now },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const totalSpent = Number(result._sum.amount ?? 0);

    const updated = await prisma.budget.update({
      where: { id },
      data: { spent: totalSpent },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

