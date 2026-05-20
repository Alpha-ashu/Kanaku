import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

const toDate = (value?: string) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const getInvestments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const investments = await prisma.investment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { purchaseDate: 'desc' },
    });

    res.json({ success: true, data: investments });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.json({ success: true, data: [] });
    }

    next(error);
  }
};

export const createInvestment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const body = req.body as {
      assetType: string;
      assetName: string;
      quantity: number;
      buyPrice: number;
      currentPrice: number;
      totalInvested?: number;
      currentValue?: number;
      profitLoss?: number;
      purchaseDate: string;
      lastUpdated?: string;
      metadata?: any;
    };

    const totalInvested = body.totalInvested ?? body.quantity * body.buyPrice;
    const currentValue = body.currentValue ?? body.quantity * body.currentPrice;
    const profitLoss = body.profitLoss ?? currentValue - totalInvested;

    const created = await prisma.investment.create({
      data: {
        userId,
        assetType: body.assetType,
        assetName: body.assetName,
        quantity: body.quantity,
        buyPrice: body.buyPrice,
        currentPrice: body.currentPrice,
        totalInvested,
        currentValue,
        profitLoss,
        purchaseDate: toDate(body.purchaseDate),
        lastUpdated: toDate(body.lastUpdated),
        metadata: body.metadata !== undefined ? body.metadata : undefined,
      },
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

export const updateInvestment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const existing = await prisma.investment.findFirst({ where: { id, userId } });
    if (!existing) {
      throw AppError.notFound('Investment');
    }

    const allowedKeys = [
      'assetType',
      'assetName',
      'quantity',
      'buyPrice',
      'currentPrice',
      'totalInvested',
      'currentValue',
      'profitLoss',
      'purchaseDate',
      'positionStatus',
      'metadata',
    ];
    const updates: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }
    updates.lastUpdated = new Date();
    updates.updatedAt = new Date();

    if (typeof updates.purchaseDate === 'string') updates.purchaseDate = toDate(updates.purchaseDate);

    const updated = await prisma.investment.update({
      where: { id },
      data: updates,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteInvestment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.investment.findFirst({ where: { id, userId } });
    if (!existing) {
      throw AppError.notFound('Investment');
    }

    await prisma.investment.update({
      where: { id },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });

    res.json({ success: true, message: 'Investment deleted' });
  } catch (error) {
    next(error);
  }
};
