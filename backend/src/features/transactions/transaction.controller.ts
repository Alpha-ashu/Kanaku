import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { transactionService } from './transaction.service';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { readKeysetPage } from '../../utils/pagination';
import { prisma } from '../../db/prisma';
import { csvCell, iterateTransactionsForExport, TRANSACTION_CSV_HEADERS } from '../settings/dataExport.service';
import { importLedgerRows, MAX_IMPORT_ROWS } from '../import/importLedger.service';
import { z } from 'zod';

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
    const keyset = readKeysetPage(req.query);
    if (keyset) {
      return res.json({ success: true, data: await transactionService.fetchTransactionsPage(userId, req.query, keyset) });
    }
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
    const isSync = req.query.sync === 'true' || req.headers['x-sync-mode'] === 'true' || req.body?.synced === true;
    const transaction = await transactionService.createTransaction(userId, req.body, {
      enforceBalance: !isSync,
    });
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

    // Account names and currencies make the file usable outside KANAKU (and by
    // the in-app importer, which matches accounts by name).
    const accounts = await prisma.account.findMany({ where: { userId }, select: { id: true, name: true, currency: true } });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kanaku-transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    // UTF-8 BOM: without it Excel reads ₹ and non-Latin names as mojibake.
    res.write(`${String.fromCharCode(0xfeff)}${TRANSACTION_CSV_HEADERS.join(',')}\n`);

    // Streamed in keyset batches: bounded memory, and no row skipped or repeated
    // when several share a date (the old offset paging could do both).
    for await (const batch of iterateTransactionsForExport(userId)) {
      const chunk = batch
        .map((t) => {
          const account = accountById.get(t.accountId);
          return [
            t.id,
            t.date.toISOString().slice(0, 10),
            t.type,
            t.category,
            t.subcategory || '',
            t.amount.toString(),
            t.description || '',
            t.merchant || '',
            account?.name || '',
            t.transferToAccountId ? accountById.get(t.transferToAccountId)?.name || '' : '',
            t.currency || account?.currency || '',
          ]
            .map(csvCell)
            .join(',');
        })
        .join('\n');
      res.write(`${chunk}\n`);
    }

    res.end();
  } catch (error) {
    // If streaming already began we can't change the status; just terminate the
    // response so the client sees a truncated (failed) download rather than a hang.
    if (res.headersSent) {
      logger.error('[Transactions] Export stream failed after headers sent', { error });
      res.end();
      return;
    }
    handleTransactionDatabaseError(error, next);
  }
};

// ── Import Third-Party Data (importThirdPartyData sub-feature) ───────────────
// Accepts transaction feeds in third-party schemas (e.g. Plaid, OFX-derived
// JSON) and books them through the shared bulk importer: validated, one DB
// transaction, idempotent per row (the feed's transaction_id when present).
const thirdPartyFeedSchema = z.object({
  provider: z.string().trim().min(1).max(60).optional(),
  accountId: z.string().min(1).max(100),
  transactions: z.array(z.object({
    transaction_id: z.string().max(200).optional(),
    amount: z.number().refine((n) => Number.isFinite(n) && n !== 0, 'amount must be non-zero'),
    date: z.string().min(10).max(40),
    name: z.string().max(500).optional(),
    description: z.string().max(500).optional(),
    merchant_name: z.string().max(200).nullish(),
    category: z.union([z.string().max(100), z.array(z.string().max(100)).max(5)]).optional(),
  })).min(1).max(MAX_IMPORT_ROWS),
});

export const importThirdPartyData = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const parsed = thirdPartyFeedSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest('accountId and a transactions array (amount, date) are required', 'INVALID_FEED');
    }
    const { provider, accountId, transactions } = parsed.data;

    const result = await importLedgerRows(userId, transactions.map((tx, index) => ({
      key: String(index),
      accountId,
      // Plaid convention: positive is money out, negative is money in.
      type: tx.amount < 0 ? 'income' : 'expense',
      amount: Math.abs(tx.amount),
      date: new Date(tx.date.length === 10 ? `${tx.date}T00:00:00.000Z` : tx.date),
      category: (Array.isArray(tx.category) ? tx.category[0] : tx.category) || 'Uncategorized',
      description: tx.name || tx.description || 'Imported Transaction',
      merchant: tx.merchant_name || null,
      externalId: tx.transaction_id ? `${provider || 'feed'}:${tx.transaction_id}` : null,
    })), { source: provider || 'third_party_api', enforceBalance: false });

    res.status(201).json({
      success: true,
      data: {
        created: result.created.map((c) => c.transaction),
        duplicates: result.duplicates.length,
        failed: result.failed,
        summary: { total: transactions.length, succeeded: result.created.length, failedCount: result.failed.length },
      },
    });
  } catch (error) {
    handleTransactionDatabaseError(error, next);
  }
};

