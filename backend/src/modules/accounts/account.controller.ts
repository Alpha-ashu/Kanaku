import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

export const getAccounts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);

    const accounts = await prisma.account.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: accounts });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Accounts fallback: database unavailable, returning empty dataset.');
      return res.json({ success: true, data: [] });
    }

    next(error);
  }
};

export const createAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { name, type, provider, country, balance, currency } = req.body;

    if (!name || !type) {
      throw AppError.badRequest('Missing required fields: name and type are mandatory.', 'MISSING_FIELDS');
    }

    if (balance !== undefined && Number(balance) < 0) {
      throw AppError.badRequest('Account balance cannot be negative', 'INVALID_BALANCE');
    }

    const account = await prisma.account.create({
      data: {
        userId,
        name: sanitize(name),
        type,
        provider: provider ? sanitize(provider) : null,
        country: country ? sanitize(country) : null,
        balance: balance || 0,
        currency: currency || 'USD',
        isActive: true,
      },
    });

    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');

    res.status(201).json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
};

export const getAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const account = await prisma.account.findFirst({
      where: { id, userId },
      include: {
        transactions: {
          orderBy: { date: 'desc' },
          take: 50,
        },
      },
    });

    if (!account) {
      throw AppError.notFound('Account');
    }

    res.json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
};

export const updateAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body;

    // Verify ownership
    const account = await prisma.account.findFirst({
      where: { id, userId },
    });

    if (!account) {
      throw AppError.notFound('Account');
    }

    // Validate balance: must be non-negative and finite
    if (body.balance !== undefined) {
      const numBalance = Number(body.balance);
      if (!Number.isFinite(numBalance) || numBalance < 0) {
        throw AppError.badRequest('Account balance must be a non-negative number', 'INVALID_BALANCE');
      }
    }

    // Whitelist only permitted fields to prevent mass assignment
    const allowedFields = ['name', 'type', 'provider', 'country', 'balance', 'currency', 'color', 'icon', 'syncStatus'] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // Sanitize string fields to prevent XSS
        if ((field === 'name' || field === 'provider' || field === 'country') && typeof body[field] === 'string') {
          updates[field] = sanitize(body[field]);
        } else {
          updates[field] = body[field];
        }
      }
    }

    const updated = await prisma.account.update({
      where: { id },
      data: { ...updates, updatedAt: new Date() },
    });

    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    // Verify ownership
    const account = await prisma.account.findFirst({
      where: { id, userId },
    });

    if (!account) {
      throw AppError.notFound('Account');
    }

    // Soft delete
    await prisma.account.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');

    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    next(error);
  }
};
