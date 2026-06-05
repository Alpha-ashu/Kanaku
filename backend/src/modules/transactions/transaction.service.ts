import { transactionRepository, TransactionWithTags } from './transaction.repository';
import { accountRepository } from '../accounts/account.repository';
import { AppError } from '../../utils/AppError';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { eventBus } from '../../utils/eventBus';

export class TransactionService {
  private addBalanceDelta(deltas: Map<string, number>, accountId: string | null | undefined, delta: number) {
    if (!accountId || !Number.isFinite(delta) || delta === 0) return;
    deltas.set(accountId, Math.round(((deltas.get(accountId) ?? 0) + delta) * 100) / 100);
  }

  private getBalanceImpactDeltas(transaction: TransactionWithTags & { type?: string | null; amount?: any; accountId?: string | null; transferToAccountId?: string | null }): Map<string, number> {
    const deltas = new Map<string, number>();
    const amount = Math.round(Number(transaction.amount ?? 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || !transaction.accountId) return deltas;

    if (transaction.type === 'transfer') {
      this.addBalanceDelta(deltas, transaction.accountId, -amount);
      this.addBalanceDelta(deltas, transaction.transferToAccountId, amount);
    } else if (transaction.type === 'income') {
      this.addBalanceDelta(deltas, transaction.accountId, amount);
    } else if (transaction.type === 'expense') {
      this.addBalanceDelta(deltas, transaction.accountId, -amount);
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
    return transactionRepository.findMany(userId, whereClause);
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

    const txDate = new Date(date);
    if (isNaN(txDate.getTime())) {
      throw AppError.badRequest('Invalid transaction date format', 'INVALID_DATE');
    }

    // Verify account ownership
    const primaryAccount = await accountRepository.findFirst({ id: accountId, userId });
    if (!primaryAccount) {
      throw AppError.notFound('Primary account not found or access denied', 'ACCOUNT_NOT_FOUND');
    }

    if (type === 'transfer') {
      if (!transferToAccountId) {
        throw AppError.badRequest('transferToAccountId is required for transfers', 'TRANSFER_ACCOUNT_REQUIRED');
      }
      if (transferToAccountId === accountId) {
        throw AppError.badRequest('Cannot transfer to the same account', 'INVALID_TRANSFER');
      }
      const targetAccount = await accountRepository.findFirst({ id: transferToAccountId, userId });
      if (!targetAccount) {
        throw AppError.notFound('Transfer destination account not found', 'TRANSFER_ACCOUNT_NOT_FOUND');
      }
    }

    const activeDedupHash = dedupHash || transactionRepository.generateDedupHash(userId, numAmount, txDate, description);

    // Idempotency check
    const existing = await transactionRepository.findFirst({ dedupHash: activeDedupHash, userId });
    if (existing) {
      return transactionRepository.normalizeTransaction(existing);
    }

    const serializedTags = transactionRepository.serializeTags(tags);
    const balanceDeltas = this.getBalanceImpactDeltas({ type, amount: numAmount, accountId, transferToAccountId });

    const newTx = await transactionRepository.createWithBalanceUpdate({
      userId,
      accountId,
      type,
      amount: numAmount,
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
    const amount = body.amount !== undefined ? Number(body.amount) : Number(existing.amount);
    const accountId = body.accountId !== undefined ? body.accountId : existing.accountId;
    const transferToAccountId = body.transferToAccountId !== undefined ? body.transferToAccountId : existing.transferToAccountId;

    if (body.amount !== undefined && (isNaN(amount) || amount <= 0)) {
      throw AppError.badRequest('Amount must be a positive number', 'INVALID_AMOUNT');
    }

    // Verify ownership of the accounts
    if (accountId !== existing.accountId) {
      const primaryAccount = await accountRepository.findFirst({ id: accountId, userId });
      if (!primaryAccount) {
        throw AppError.notFound('Account');
      }
    }

    if (type === 'transfer' && transferToAccountId) {
      if (transferToAccountId === accountId) {
        throw AppError.badRequest('Cannot transfer to the same account', 'INVALID_TRANSFER');
      }
      const targetAccount = await accountRepository.findFirst({ id: transferToAccountId, userId });
      if (!targetAccount) {
        throw AppError.notFound('Transfer destination account not found', 'TRANSFER_ACCOUNT_NOT_FOUND');
      }
    }

    // Calculate balance impacts
    const oldDeltas = this.getBalanceImpactDeltas(existing as any);
    const reversedDeltas = new Map<string, number>();
    for (const [accId, delta] of oldDeltas.entries()) {
      this.addBalanceDelta(reversedDeltas, accId, -delta);
    }

    const newDeltas = this.getBalanceImpactDeltas({ type, amount, accountId, transferToAccountId });

    const mergedDeltas = new Map<string, number>();
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
    const reversedDeltas = new Map<string, number>();
    for (const [accId, delta] of oldDeltas.entries()) {
      this.addBalanceDelta(reversedDeltas, accId, -delta);
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
}

export const transactionService = new TransactionService();
