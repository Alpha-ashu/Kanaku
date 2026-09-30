/**
 * Imported transactions reach the server in bulk and are linked back to the
 * device rows — never one request per row, never left local-only, never doubled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: number };

const state = vi.hoisted(() => ({
  transactions: new Map<number, Row>(),
  accounts: [] as Array<{ id: number; cloudId?: string }>,
}));
const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  queue: vi.fn(),
  process: vi.fn(async () => undefined),
  token: vi.fn(() => 'token'),
}));

vi.mock('@/lib/database', () => ({
  db: {
    transactions: {
      bulkGet: async (ids: number[]) => ids.map((id) => state.transactions.get(id)),
      update: async (id: number, changes: Record<string, unknown>) => {
        const row = state.transactions.get(id);
        if (row) state.transactions.set(id, { ...row, ...changes });
        return row ? 1 : 0;
      },
      delete: async (id: number) => { state.transactions.delete(id); },
      where: () => ({
        equals: (cloudId: string) => ({
          first: async () => [...state.transactions.values()].find((r) => r.cloudId === cloudId),
        }),
      }),
    },
    accounts: { toArray: async () => state.accounts },
    transaction: async (_mode: string, _tables: unknown, fn: () => Promise<void>) => fn(),
  },
}));
vi.mock('@/lib/backend-api', () => ({ backendService: { api: { post: mocks.post } } }));
vi.mock('@/lib/api', () => ({ TokenManager: { getAccessToken: mocks.token } }));
vi.mock('@/lib/auth-sync-integration', () => ({
  processPendingSyncQueue: mocks.process,
  queueRecordUpsertSync: mocks.queue,
  runWithCloudSyncSuppressed: async (fn: () => Promise<unknown>) => fn(),
}));

import { pushImportedTransactions } from '@/services/importSync';

const addRow = (id: number, overrides: Record<string, unknown> = {}) => {
  state.transactions.set(id, {
    id, accountId: 1, type: 'expense', amount: 100, category: 'Food', description: `row ${id}`,
    // Local midnight in the user's zone — must be sent as that calendar day.
    date: new Date(2025, 0, 5), ...overrides,
  });
};

const serverEchoesCreated = () =>
  mocks.post.mockImplementation(async (_url: string, body: { rows: Array<{ clientRowId: string }> }) => ({
    data: {
      created: body.rows.map((r) => ({ key: r.clientRowId, transaction: { id: `srv-${r.clientRowId}` } })),
      duplicates: [],
      failed: [],
    },
  }));

beforeEach(() => {
  state.transactions.clear();
  state.accounts = [{ id: 1, cloudId: 'acc-1' }, { id: 2, cloudId: 'acc-2' }, { id: 3 }];
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => vi.clearAllMocks());

describe('pushImportedTransactions', () => {
  it('sends the rows in one request and links each to its server id', async () => {
    addRow(10);
    addRow(11, { type: 'income', amount: 5000, category: 'Salary' });
    addRow(12, { type: 'transfer', transferToAccountId: 2, category: 'Transfer' });
    serverEchoesCreated();

    const result = await pushImportedTransactions([10, 11, 12], 'moneymanager.csv');

    expect(mocks.post).toHaveBeenCalledTimes(1);
    const [url, body] = mocks.post.mock.calls[0];
    expect(url).toBe('/import/transactions');
    expect(body.source).toBe('moneymanager.csv');
    expect(body.rows[0]).toMatchObject({ clientRowId: '10', accountId: 'acc-1', type: 'expense', amount: 100, date: '2025-01-05' });
    expect(body.rows[2]).toMatchObject({ type: 'transfer', transferToAccountId: 'acc-2' });

    expect(result).toMatchObject({ pushed: 3, queued: 0, alreadyOnServer: 0 });
    expect(state.transactions.get(10)).toMatchObject({ cloudId: 'srv-10', syncStatus: 'synced' });
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('leaves rows the bulk import cannot take to the normal sync queue', async () => {
    addRow(20, { accountId: 3 });                 // account not on the server yet
    addRow(21, { groupExpenseId: 7 });            // linked to a group expense
    addRow(22);
    serverEchoesCreated();

    const result = await pushImportedTransactions([20, 21, 22], 'x.csv');

    expect(mocks.post.mock.calls[0][1].rows.map((r: { clientRowId: string }) => r.clientRowId)).toEqual(['22']);
    expect(mocks.queue).toHaveBeenCalledWith('transactions', 20);
    expect(mocks.queue).toHaveBeenCalledWith('transactions', 21);
    expect(result).toMatchObject({ pushed: 1, queued: 2 });
  });

  it('never doubles a row the server already had', async () => {
    addRow(30);
    addRow(31);
    addRow(99, { cloudId: 'srv-existing' }); // the device already shows the server's copy
    mocks.post.mockResolvedValue({
      data: {
        created: [],
        duplicates: [{ key: '30', transactionId: 'srv-existing' }, { key: '31', transactionId: 'srv-other' }],
        failed: [],
      },
    });

    const result = await pushImportedTransactions([30, 31], 'x.csv');
    expect(result.alreadyOnServer).toBe(2);
    expect(state.transactions.has(30)).toBe(false);                       // duplicate removed
    expect(state.transactions.get(31)).toMatchObject({ cloudId: 'srv-other' }); // linked
  });

  it('queues everything when offline, without calling the server', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    addRow(40);
    const result = await pushImportedTransactions([40], 'x.csv');
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.queue).toHaveBeenCalledWith('transactions', 40);
    expect(result.queued).toBe(1);
  });

  it('sends 250 rows per request with a stable key, and queues a chunk the server refused', async () => {
    for (let id = 100; id < 700; id += 1) addRow(id, { description: `bulk ${id}` });
    let call = 0;
    mocks.post.mockImplementation(async (_url: string, body: { rows: Array<{ clientRowId: string }> }) => {
      call += 1;
      if (call === 2) throw Object.assign(new Error('bad'), { status: 422 });
      return { data: { created: body.rows.map((r) => ({ key: r.clientRowId, transaction: { id: `s${r.clientRowId}` } })), duplicates: [], failed: [] } };
    });

    const result = await pushImportedTransactions([...Array(600).keys()].map((i) => i + 100), 'big.csv');

    expect(mocks.post).toHaveBeenCalledTimes(3); // a 4xx is not retried
    const keys = mocks.post.mock.calls.map((c) => c[2].headers['Idempotency-Key']);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0].split(':')[0]).toBe(keys[2].split(':')[0]);
    expect(result.pushed).toBe(350);
    expect(result.queued).toBe(250);
  });
});
