import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { FinancialLedgerService } from '../transactions/ledger.service';
import { FinancialEventDispatcher, InvestmentPurchasedEvent } from '../transactions/dispatcher';

export const getGoldAssets = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { type } = req.query;

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (type) where.type = type;

    const items = await prisma.goldAsset.findMany({
      where,
      orderBy: { purchaseDate: 'desc' },
    });

    res.json({ success: true, data: items });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('GoldAssets fallback: database unavailable');
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

export const createGoldAsset = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const body = req.body;

    // Idempotency
    if (body.clientRequestId) {
      const existing = await prisma.goldAsset.findFirst({
        where: { clientRequestId: body.clientRequestId, userId },
      });
      if (existing) {
        return res.status(200).json({ success: true, data: existing });
      }
    }

    const quantity = Number(body.quantity);
    const purchasePrice = Number(body.purchasePrice);
    const totalCost = Number(body.totalInvested) || (quantity * purchasePrice);

    if (body.accountId) {
      const account = await prisma.account.findFirst({
        where: { id: body.accountId, userId, deletedAt: null },
      });
      if (!account) {
        throw AppError.notFound('Account');
      }
      if (Number(account.balance) < totalCost) {
        throw AppError.badRequest('Insufficient account balance to purchase gold asset', 'INSUFFICIENT_FUNDS');
      }
    }

    const item = await prisma.$transaction(async (tx) => {
      const goldAsset = await tx.goldAsset.create({
        data: {
          userId,
          type: body.type,
          quantity,
          unit: body.unit,
          purchasePrice,
          currentPrice: Number(body.currentPrice),
          purchaseDate: new Date(body.purchaseDate),
          purityPercentage: body.purityPercentage ?? 99.9,
          location: body.location ? sanitize(body.location) : null,
          certificateNumber: body.certificateNumber ? sanitize(body.certificateNumber) : null,
          notes: body.notes ? sanitize(body.notes) : null,
          clientRequestId: body.clientRequestId || null,
        },
      });

      if (body.accountId) {
        await tx.account.update({
          where: { id: body.accountId },
          data: {
            balance: { decrement: totalCost },
          },
        });

        await tx.transaction.create({
          data: {
            userId,
            accountId: body.accountId,
            type: 'expense',
            amount: totalCost,
            category: 'Investment',
            subcategory: 'Gold',
            description: `Gold asset purchase: ${goldAsset.type} (${goldAsset.quantity} ${goldAsset.unit})`,
            date: new Date(body.purchaseDate),
          },
        });

        if (FinancialLedgerService.isEnabled('investments')) {
          await FinancialEventDispatcher.publish(tx, new InvestmentPurchasedEvent(
            userId,
            goldAsset.id,
            body.accountId,
            totalCost,
            `Gold (${goldAsset.type})`,
            'gold',
            `gold-purchase-${goldAsset.id}`,
          ));
        }
      }

      return goldAsset;
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const getGoldAsset = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const item = await prisma.goldAsset.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!item) throw AppError.notFound('Gold asset');

    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

export const updateGoldAsset = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.goldAsset.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Gold asset');

    const updates: Record<string, unknown> = {};
    if (body.type !== undefined) updates.type = body.type;
    if (body.quantity !== undefined) updates.quantity = Number(body.quantity);
    if (body.unit !== undefined) updates.unit = body.unit;
    if (body.purchasePrice !== undefined) updates.purchasePrice = Number(body.purchasePrice);
    if (body.currentPrice !== undefined) updates.currentPrice = Number(body.currentPrice);
    if (body.purchaseDate !== undefined) updates.purchaseDate = new Date(body.purchaseDate);
    if (body.purityPercentage !== undefined) updates.purityPercentage = Number(body.purityPercentage);
    if (body.location !== undefined) updates.location = body.location ? sanitize(body.location) : null;
    if (body.certificateNumber !== undefined) updates.certificateNumber = body.certificateNumber ? sanitize(body.certificateNumber) : null;
    if (body.notes !== undefined) updates.notes = body.notes ? sanitize(body.notes) : null;

    const updated = await prisma.goldAsset.update({
      where: { id },
      data: updates,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteGoldAsset = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.goldAsset.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('Gold asset');

    await prisma.goldAsset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Gold asset deleted' });
  } catch (error) {
    next(error);
  }
};

