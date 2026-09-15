/**
 * createTransaction — pre-write lookups.
 *
 * The account-ownership, transfer-target and dedup-replay lookups are
 * independent reads. Awaited in series each cost a full DB round trip on every
 * save, so they now run concurrently. These tests pin both halves of that
 * change: the lookups really start together, and the checks still resolve in
 * the original order (so a request gets the same error it always did).
 *
 * Repositories and prisma are mocked — pure unit test, no DB.
 */
jest.mock('../../../../backend/src/cache/redis', () => ({ cacheDeleteByPrefix: jest.fn() }));
jest.mock('../../../../backend/src/db/prisma', () => ({ prisma: {} }));
jest.mock('../../../../backend/src/utils/eventBus', () => ({ eventBus: { emit: jest.fn() } }));

const accountFindFirst = jest.fn();
jest.mock('../../../../backend/src/features/accounts/account.repository', () => ({
  accountRepository: { findFirst: (...args: any[]) => accountFindFirst(...args) },
}));

const txFindFirst = jest.fn();
const createWithBalanceUpdate = jest.fn();
jest.mock('../../../../backend/src/features/transactions/transaction.repository', () => ({
  transactionRepository: {
    findFirst: (...args: any[]) => txFindFirst(...args),
    createWithBalanceUpdate: (...args: any[]) => createWithBalanceUpdate(...args),
    generateDedupHash: () => 'generated-hash',
    serializeTags: () => null,
    normalizeTransaction: (row: any) => ({ ...row, normalized: true }),
  },
}));

import { transactionService } from '../../../../backend/src/features/transactions/transaction.service';

const USER = 'user-1';
const expense = (overrides: Record<string, unknown> = {}) => ({
  accountId: 'acc-1',
  amount: 250,
  category: 'Food',
  date: '2026-09-15T10:00:00.000Z',
  type: 'expense',
  dedupHash: 'hash-1',
  ...overrides,
});
const liveAccount = (id: string) => ({ id, userId: USER, balance: 1000, type: 'bank' });

describe('transactionService.createTransaction lookups', () => {
  beforeEach(() => {
    accountFindFirst.mockReset();
    txFindFirst.mockReset();
    createWithBalanceUpdate.mockReset();
    createWithBalanceUpdate.mockImplementation(async (data: any) => ({ id: 'tx-new', ...data }));
  });

  it('starts the dedup lookup without waiting for the account lookup', async () => {
    let releaseAccount!: (value: unknown) => void;
    accountFindFirst.mockReturnValue(new Promise((resolve) => { releaseAccount = resolve; }));
    txFindFirst.mockResolvedValue(null);

    const pending = transactionService.createTransaction(USER, expense());
    // Let the service run up to its first await on the lookups.
    await new Promise((resolve) => setImmediate(resolve));

    expect(accountFindFirst).toHaveBeenCalledTimes(1);
    expect(txFindFirst).toHaveBeenCalledWith({ dedupHash: 'hash-1', userId: USER });

    releaseAccount(liveAccount('acc-1'));
    await expect(pending).resolves.toMatchObject({ id: 'tx-new' });
  });

  it('still rejects an unavailable account before honouring a dedup replay', async () => {
    accountFindFirst.mockResolvedValue(null);
    txFindFirst.mockResolvedValue({ id: 'tx-old', dedupHash: 'hash-1' });

    await expect(transactionService.createTransaction(USER, expense()))
      .rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' });
    expect(createWithBalanceUpdate).not.toHaveBeenCalled();
  });

  it('returns the existing row for a replayed dedup hash without writing', async () => {
    accountFindFirst.mockResolvedValue(liveAccount('acc-1'));
    txFindFirst.mockResolvedValue({ id: 'tx-old', dedupHash: 'hash-1' });

    await expect(transactionService.createTransaction(USER, expense()))
      .resolves.toEqual({ id: 'tx-old', dedupHash: 'hash-1', normalized: true });
    expect(createWithBalanceUpdate).not.toHaveBeenCalled();
  });

  it('skips the dedup lookup for an intentional duplicate', async () => {
    accountFindFirst.mockResolvedValue(liveAccount('acc-1'));

    await transactionService.createTransaction(USER, expense({ intentionalDuplicate: true }));

    expect(txFindFirst).not.toHaveBeenCalled();
    expect(createWithBalanceUpdate).toHaveBeenCalledTimes(1);
    expect(createWithBalanceUpdate.mock.calls[0][0].dedupHash).toMatch(/^hash-1-intentional-[0-9a-f]{16}$/);
  });

  it('looks up the transfer target concurrently and rejects an unavailable one', async () => {
    accountFindFirst.mockImplementation(async ({ id }: { id: string }) => (id === 'acc-1' ? liveAccount('acc-1') : null));
    txFindFirst.mockResolvedValue(null);

    await expect(transactionService.createTransaction(USER, expense({ type: 'transfer', transferToAccountId: 'acc-2' })))
      .rejects.toMatchObject({ code: 'TRANSFER_ACCOUNT_UNAVAILABLE' });
    expect(accountFindFirst.mock.calls.map(([where]) => where.id)).toEqual(['acc-1', 'acc-2']);
    expect(createWithBalanceUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [{ transferToAccountId: undefined }, 'TRANSFER_ACCOUNT_REQUIRED'],
    [{ transferToAccountId: 'acc-1' }, 'INVALID_TRANSFER'],
  ])('rejects a malformed transfer (%o) without a target lookup', async (overrides, code) => {
    accountFindFirst.mockResolvedValue(liveAccount('acc-1'));
    txFindFirst.mockResolvedValue(null);

    await expect(transactionService.createTransaction(USER, expense({ type: 'transfer', ...overrides })))
      .rejects.toMatchObject({ code });
    expect(accountFindFirst).toHaveBeenCalledTimes(1);
  });
});
