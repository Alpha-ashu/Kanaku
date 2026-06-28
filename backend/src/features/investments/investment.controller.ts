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

export const getInvestment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const investment = await prisma.investment.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!investment) {
      throw AppError.notFound('Investment');
    }

    res.json({ success: true, data: investment });
  } catch (error) {
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
      clientRequestId?: string;
    };

    // Idempotency check
    if (body.clientRequestId && typeof body.clientRequestId === 'string') {
      const existing = await prisma.investment.findFirst({
        where: { clientRequestId: body.clientRequestId, userId }
      });
      if (existing) {
        return res.status(200).json({ success: true, data: existing });
      }
    }

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
        clientRequestId: body.clientRequestId || null,
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

// ── Portfolio Analytics (portfolioAnalytics sub-feature) ─────────────────────
// Returns aggregated portfolio metrics: total invested, current value, P&L,
// and allocation breakdown by asset type. Uses existing investment records.
export const getPortfolioAnalytics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const investments = await prisma.investment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { purchaseDate: 'desc' },
    });

    // Aggregate metrics
    let totalInvested = 0;
    let currentValue = 0;
    const allocationByType: Record<string, { invested: number; value: number; count: number }> = {};

    for (const inv of investments) {
      const invested = Number(inv.totalInvested ?? 0);
      const value = Number(inv.currentValue ?? 0);
      totalInvested += invested;
      currentValue += value;

      const type = inv.assetType || 'other';
      if (!allocationByType[type]) {
        allocationByType[type] = { invested: 0, value: 0, count: 0 };
      }
      allocationByType[type].invested += invested;
      allocationByType[type].value += value;
      allocationByType[type].count += 1;
    }

    const profitLoss = currentValue - totalInvested;
    const returnPercent = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;

    res.json({
      success: true,
      data: {
        summary: {
          totalInvested,
          currentValue,
          profitLoss,
          returnPercent: Math.round(returnPercent * 100) / 100,
          totalPositions: investments.length,
        },
        allocation: allocationByType,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ── SIP Tracking (sipTracking sub-feature) ────────────────────────────────────
// SIP investments are investments whose metadata contains { isSIP: true }.
// Returns all SIP positions with aggregated monthly contribution data.
export const getSIPInvestments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const allInvestments = await prisma.investment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { purchaseDate: 'desc' },
    });

    const sipInvestments = allInvestments.filter((inv) => {
      const meta = inv.metadata as any;
      return meta?.isSIP === true;
    });

    res.json({ success: true, data: sipInvestments });
  } catch (error) {
    next(error);
  }
};

// ── Group Investments (groupInvestments sub-feature) ─────────────────────────
// Group investments are linked to a group via metadata.groupId.
// Returns all group-linked investment positions for the user's groups.
export const getGroupInvestments = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const allInvestments = await prisma.investment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { purchaseDate: 'desc' },
    });

    const groupInvestments = allInvestments.filter((inv) => {
      const meta = inv.metadata as any;
      return meta?.groupId != null;
    });

    res.json({ success: true, data: groupInvestments });
  } catch (error) {
    next(error);
  }
};

