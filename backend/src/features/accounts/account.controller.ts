import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { accountService } from './account.service';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { logger } from '../../config/logger';
import { transactionService } from '../transactions/transaction.service';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { roundMoney, parseMoney } from '../../utils/money';
import { sanitize } from '../../utils/sanitize';

export const getAccounts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const accounts = await accountService.fetchAccounts(userId);
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
    const account = await accountService.createAccount(userId, req.body);
    res.status(201).json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
};

export const getAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const account = await accountService.fetchAccountById(id, userId);
    res.json({ success: true, data: account });
  } catch (error) {
    next(error);
  }
};

export const updateAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const updated = await accountService.updateAccount(id, userId, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    await accountService.deleteAccount(id, userId);
    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    next(error);
  }
};

// ── Account Transfer (accountTransfer sub-feature) ───────────────────────────
// Performs an account-to-account transfer by creating a transaction of type 'transfer'
// which handles atomically debiting the source account and crediting the target.
export const transferAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params; // Source accountId
    const { transferToAccountId, amount, description, date } = req.body;

    if (!transferToAccountId || amount == null) {
      throw AppError.badRequest('transferToAccountId and amount are required for transfers', 'MISSING_FIELDS');
    }

    const transaction = await transactionService.createTransaction(userId, {
      accountId: id,
      transferToAccountId,
      amount,
      category: 'Transfer',
      type: 'transfer',
      date: date || new Date().toISOString(),
      description: description ? sanitize(description) : 'Account transfer',
    });

    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    next(error);
  }
};

// ── Account Reconciliation (reconciliation sub-feature) ──────────────────────
// Compares the Kanaku account balance with a target statement balance.
// If they differ, it automatically creates a 'Reconciliation Adjustment' transaction
// to match the target bank balance.
export const reconcileAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params; // Account ID
    const { statementBalance, date } = req.body;

    if (statementBalance == null) {
      throw AppError.badRequest('statementBalance is required for reconciliation', 'MISSING_FIELDS');
    }

    const account = await prisma.account.findFirst({
      where: { id, userId, deletedAt: null, isActive: true },
    });

    if (!account) {
      throw AppError.notFound('Account');
    }

    const currentBalance = Number(account.balance);
    const targetBalance = Number(statementBalance);
    const diff = targetBalance - currentBalance;

    if (Math.abs(diff) < 0.01) {
      return res.json({
        success: true,
        message: 'Account is already reconciled. No adjustments needed.',
        data: { account, adjustment: null },
      });
    }

    // Create adjustment transaction: positive diff -> income, negative diff -> expense
    const adjustmentType = diff > 0 ? 'income' : 'expense';
    const absAmount = Math.abs(diff);

    const adjustment = await transactionService.createTransaction(userId, {
      accountId: id,
      amount: absAmount,
      category: 'Adjustment',
      type: adjustmentType,
      date: date || new Date().toISOString(),
      description: `Reconciliation adjustment (${diff > 0 ? '+' : '-'}${absAmount.toFixed(2)})`,
    });

    const updatedAccount = await prisma.account.findUnique({
      where: { id },
    });

    res.json({
      success: true,
      message: `Account reconciled with a ${adjustmentType} adjustment of ${absAmount.toFixed(2)}.`,
      data: { account: updatedAccount, adjustment },
    });
  } catch (error) {
    next(error);
  }
};

