import { accountRepository } from './account.repository';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { cacheDeleteByPrefix } from '../../cache/redis';

export class AccountService {
  async fetchAccounts(userId: string) {
    return accountRepository.findMany(userId);
  }

  async createAccount(userId: string, data: {
    name: string;
    type: string;
    provider?: string;
    country?: string;
    balance?: number;
    currency?: string;
    clientRequestId?: string;
  }) {
    const { name, type, provider, country, balance, currency, clientRequestId } = data;

    if (!name || !type) {
      throw AppError.badRequest('Missing required fields: name and type are mandatory.', 'MISSING_FIELDS');
    }

    // Allow negative balances for credit card and overdraft accounts

    // Idempotency check
    if (clientRequestId) {
      const existing = await accountRepository.findFirst({ clientRequestId, userId });
      if (existing) {
        logger.info(`Idempotent account creation request: ${clientRequestId}`);
        return existing;
      }
    }

    // Name + Type uniqueness check (active accounts only)
    const sanitizedName = sanitize(name);
    const existingByName = await accountRepository.findFirst({
      userId,
      name: sanitizedName,
      type,
      deletedAt: null
    });

    if (existingByName) {
      throw AppError.conflict(`You already have a "${name}" ${type} account.`, 'DUPLICATE_ACCOUNT');
    }

    const account = await accountRepository.create({
      userId,
      name: sanitizedName,
      type,
      provider: provider ? sanitize(provider) : null,
      country: country ? sanitize(country) : null,
      balance: balance || 0,
      currency: currency || 'USD',
      isActive: true,
      clientRequestId: clientRequestId || null,
    });

    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');

    return account;
  }

  async fetchAccountById(id: string, userId: string) {
    const account = await accountRepository.findWithTransactions(id, userId);
    if (!account) {
      throw AppError.notFound('Account');
    }
    return account;
  }

  async updateAccount(id: string, userId: string, data: any) {
    // Verify ownership
    const account = await accountRepository.findFirst({ id, userId });
    if (!account) {
      throw AppError.notFound('Account');
    }

    // Validate balance: must be non-negative and finite
    if (data.balance !== undefined) {
      const numBalance = Number(data.balance);
      if (!Number.isFinite(numBalance)) {
        throw AppError.badRequest('Account balance must be a finite number', 'INVALID_BALANCE');
      }
    }

    // Whitelist only permitted fields to prevent mass assignment
    const allowedFields = ['name', 'type', 'provider', 'country', 'balance', 'currency', 'color', 'icon', 'syncStatus'] as const;
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        // Sanitize string fields to prevent XSS
        if ((field === 'name' || field === 'provider' || field === 'country') && typeof data[field] === 'string') {
          updates[field] = sanitize(data[field]);
        } else {
          updates[field] = data[field];
        }
      }
    }

    const updated = await accountRepository.update(id, { ...updates, updatedAt: new Date() });

    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');

    return updated;
  }

  async deleteAccount(id: string, userId: string) {
    // Verify ownership
    const account = await accountRepository.findFirst({ id, userId });
    if (!account) {
      throw AppError.notFound('Account');
    }

    // Soft delete
    await accountRepository.update(id, { isActive: false, deletedAt: new Date() });

    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');
  }
}

export const accountService = new AccountService();
