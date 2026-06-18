import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

export const getTaxCalculations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { year } = req.query;

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (year) where.year = Number(year);

    const items = await prisma.taxCalculation.findMany({
      where,
      orderBy: { year: 'desc' },
    });

    res.json({ success: true, data: items });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('TaxCalculations fallback: database unavailable');
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

export const createTaxCalculation = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const body = req.body;

    // Idempotency
    if (body.clientRequestId) {
      const existing = await prisma.taxCalculation.findFirst({
        where: { clientRequestId: body.clientRequestId, userId },
      });
      if (existing) {
        return res.status(200).json({ success: true, data: existing });
      }
    }

    const item = await prisma.taxCalculation.create({
      data: {
        userId,
        year: body.year,
        regime: body.regime || null,
        country: body.country || 'India',
        totalIncome: Number(body.totalIncome),
        totalExpense: Number(body.totalExpense),
        netProfit: Number(body.netProfit),
        taxableIncome: Number(body.taxableIncome),
        estimatedTax: Number(body.estimatedTax),
        taxRate: Number(body.taxRate),
        deductions: Number(body.deductions ?? 0),
        currency: body.currency || 'INR',
        notes: body.notes || null,
        metadata: body.metadata || null,
        clientRequestId: body.clientRequestId || null,
      },
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const getTaxCalculation = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const item = await prisma.taxCalculation.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!item) throw AppError.notFound('Tax calculation');

    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const updateTaxCalculation = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.taxCalculation.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Tax calculation');

    const updates: Record<string, unknown> = {};
    if (body.year !== undefined) updates.year = body.year;
    if (body.regime !== undefined) updates.regime = body.regime;
    if (body.country !== undefined) updates.country = body.country;
    if (body.totalIncome !== undefined) updates.totalIncome = Number(body.totalIncome);
    if (body.totalExpense !== undefined) updates.totalExpense = Number(body.totalExpense);
    if (body.netProfit !== undefined) updates.netProfit = Number(body.netProfit);
    if (body.taxableIncome !== undefined) updates.taxableIncome = Number(body.taxableIncome);
    if (body.estimatedTax !== undefined) updates.estimatedTax = Number(body.estimatedTax);
    if (body.taxRate !== undefined) updates.taxRate = Number(body.taxRate);
    if (body.deductions !== undefined) updates.deductions = Number(body.deductions);
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    const updated = await prisma.taxCalculation.update({
      where: { id },
      data: updates,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteTaxCalculation = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.taxCalculation.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Tax calculation');

    await prisma.taxCalculation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Tax calculation deleted' });
  } catch (error) {
    next(error);
  }
};

