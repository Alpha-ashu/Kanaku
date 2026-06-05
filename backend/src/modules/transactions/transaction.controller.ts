import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { transactionService } from './transaction.service';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { AppError } from '../../utils/AppError';

const handleTransactionDatabaseError = (error: unknown, next: NextFunction) => {
  if (isDatabaseUnavailableError(error)) {
    console.warn('Transaction API: Database unavailable - converting to 503 response', { errorMsg: (error as Error)?.message });
    return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'Database service is temporarily unavailable. Please try again shortly.', false));
  }
  return next(error as Error);
};

export const getTransactions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactions = await transactionService.fetchTransactions(userId, req.query);
    res.json({ success: true, data: transactions });
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};

export const createTransaction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transaction = await transactionService.createTransaction(userId, req.body);
    res.status(201).json({ success: true, data: transaction });
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};

export const getTransaction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const transaction = await transactionService.fetchTransactionById(id, userId);
    res.json({ success: true, data: transaction });
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};

export const updateTransaction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const updated = await transactionService.updateTransaction(id, userId, req.body);
    res.json({ success: true, data: updated });
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};

export const deleteTransaction = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    await transactionService.deleteTransaction(id, userId);
    res.json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};

export const getAccountTransactions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { accountId } = req.params;
    const transactions = await transactionService.fetchAccountTransactions(accountId, userId);
    res.json(transactions);
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};
