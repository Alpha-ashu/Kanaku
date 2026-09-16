/**
 * TRANSACTION DEDUP / IDEMPOTENCY — unit tests for the create-side guards.
 *
 * Three behaviours have to hold together, or the app either shows duplicates or
 * silently swallows entries the user made on purpose:
 *
 *   1. A replayed create (same content, same user) returns the EXISTING row
 *      rather than writing a second one. This is what catches a double-tapped
 *      save button and a sync-queue retry.
 *   2. A create the user explicitly confirmed as a repeat (`intentionalDuplicate`)
 *      DOES write a second row. `transactionCreateSchema` used to strip the flag
 *      before the service saw it, so confirming "yes, record it anyway" quietly
 *      returned the earlier transaction and the new entry never appeared.
 *   3. A client-supplied `dedupHash` is NOT honoured. The web client mints one
 *      per save attempt, so trusting it would disable guard (1) entirely.
 *      Retry-safety is the Idempotency-Key header's job, not this field's.
 *
 * Heavy IO (redis, prisma repositories, event bus) is mocked, so this is a unit
 * test and needs no database.
 */

jest.mock('../../../../backend/src/cache/redis', () => ({ cacheDeleteByPrefix: jest.fn() }));
jest.mock('../../../../backend/src/utils/eventBus', () => ({ eventBus: { emit: jest.fn() } }));
jest.mock('../../../../backend/src/db/prisma', () => ({
  prisma: { expenseBill: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } },
}));

const mockTransactionRepository = {
  generateDedupHash: jest.fn(),
  findFirst: jest.fn(),
  createWithBalanceUpdate: jest.fn(),
  serializeTags: jest.fn(() => null),
  normalizeTransaction: jest.fn((tx: unknown) => tx),
};

const mockAccountRepository = { findFirst: jest.fn() };

// Keep the real module's other exports (notably the TransactionRepository class,
// which the side-effect suite below instantiates for real) and swap only the
// singleton the service reaches for.
jest.mock('../../../../backend/src/features/transactions/transaction.repository', () => ({
  ...jest.requireActual('../../../../backend/src/features/transactions/transaction.repository'),
  transactionRepository: mockTransactionRepository,
}));
jest.mock('../../../../backend/src/features/accounts/account.repository', () => ({
  accountRepository: mockAccountRepository,
}));

import { transactionService } from '../../../../backend/src/features/transactions/transaction.service';
import { TransactionRepository } from '../../../../backend/src/features/transactions/transaction.repository';
import { transactionCreateSchema } from '../../../../backend/src/features/transactions/transaction.validation';

// The module-level `transactionRepository` export is mocked for the service
// tests above; the side-effect suite exercises the real implementation.
const transactionRepository = new TransactionRepository();

const USER = 'user-dedup-1';
const ACCOUNT = { id: 'acc-1', userId: USER, deletedAt: null, isActive: true, balance: 10_000 };

const expenseBody = () => ({
  accountId: ACCOUNT.id,
  type: 'expense',
  amount: 250,
  category: 'Food',
  description: 'Lunch',
  date: '2026-09-15T10:00:00.000Z',
});

describe('TRANSACTION DEDUP — createTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountRepository.findFirst.mockResolvedValue(ACCOUNT);
    mockTransactionRepository.generateDedupHash.mockReturnValue('content-hash-abc');
    mockTransactionRepository.findFirst.mockResolvedValue(null);
    mockTransactionRepository.createWithBalanceUpdate.mockImplementation(
      async (data: Record<string, unknown>) => ({ id: 'new-tx-1', ...data }),
    );
    mockTransactionRepository.serializeTags.mockReturnValue(null);
    mockTransactionRepository.normalizeTransaction.mockImplementation((tx: unknown) => tx);
  });

  it('writes the row the first time the content is seen', async () => {
    const created = await transactionService.createTransaction(USER, expenseBody(), { enforceBalance: false });

    expect(mockTransactionRepository.createWithBalanceUpdate).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({ id: 'new-tx-1', dedupHash: 'content-hash-abc' });
  });

  it('returns the existing row for a replay instead of creating a second one', async () => {
    const already = { id: 'existing-tx', dedupHash: 'content-hash-abc', amount: 250 };
    mockTransactionRepository.findFirst.mockResolvedValue(already);

    const result = await transactionService.createTransaction(USER, expenseBody(), { enforceBalance: false });

    expect(mockTransactionRepository.createWithBalanceUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'existing-tx' });
  });

  it('looks the replay up scoped to the user, never globally', async () => {
    await transactionService.createTransaction(USER, expenseBody(), { enforceBalance: false });

    expect(mockTransactionRepository.findFirst).toHaveBeenCalledWith({
      dedupHash: 'content-hash-abc',
      userId: USER,
    });
  });

  it('creates a second row when the user confirmed the repeat', async () => {
    // The replay lookup must not even run: the user has already answered the
    // "you already have one like this" prompt.
    mockTransactionRepository.findFirst.mockResolvedValue({ id: 'existing-tx' });

    const created = await transactionService.createTransaction(
      USER,
      { ...expenseBody(), intentionalDuplicate: true },
      { enforceBalance: false },
    );

    expect(mockTransactionRepository.createWithBalanceUpdate).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({ id: 'new-tx-1' });

    // Still hashed for audit, but suffixed so it cannot collide with the row the
    // user was warned about.
    const written = mockTransactionRepository.createWithBalanceUpdate.mock.calls[0][0] as { dedupHash: string };
    expect(written.dedupHash).toMatch(/^content-hash-abc-intentional-[0-9a-f]{16}$/);
  });

  it('gives two confirmed repeats of the same content distinct hashes', async () => {
    mockTransactionRepository.findFirst.mockResolvedValue({ id: 'existing-tx' });

    await transactionService.createTransaction(USER, { ...expenseBody(), intentionalDuplicate: true }, { enforceBalance: false });
    await transactionService.createTransaction(USER, { ...expenseBody(), intentionalDuplicate: true }, { enforceBalance: false });

    const [first] = mockTransactionRepository.createWithBalanceUpdate.mock.calls[0] as [{ dedupHash: string }];
    const [second] = mockTransactionRepository.createWithBalanceUpdate.mock.calls[1] as [{ dedupHash: string }];
    expect(first.dedupHash).not.toBe(second.dedupHash);
  });
});

describe('TRANSACTION DEDUP — side-effect transactions', () => {
  // A loan disbursement, goal contribution, investment or gold purchase is posted
  // with a raw `tx.transaction.create`, bypassing `createTransaction` and its
  // content hash. Because `Transaction.dedupHash` is `String? @unique` and
  // Postgres allows unlimited NULLs, those rows had NO duplicate protection at
  // all: a retried or double-submitted request simply posted another one.
  const fakeTx = () => {
    const calls: any[] = [];
    return {
      calls,
      transaction: {
        createMany: jest.fn(async (args: any) => {
          calls.push(args);
          return { count: 1 };
        }),
      },
    };
  };

  it('stamps a dedupHash derived from the causing record', async () => {
    const tx = fakeTx();

    await transactionRepository.createSideEffectTransaction(tx, 'loan-disbursement', 'loan-1', {
      userId: USER,
      accountId: ACCOUNT.id,
      type: 'income',
      amount: 5000,
      category: 'Loan',
      description: 'Loan disbursement: Car',
      date: new Date('2026-09-15T10:00:00.000Z'),
    });

    const [args] = tx.calls;
    expect(args.data[0].dedupHash).toEqual(expect.any(String));
    expect(args.data[0].dedupHash).toHaveLength(64);
  });

  it('skips instead of throwing, so a repeat cannot abort the surrounding write', async () => {
    const tx = fakeTx();

    await transactionRepository.createSideEffectTransaction(tx, 'loan-disbursement', 'loan-1', {
      userId: USER,
      amount: 5000,
      date: new Date(),
    });

    // `create` would raise P2002 on the unique dedupHash and take the whole
    // interactive transaction down with it — the loan itself would fail to save.
    expect(tx.calls[0].skipDuplicates).toBe(true);
  });

  it('gives the same causing record the same hash every time', () => {
    const a = transactionRepository.sideEffectDedupHash(USER, 'goal-contribution', 'contrib-1');
    const b = transactionRepository.sideEffectDedupHash(USER, 'goal-contribution', 'contrib-1');
    expect(a).toBe(b);
  });

  it('gives two separate operations different hashes', () => {
    // Two contributions of the same amount to the same goal on the same day are
    // two real contributions, and must stay two transactions.
    const a = transactionRepository.sideEffectDedupHash(USER, 'goal-contribution', 'contrib-1');
    const b = transactionRepository.sideEffectDedupHash(USER, 'goal-contribution', 'contrib-2');
    expect(a).not.toBe(b);
  });

  it('scopes the hash to the user', () => {
    const a = transactionRepository.sideEffectDedupHash('user-a', 'loan-disbursement', 'loan-1');
    const b = transactionRepository.sideEffectDedupHash('user-b', 'loan-disbursement', 'loan-1');
    expect(a).not.toBe(b);
  });

  it('cannot collide with a manual transaction of the same content', () => {
    const sideEffect = transactionRepository.sideEffectDedupHash(USER, 'loan-disbursement', 'loan-1');
    const manual = transactionRepository.generateDedupHash(USER, 5000, new Date('2026-09-15'), 'Loan disbursement: Car');
    expect(sideEffect).not.toBe(manual);
  });
});

describe('TRANSACTION DEDUP — create payload contract', () => {
  it('lets intentionalDuplicate through the validator', () => {
    const parsed = transactionCreateSchema.parse({ ...expenseBody(), intentionalDuplicate: true });

    expect(parsed).toMatchObject({ intentionalDuplicate: true });
  });

  it('strips a client-supplied dedupHash', () => {
    // Honouring it would hand dedup control to a key the client regenerates on
    // every save attempt, which is the same as having no content guard at all.
    const parsed = transactionCreateSchema.parse({ ...expenseBody(), dedupHash: 'client-random-uuid' });

    expect(parsed).not.toHaveProperty('dedupHash');
  });
});
