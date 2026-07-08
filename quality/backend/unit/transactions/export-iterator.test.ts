/**
 * iterateAllTransactions — the batched generator behind CSV export.
 *
 * Guards the truncation fix: the old export called fetchTransactions with
 * `limit: 10000`, but that method caps limit at 100, so exports silently
 * returned only the first 100 rows. The generator pages the repository directly
 * (no cap) and must yield EVERY row, stopping correctly at the end.
 *
 * The repository is mocked so this is a pure unit test (no DB), mirroring
 * balance-engine.test.ts.
 */
jest.mock('../../../../backend/src/cache/redis', () => ({ cacheDeleteByPrefix: jest.fn() }));

const findMany = jest.fn();
jest.mock('../../../../backend/src/features/transactions/transaction.repository', () => ({
  transactionRepository: { findMany: (...args: any[]) => findMany(...args) },
}));
jest.mock('../../../../backend/src/features/accounts/account.repository', () => ({
  accountRepository: {},
}));
jest.mock('../../../../backend/src/utils/eventBus', () => ({ eventBus: { emit: jest.fn() } }));

import { transactionService } from '../../../../backend/src/features/transactions/transaction.service';

// A fake store of N transactions the mocked repository pages over via take/skip.
const makeStore = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `tx-${i}`, amount: i }));

const wireRepo = (store: any[]) => {
  findMany.mockImplementation(async (_userId: string, _where: any, limit?: number, skip?: number) =>
    store.slice(skip ?? 0, (skip ?? 0) + (limit ?? store.length)),
  );
};

const collect = async (userId: string, batchSize?: number) => {
  const rows: any[] = [];
  const batches: number[] = [];
  for await (const batch of transactionService.iterateAllTransactions(userId, batchSize)) {
    batches.push(batch.length);
    rows.push(...batch);
  }
  return { rows, batches };
};

afterEach(() => findMany.mockReset());

describe('iterateAllTransactions (export batching)', () => {
  it('yields ALL rows well past the old 100-row cap', async () => {
    wireRepo(makeStore(250));
    const { rows } = await collect('u1', 500);
    expect(rows).toHaveLength(250); // not truncated to 100
    expect(rows[0].id).toBe('tx-0');
    expect(rows[249].id).toBe('tx-249');
  });

  it('pages in bounded batches and stops on a short final batch', async () => {
    wireRepo(makeStore(1250));
    const { rows, batches } = await collect('u1', 500);
    expect(rows).toHaveLength(1250);
    expect(batches).toEqual([500, 500, 250]); // 3 pages, last one short → stop
  });

  it('stops cleanly when the total is an exact multiple of the batch size', async () => {
    wireRepo(makeStore(1000));
    const { rows, batches } = await collect('u1', 500);
    expect(rows).toHaveLength(1000);
    // After two full batches an extra empty fetch confirms exhaustion, then stop.
    expect(batches).toEqual([500, 500]);
    expect(findMany).toHaveBeenCalledTimes(3); // 500, 500, then empty
  });

  it('handles an empty result set (no rows, single probe)', async () => {
    wireRepo(makeStore(0));
    const { rows, batches } = await collect('u1', 500);
    expect(rows).toHaveLength(0);
    expect(batches).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
