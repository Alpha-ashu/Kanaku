import { accountRepository } from './account.repository';
import { sanitize } from '../../utils/sanitize';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { notifyAccountCreated } from '../notifications/triggers';
import { KeysetPage, createdAtPosition, sliceKeysetPage } from '../../utils/pagination';

export class AccountService {
  async fetchAccounts(userId: string) {
    return accountRepository.findMany(userId);
  }

  async fetchAccountsPage(userId: string, page: KeysetPage) {
    const rows = await accountRepository.findPage(userId, page);
    return sliceKeysetPage(rows, page, createdAtPosition);
  }

  async createAccount(userId: string, data: {
    name: string;
    type: string;
    provider?: string;
    country?: string;
    balance?: number;
    openingBalance?: number;
    currency?: string;
    clientRequestId?: string;
  }) {
    const { name, type, provider, country, balance, openingBalance, currency, clientRequestId } = data;

    if (!name || !type) {
      throw AppError.badRequest('Missing required fields: name and type are mandatory.', 'MISSING_FIELDS');
    }

    // A new account has no transactions yet, so its current balance equals its
    // opening balance. Honour an explicit openingBalance; otherwise treat the
    // supplied balance as the opening figure.
    const resolvedOpening = openingBalance != null ? openingBalance : (balance ?? 0);

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
      openingBalance: resolvedOpening,
      balance: balance != null ? balance : resolvedOpening,
      currency: currency || 'INR',
      isActive: true,
      clientRequestId: clientRequestId || null,
    });

    await cacheDeleteByPrefix('accounts:');
    await cacheDeleteByPrefix('transactions:');

    void notifyAccountCreated(account);

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

    // Validate openingBalance & targetBalance: must be finite when supplied
    for (const field of ['openingBalance', 'targetBalance'] as const) {
      if (data[field] !== undefined && !Number.isFinite(Number(data[field]))) {
        throw AppError.badRequest(`Account ${field} must be a finite number`, 'INVALID_BALANCE');
      }
    }

    // Whitelist only permitted fields to prevent mass assignment.
    //
    // `balance` is deliberately absent: the server owns it (openingBalance + Σ
    // ledger deltas, applied as each transaction posts). Clients used to send
    // their local figure on every edit and sync echo, so a device that had not yet
    // pulled recent transactions overwrote the correct balance with a stale one —
    // seen in production on 2026-09-12, where a push restored a balance from
    // before that day's two transactions. Installed app builds still send it; it
    // is ignored.
    // A deliberate "set current balance" edit is `targetBalance` below.
    const allowedFields = ['name', 'type', 'provider', 'country', 'openingBalance', 'currency', 'color', 'icon', 'syncStatus', 'isActive'] as const;
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

    // Both balance edits move balance and openingBalance by the same delta, so the
    // invariant balance = openingBalance + ledger holds. Deltas are taken against
    // the SERVER's figures, never the client's possibly-stale copy.
    if (data.targetBalance !== undefined) {
      const delta = Number(data.targetBalance) - Number(account.balance ?? 0);
      updates.balance = Number(data.targetBalance);
      updates.openingBalance = Number(account.openingBalance ?? 0) + delta;
    } else if (data.openingBalance !== undefined) {
      const delta = Number(data.openingBalance) - Number(account.openingBalance ?? 0);
      updates.balance = Number(account.balance ?? 0) + delta;
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
