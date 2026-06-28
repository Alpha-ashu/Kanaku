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
    const { transactions, totalCount, page, limit } = await transactionService.fetchTransactions(userId, req.query);
    res.setHeader('X-Total-Count', totalCount.toString());
    res.setHeader('X-Page', page.toString());
    res.setHeader('X-Limit', limit.toString());
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

/**
 * POST /api/v1/transactions/bulk
 *
 * Accepts up to 100 transactions in a single call. Returns 207-style
 * partial success: `created` array + `failed` array with per-index
 * error details. Idempotent via the Idempotency-Key header.
 */
export const createTransactionsBulk = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const items = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
    const result = await transactionService.createTransactionsBulk(userId, items);
    const status = result.failed.length === 0 ? 201 : 207;
    res.status(status).json({ success: true, data: result });
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

// ── Export Statement (exportStatement sub-feature) ───────────────────────────
// Formats and exports the user's transactions as a simple CSV string response.
export const exportTransactions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { transactions } = await transactionService.fetchTransactions(userId, { limit: 10000 });

    // Build CSV
    const headers = ['ID', 'Date', 'Type', 'Category', 'Subcategory', 'Amount', 'Description', 'Merchant'];
    const rows = transactions.map((t) => [
      t.id,
      t.date.toISOString(),
      t.type,
      t.category,
      t.subcategory || '',
      t.amount.toString(),
      t.description || '',
      t.merchant || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((val) => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=transactions_export_${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};

// ── Import Third-Party Data (importThirdPartyData sub-feature) ───────────────
// Accepts transaction feeds in third-party schemas (e.g. Plaid, OFX) and converts
// them to standard Kanaku transactions.
export const importThirdPartyData = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { provider, accountId, transactions } = req.body;

    if (!accountId || !transactions || !Array.isArray(transactions)) {
      throw AppError.badRequest('accountId and transactions array are required', 'MISSING_FIELDS');
    }

    // Map third party formats (e.g. { amount, name, date, category }) to Kanaku body
    const mapped = transactions.map((tx: any) => ({
      accountId,
      amount: Math.abs(tx.amount || 0),
      category: tx.category?.[0] || tx.category || 'Uncategorized',
      type: tx.amount < 0 ? 'income' : 'expense', // Plaid: positive is outflow, negative is inflow
      date: tx.date || new Date().toISOString(),
      description: tx.name || tx.description || 'Imported Transaction',
      merchant: tx.merchant_name || null,
      importSource: provider || 'third_party_api',
    }));

    const result = await transactionService.createTransactionsBulk(userId, mapped);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};

