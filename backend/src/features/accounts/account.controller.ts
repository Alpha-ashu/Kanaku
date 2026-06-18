import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { accountService } from './account.service';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { logger } from '../../config/logger';

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
