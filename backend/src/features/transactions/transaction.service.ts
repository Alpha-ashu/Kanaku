import { transactionRepository, TransactionWithTags } from './transaction.repository';
import { accountRepository } from '../accounts/account.repository';
import { AppError } from '../../utils/AppError';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { eventBus } from '../../utils/eventBus';
import { Prisma } from '../../db/prisma-client';
import { add, isPositive, neg, parseMoney, roundMoney, ZERO } from '../../utils/money';

export class TransactionService {
  /**
   * Accumulate per-account balance deltas as `Prisma.Decimal` to preserve
   * exact precision. The previous implementation used JS `number` and
   * `Math.round` which silently lost sub-cent precision and could drift
   * a balance under load.
   */
  private addBalanceDelta(deltas: Map<string, Prisma.Decimal>, accountId: string | null | undefined, delta: Prisma.Decimal) {
    if (!accountId) return;
    if (delta.isZero()) return;
    const current = deltas.get(accountId) ?? ZERO;
    deltas.set(accountId, roundMoney(add(current, delta)));
  }

  private getBalanceImpactDeltas(transaction: TransactionWithTags & { type?: string | null; amount?: any; accountId?: string | null; transferToAccountId?: string | null }): Map<string, Prisma.Decimal> {
    const deltas = new Map<string, Prisma.Decimal>();
    const amount = roundMoney(parseMoney(transaction.amount ?? 0));
    if (!isPositive(amount) || !transaction.accountId) return deltas;

    if (transaction.type === 'transfer') {
      this.addBalanceDelta(deltas, transaction.accountId, neg(amount));
      this.addBalanceDelta(deltas, transaction.transferToAccountId, amount);
    } else if (transaction.type === 'income') {
      this.addBalanceDelta(deltas, transaction.accountId, amount);
    } else if (transaction.type === 'expense') {
      this.addBalanceDelta(deltas, transaction.accountId, neg(amount));
    }
    return deltas;
  }

  async fetchTransactions(userId: string, query: any) {
    const whereClause: any = {};
    if (query.accountId) {
      whereClause.accountId = query.accountId;
    }
    if (query.category) {
      whereClause.category = query.category;
    }
    if (query.startDate || query.endDate) {
      whereClause.date = {};
      if (query.startDate) whereClause.date.gte = new Date(query.startDate);
      if (query.endDate) whereClause.date.lte = new Date(query.endDate);
    }

    const { limit, page } = query;
    // Always paginate — never return unbounded result sets
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const parsedPage  = Math.max(1, parseInt(page as string) || 1);
    const skip        = (parsedPage - 1) * parsedLimit;

    const [transactions, totalCount] = await Promise.all([
      transactionRepository.findMany(userId, whereClause, parsedLimit, skip),
      transactionRepository.count(userId, whereClause),
    ]);

    return {
      transactions,
      totalCount,
      page: parsedPage,
      limit: parsedLimit,
    };
  }

  async fetchTransactionById(id: string, userId: string) {
    const transaction = await transactionRepository.findFirst({ id, userId, deletedAt: null });
    if (!transaction) {
      throw AppError.notFound('Transaction');
    }
    return transactionRepository.normalizeTransaction(transaction);
  }

  async fetchAccountTransactions(accountId: string, userId: string) {
    const account = await accountRepository.findFirst({ id: accountId, userId });
    if (!account) {
      throw AppError.forbidden('Unauthorized access to account', 'UNAUTHORIZED_ACCOUNT_ACCESS');
    }
    return transactionRepository.findMany(userId, { accountId });
  }

  async createTransaction(userId: string, body: any) {
    const {
      accountId,
      amount,
      category,
      subcategory,
      description,
      merchant,
      date,
      tags,
      type,
      transferToAccountId,
      transferType,
      expenseMode,
      groupExpenseId,
      groupName,
      splitType,
      importSource,
      importMetadata,
      dedupHash,
    } = body;

    if (!accountId || amount == null || !category || !date || !type) {
      throw AppError.badRequest('Missing required fields: accountId, amount, category, date, and type are mandatory.', 'MISSING_FIELDS');
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw AppError.badRequest('Amount must be a positive number', 'INVALID_AMOUNT');
    }
    // Keep the Decimal form for precise arithmetic and DB writes.
    const decimalAmount = roundMoney(parseMoney(amount));

    const txDate = new Date(date);
    if (isNaN(txDate.getTime())) {
      throw AppError.badRequest('Invalid transaction date format', 'INVALID_DATE');
    }

    // Verify account ownership AND that the account is live (not archived /
    // soft-deleted). Recording a transaction against a deleted account is what
    // produces the "expense exists but no account" state on the dashboard, so we
    // reject it here at the source rather than letting an orphan be written.
    const primaryAccount = await accountRepository.findFirst({ id: accountId, userId, deletedAt: null, isActive: true });
    if (!primaryAccount) {
      throw AppError.badRequest(
        'The selected account is unavailable. Please choose an active account or create one before recording transactions.',
        'ACCOUNT_UNAVAILABLE',
      );
    }

    if (type === 'transfer') {
      if (!transferToAccountId) {
        throw AppError.badRequest('transferToAccountId is required for transfers', 'TRANSFER_ACCOUNT_REQUIRED');
      }
      if (transferToAccountId === accountId) {
        throw AppError.badRequest('Cannot transfer to the same account', 'INVALID_TRANSFER');
      }
      const targetAccount = await accountRepository.findFirst({ id: transferToAccountId, userId, deletedAt: null, isActive: true });
      if (!targetAccount) {
        throw AppError.badRequest('The transfer destination account is unavailable. Please choose an active account.', 'TRANSFER_ACCOUNT_UNAVAILABLE');
      }
    }

    const activeDedupHash = dedupHash || transactionRepository.generateDedupHash(userId, numAmount, txDate, description);

    // Idempotency check
    const existing = await transactionRepository.findFirst({ dedupHash: activeDedupHash, userId });
    if (existing) {
      return transactionRepository.normalizeTransaction(existing);
    }

    const serializedTags = transactionRepository.serializeTags(tags);
    const balanceDeltas = this.getBalanceImpactDeltas({ type, amount: decimalAmount, accountId, transferToAccountId });

    const newTx = await transactionRepository.createWithBalanceUpdate({
      userId,
      accountId,
      type,
      amount: decimalAmount,
      category,
      subcategory: subcategory || null,
      description: description || null,
      merchant: merchant || null,
      date: txDate,
      tags: serializedTags,
      transferToAccountId: type === 'transfer' ? transferToAccountId : null,
      transferType: type === 'transfer' ? (transferType || 'manual') : null,
      expenseMode: expenseMode || null,
      groupExpenseId: groupExpenseId || null,
      groupName: groupName || null,
      splitType: splitType || null,
      importSource: importSource || null,
      importMetadata: importMetadata || null,
      dedupHash: activeDedupHash,
      synced: true,
      syncStatus: 'synced',
    }, balanceDeltas);

    await cacheDeleteByPrefix('transactions:');
    await cacheDeleteByPrefix('accounts:');

    // Trigger async processing
    eventBus.emit({
      type: 'TRANSACTION_CREATED',
      payload: {
        userId,
        transactionId: newTx.id,
        accountId: newTx.accountId,
        amount: Number(newTx.amount),
        category: newTx.category,
      },
    });

    return newTx;
  }

  async updateTransaction(id: string, userId: string, body: any) {
    const existing = await transactionRepository.findFirst({ id, userId });
    if (!existing) {
      throw AppError.notFound('Transaction');
    }

    const type = body.type !== undefined ? body.type : existing.type;
    const amount = body.amount !== undefined ? roundMoney(parseMoney(body.amount)) : roundMoney(parseMoney(existing.amount));
    const accountId = body.accountId !== undefined ? body.accountId : existing.accountId;
    const transferToAccountId = body.transferToAccountId !== undefined ? body.transferToAccountId : existing.transferToAccountId;

    if (body.amount !== undefined && !isPositive(amount)) {
      throw AppError.badRequest('Amount must be a positive number', 'INVALID_AMOUNT');
    }

    // Verify ownership of the accounts. When the account is being changed, the
    // new target must be live (not archived / soft-deleted) — same invariant as
    // create. Re-pointing a transaction at a deleted account would re-create the
    // orphaned-transaction state, so block it.
    if (accountId !== existing.accountId) {
      const primaryAccount = await accountRepository.findFirst({ id: accountId, userId, deletedAt: null, isActive: true });
      if (!primaryAccount) {
        throw AppError.badRequest('The selected account is unavailable. Please choose an active account.', 'ACCOUNT_UNAVAILABLE');
      }
    }

    if (type === 'transfer' && transferToAccountId) {
      if (transferToAccountId === accountId) {
        throw AppError.badRequest('Cannot transfer to the same account', 'INVALID_TRANSFER');
      }
      const targetAccount = await accountRepository.findFirst({ id: transferToAccountId, userId, deletedAt: null, isActive: true });
      if (!targetAccount) {
        throw AppError.badRequest('The transfer destination account is unavailable. Please choose an active account.', 'TRANSFER_ACCOUNT_UNAVAILABLE');
      }
    }

    // Calculate balance impacts
    const oldDeltas = this.getBalanceImpactDeltas(existing as any);
    const reversedDeltas = new Map<string, Prisma.Decimal>();
    for (const [accId, delta] of oldDeltas.entries()) {
      this.addBalanceDelta(reversedDeltas, accId, neg(delta));
    }

    const newDeltas = this.getBalanceImpactDeltas({ type, amount, accountId, transferToAccountId });

    const mergedDeltas = new Map<string, Prisma.Decimal>();
    for (const [accId, delta] of reversedDeltas.entries()) {
      this.addBalanceDelta(mergedDeltas, accId, delta);
    }
    for (const [accId, delta] of newDeltas.entries()) {
      this.addBalanceDelta(mergedDeltas, accId, delta);
    }

    const updates: any = {
      type,
      amount,
      accountId,
      category: body.category !== undefined ? body.category : existing.category,
      subcategory: body.subcategory !== undefined ? body.subcategory : existing.subcategory,
      description: body.description !== undefined ? body.description : existing.description,
      merchant: body.merchant !== undefined ? body.merchant : existing.merchant,
      date: body.date !== undefined ? new Date(body.date) : existing.date,
      tags: body.tags !== undefined ? transactionRepository.serializeTags(body.tags) : existing.tags,
      transferToAccountId: type === 'transfer' ? transferToAccountId : null,
      transferType: type === 'transfer' ? (body.transferType || existing.transferType) : null,
      expenseMode: body.expenseMode !== undefined ? body.expenseMode : existing.expenseMode,
      groupExpenseId: body.groupExpenseId !== undefined ? body.groupExpenseId : existing.groupExpenseId,
      groupName: body.groupName !== undefined ? body.groupName : existing.groupName,
      splitType: body.splitType !== undefined ? body.splitType : existing.splitType,
      updatedAt: new Date(),
    };

    const updated = await transactionRepository.updateWithBalanceUpdate(id, updates, mergedDeltas);

    await cacheDeleteByPrefix('transactions:');
    await cacheDeleteByPrefix('accounts:');

    eventBus.emit({
      type: 'TRANSACTION_UPDATED',
      payload: {
        userId,
        transactionId: id,
      },
    });

    return updated;
  }

  async deleteTransaction(id: string, userId: string) {
    const existing = await transactionRepository.findFirst({ id, userId });
    if (!existing) {
      throw AppError.notFound('Transaction');
    }

    // Calculate balance impacts for deletion (reverting original impact)
    const oldDeltas = this.getBalanceImpactDeltas(existing as any);
    const reversedDeltas = new Map<string, Prisma.Decimal>();
    for (const [accId, delta] of oldDeltas.entries()) {
      this.addBalanceDelta(reversedDeltas, accId, neg(delta));
    }

    await transactionRepository.deleteWithBalanceUpdate(id, reversedDeltas);

    await cacheDeleteByPrefix('transactions:');
    await cacheDeleteByPrefix('accounts:');

    eventBus.emit({
      type: 'TRANSACTION_DELETED',
      payload: {
        userId,
        transactionId: id,
        accountId: existing.accountId,
      },
    });
  }

  /**
   * Bulk create transactions in a best-effort sequential mode. Each item
   * is created in its own DB transaction so a single bad row does not
   * abort the entire batch — failures are reported per-index.
   *
   * Used by:
   *   - VoiceReview (multi-intent voice command, doc G.4)
   *   - SMS / CSV import flows
   *
   * The wrapping idempotency middleware on POST /transactions/bulk
   * guarantees that a retried network call with the same Idempotency-Key
   * will replay the original response instead of double-inserting.
   */
  async createTransactionsBulk(userId: string, items: any[]) {
    const created: any[] = [];
    const failed: { index: number; error: string; code?: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const tx = await this.createTransaction(userId, items[i]);
        created.push(tx);
      } catch (err) {
        const appErr = err as AppError | Error;
        failed.push({
          index: i,
          error: appErr instanceof AppError ? appErr.message : appErr.message,
          code: appErr instanceof AppError ? appErr.code : 'UNKNOWN_ERROR',
        });
      }
    }

    return {
      created,
      failed,
      summary: {
        total: items.length,
        succeeded: created.length,
        failedCount: failed.length,
      },
    };
  }
}

export const transactionService = new TransactionService();
