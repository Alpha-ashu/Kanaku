import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

export const getRecurringTransactions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { status, interval } = req.query;

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (status) where.status = status;
    if (interval) where.interval = interval;

    const items = await prisma.recurringTransaction.findMany({
      where,
      orderBy: { nextDueDate: 'asc' },
    });

    res.json({ success: true, data: items });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('RecurringTransactions fallback: database unavailable');
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

export const createRecurringTransaction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const body = req.body;

    // Idempotency check
    if (body.clientRequestId) {
      const existing = await prisma.recurringTransaction.findFirst({
        where: { clientRequestId: body.clientRequestId, userId },
      });
      if (existing) {
        return res.status(200).json({ success: true, data: existing });
      }
    }

    const item = await prisma.recurringTransaction.create({
      data: {
        userId,
        title: sanitize(body.title),
        amount: Number(body.amount),
        category: body.category,
        subcategory: body.subcategory || null,
        interval: body.interval,
        nextDueDate: new Date(body.nextDueDate),
        autoProcess: body.autoProcess ?? false,
        accountId: body.accountId || null,
        description: body.description ? sanitize(body.description) : null,
        merchant: body.merchant ? sanitize(body.merchant) : null,
        clientRequestId: body.clientRequestId || null,
        status: 'active',
        type: body.type || 'expense',
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        reminderDaysBefore: body.reminderDaysBefore != null ? Number(body.reminderDaysBefore) : null,
        notes: body.notes ? sanitize(body.notes) : null,
        transferToAccountId: body.transferToAccountId || null,
      },
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const getRecurringTransaction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const item = await prisma.recurringTransaction.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!item) throw AppError.notFound('Recurring transaction');

    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const updateRecurringTransaction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Recurring transaction');

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = sanitize(body.title);
    if (body.amount !== undefined) updates.amount = Number(body.amount);
    if (body.category !== undefined) updates.category = body.category;
    if (body.subcategory !== undefined) updates.subcategory = body.subcategory;
    if (body.interval !== undefined) updates.interval = body.interval;
    if (body.nextDueDate !== undefined) updates.nextDueDate = new Date(body.nextDueDate);
    if (body.autoProcess !== undefined) updates.autoProcess = body.autoProcess;
    if (body.accountId !== undefined) updates.accountId = body.accountId;
    if (body.description !== undefined) updates.description = body.description ? sanitize(body.description) : null;
    if (body.merchant !== undefined) updates.merchant = body.merchant ? sanitize(body.merchant) : null;
    if (body.status !== undefined) updates.status = body.status;
    if (body.type !== undefined) updates.type = body.type;
    if (body.startDate !== undefined) updates.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) updates.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.reminderDaysBefore !== undefined) updates.reminderDaysBefore = body.reminderDaysBefore != null ? Number(body.reminderDaysBefore) : null;
    if (body.notes !== undefined) updates.notes = body.notes ? sanitize(body.notes) : null;
    if (body.transferToAccountId !== undefined) updates.transferToAccountId = body.transferToAccountId || null;

    const updated = await prisma.recurringTransaction.update({
      where: { id },
      data: updates,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteRecurringTransaction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Recurring transaction');

    await prisma.recurringTransaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Recurring transaction deleted' });
  } catch (error) {
    next(error);
  }
};

export const toggleRecurringStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.recurringTransaction.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Recurring transaction');

    const newStatus = existing.status === 'active' ? 'paused' : 'active';
    const updated = await prisma.recurringTransaction.update({
      where: { id },
      data: { status: newStatus },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

