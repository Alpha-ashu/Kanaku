// @vitest-environment jsdom

/**
 * Regression suite for the duplicate-entry loop that showed up across every
 * feature (transactions, goals, loans, accounts, todos…).
 *
 * Three independent defects fed the same symptom:
 *
 *  1. Queued creates carried no stable idempotency key, so a POST the server
 *     committed but whose response was lost came back as a second row.
 *  2. Queued deletes captured the server id through `toNumber(cloudId)` — a UUID
 *     became NaN, the queue decided there was nothing to delete, and the next
 *     pull restored the row the user had just removed.
 *  3. Local dedup deleted rows that had distinct server ids, under sync
 *     suppression, so the server never heard about it and the pull put them back.
 *
 * The mock tables below run the REAL Dexie hooks the sync module installs, so
 * these tests exercise the actual queue rather than a re-implementation of it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tables, apiPost, apiPut, apiDelete, apiGet } = vi.hoisted(() => {
  const createHookedTable = (name: string) => {
    const rows = new Map<number, any>();
    const hooks: Record<string, (...args: any[]) => void> = {};
    let nextId = 1;

    const table: any = {
      name,
      rows,
      hook: (hookName: string, fn: (...args: any[]) => void) => { hooks[hookName] = fn; },
      add: vi.fn(async (item: any) => {
        const ctx: { onsuccess?: (key: number) => void } = {};
        hooks.creating?.call(ctx, undefined, item);
        const id = Number(item.id) || nextId++;
        rows.set(id, { ...item, id });
        ctx.onsuccess?.(id);
        return id;
      }),
      get: vi.fn(async (id: any) => rows.get(Number(id))),
      update: vi.fn(async (id: any, mods: any) => {
        const existing = rows.get(Number(id));
        if (!existing) return 0;
        const ctx: { onsuccess?: () => void } = {};
        hooks.updating?.call(ctx, mods, Number(id), existing);
        rows.set(Number(id), { ...existing, ...mods });
        ctx.onsuccess?.();
        return 1;
      }),
      delete: vi.fn(async (id: any) => {
        const existing = rows.get(Number(id));
        if (!existing) return;
        const ctx: { onsuccess?: () => void } = {};
        hooks.deleting?.call(ctx, Number(id), existing);
        rows.delete(Number(id));
        ctx.onsuccess?.();
      }),
      bulkDelete: vi.fn(async (ids: any[]) => {
        for (const id of ids) await table.delete(id);
      }),
      toArray: vi.fn(async () => Array.from(rows.values())),
      filter: vi.fn((predicate: (row: any) => boolean) => ({
        toArray: async () => Array.from(rows.values()).filter(predicate),
      })),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: async () => null,
          toArray: async () => [],
          delete: async () => 0,
        })),
      })),
      seed: (row: any) => { rows.set(Number(row.id), row); },
    };
    return table;
  };

  const names = [
    'accounts', 'friends', 'transactions', 'loans', 'goals', 'groupExpenses',
    'investments', 'toDoLists', 'toDoItems', 'toDoListShares', 'budgets',
    'recurringTransactions', 'notifications', 'smsTransactions', 'documents',
  ];
  const built: Record<string, any> = {};
  names.forEach((n) => { built[n] = createHookedTable(n); });

  return {
    tables: built,
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
    apiGet: vi.fn(),
  };
});

vi.mock('@/lib/database', () => ({
  db: {
    ...tables,
    transaction: vi.fn(async (_mode: string, _tables: any, cb: () => Promise<any>) => cb()),
  },
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    apiClient: { post: apiPost, put: apiPut, get: apiGet, delete: apiDelete },
  };
});

// The dedup pass finishes by recomputing balances from the surviving rows; it is
// not what these tests are about.
vi.mock('@/lib/transactionAggregation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/transactionAggregation')>();
  return { ...actual, rebuildAccountBalances: vi.fn(async () => {}) };
});

import { TokenManager } from '@/lib/api';
import {
  deduplicateLocalData,
  deleteTransactionWithBackendSync,
  initializeBackendSync,
  processPendingSyncQueue,
  queueRecordUpsertSync,
} from '@/lib/auth-sync-integration';
import { resetSubmitGuard } from '@/lib/submitGuard';

const SYNC_QUEUE_STORAGE_KEY = 'KANAKU_sync_queue_v3';

const readQueue = (): any[] =>
  JSON.parse(localStorage.getItem(SYNC_QUEUE_STORAGE_KEY) || '[]');

const drainQueue = async () => {
  // The queue bails out early while a previous drain is still marked in flight,
  // so each call here is awaited to completion before the next assertion.
  await processPendingSyncQueue();
};

/**
 * Lets any fire-and-forget work the drain kicked off settle.
 *
 * A replay conflict schedules an un-awaited relink pull, and that pull runs its
 * merge under `runWithCloudSyncSuppressed` — which makes `processPendingSyncQueue`
 * return early. Left dangling it would leak into the next test.
 */
const flushBackgroundWork = async () => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('sync duplication guards', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
    vi.stubGlobal('navigator', { onLine: true });

    Object.values(tables).forEach((table: any) => table.rows.clear());
    resetSubmitGuard();
    tables.accounts.seed({ id: 1, name: 'Bank', type: 'bank', currency: 'INR', cloudId: 'cloud-acc-1', balance: 1000 });

    apiPost.mockReset();
    apiPut.mockReset();
    apiDelete.mockReset();
    apiGet.mockReset();
    apiGet.mockResolvedValue({ data: { success: true, data: [] } });

    TokenManager.clearTokens();
    // {"userId":"user-b"}
    TokenManager.setAccessToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLWIifQ.sig');

    // Installs the Dexie hooks on the mock tables — the queue only exists once
    // these are bound, exactly as in the app.
    initializeBackendSync();
  });

  describe('stable idempotency key on queued creates', () => {
    it('stamps a clientRequestId on every locally created row in a synced table', async () => {
      const id = await tables.goals.add({ name: 'Buy Laptop', targetAmount: 1500 });

      expect(tables.goals.rows.get(id).clientRequestId).toEqual(expect.any(String));
    });

    it('reuses the same key when a create is retried after a lost response', async () => {
      const localId = await tables.goals.add({ name: 'Buy Laptop', targetAmount: 1500 });

      // First attempt: the server commits, the response never arrives.
      apiPost.mockRejectedValueOnce({ status: 0, code: 'TIMEOUT_ERROR' });
      await drainQueue();

      apiPost.mockResolvedValueOnce({ data: { id: 'cloud-goal-1' } });
      await drainQueue();

      expect(apiPost).toHaveBeenCalledTimes(2);
      const firstKey = apiPost.mock.calls[0][2]?.idempotencyKey;
      const secondKey = apiPost.mock.calls[1][2]?.idempotencyKey;

      expect(firstKey).toEqual(expect.any(String));
      expect(secondKey).toBe(firstKey);
      expect(tables.goals.rows.get(localId).cloudId).toBe('cloud-goal-1');
    });

    it('does not resend a create the server already accepted under the same key', async () => {
      await tables.goals.add({ name: 'Emergency Fund', targetAmount: 50_000 });

      apiPost.mockRejectedValue({ status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' });
      await drainQueue();

      // Parked, not retried: the record exists server-side and a fresh POST
      // would be the duplicate.
      expect(readQueue()).toHaveLength(0);

      await flushBackgroundWork();
    });
  });

  describe('queued deletes reach the server', () => {
    it('sends DELETE for a row whose server id is a UUID', async () => {
      tables.transactions.seed({
        id: 5,
        type: 'expense',
        amount: 250,
        accountId: 1,
        cloudId: '8f14e45f-ceea-467a-9cd0-6a7b8c9d0e1f',
        syncStatus: 'synced',
      });

      // Backend unreachable at delete time, so the delete has to survive in the queue.
      apiDelete.mockRejectedValueOnce({ status: 503, code: 'DATABASE_UNAVAILABLE' });
      await deleteTransactionWithBackendSync(5);

      const queued = readQueue();
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({
        operation: 'delete',
        remoteId: '8f14e45f-ceea-467a-9cd0-6a7b8c9d0e1f',
      });

      apiDelete.mockResolvedValueOnce({ data: { success: true } });
      await drainQueue();

      expect(apiDelete).toHaveBeenLastCalledWith(
        '/transactions/8f14e45f-ceea-467a-9cd0-6a7b8c9d0e1f',
        expect.any(Object),
      );
      expect(readQueue()).toHaveLength(0);
    });

    it('sends DELETE for a row removed straight from Dexie', async () => {
      tables.loans.seed({ id: 3, name: 'Car loan', cloudId: 'cloud-loan-3' });

      await tables.loans.delete(3);

      expect(readQueue()[0]).toMatchObject({
        table: 'loans',
        operation: 'delete',
        remoteId: 'cloud-loan-3',
      });

      apiDelete.mockResolvedValueOnce({ data: { success: true } });
      await drainQueue();

      expect(apiDelete).toHaveBeenCalledWith('/loans/cloud-loan-3', expect.any(Object));
    });

    it('drops a queued delete carrying a legacy NaN id instead of calling DELETE /…/NaN', async () => {
      localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify([{
        key: 'transactions:9',
        table: 'transactions',
        operation: 'delete',
        localId: 9,
        remoteId: null,
        queuedAt: new Date().toISOString(),
      }]));

      await drainQueue();

      expect(apiDelete).not.toHaveBeenCalled();
      expect(readQueue()).toHaveLength(0);
    });
  });

  describe('local dedup converges instead of boomeranging', () => {
    it('collapses two local rows that point at the same server record', async () => {
      tables.transactions.seed({
        id: 1, type: 'expense', amount: 250, category: 'Food', description: 'Lunch',
        date: new Date('2026-09-15T10:00:00.000Z'), cloudId: 'cloud-tx-1', updatedAt: new Date('2026-09-15T10:00:00.000Z'),
      });
      tables.transactions.seed({
        id: 2, type: 'expense', amount: 250, category: 'Food', description: 'Lunch',
        date: new Date('2026-09-15T10:00:00.000Z'), cloudId: 'cloud-tx-1', updatedAt: new Date('2026-09-15T09:00:00.000Z'),
      });

      await deduplicateLocalData();

      const survivors = await tables.transactions.toArray();
      expect(survivors).toHaveLength(1);
      expect(survivors[0].cloudId).toBe('cloud-tx-1');
    });

    it('keeps two identical entries that are distinct server records', async () => {
      // Two ₹250 lunches on the same day is a thing people actually do. Deleting
      // the second locally never removed it server-side, so it came straight back
      // on the next pull — and on the pulls where it did not, the user had simply
      // lost an entry they made.
      tables.transactions.seed({
        id: 1, type: 'expense', amount: 250, category: 'Food', description: 'Lunch',
        date: new Date('2026-09-15T10:00:00.000Z'), cloudId: 'cloud-tx-1',
      });
      tables.transactions.seed({
        id: 2, type: 'expense', amount: 250, category: 'Food', description: 'Lunch',
        date: new Date('2026-09-15T10:00:00.000Z'), cloudId: 'cloud-tx-2',
      });

      await deduplicateLocalData();

      const survivors = await tables.transactions.toArray();
      expect(survivors.map((row: any) => row.cloudId).sort()).toEqual(['cloud-tx-1', 'cloud-tx-2']);
    });

    it('removes an unlinked local shadow of a row that did sync', async () => {
      tables.goals.seed({ id: 1, name: 'Trip', targetAmount: 20000, cloudId: 'cloud-goal-1' });
      tables.goals.seed({ id: 2, name: 'Trip', targetAmount: 20000 });

      await deduplicateLocalData();

      const survivors = await tables.goals.toArray();
      expect(survivors).toHaveLength(1);
      expect(survivors[0].cloudId).toBe('cloud-goal-1');
    });

    it('collapses two unlinked rows that share one clientRequestId', async () => {
      tables.friends.seed({ id: 1, name: 'Asha', email: 'asha@example.com', clientRequestId: 'cri-1' });
      tables.friends.seed({ id: 2, name: 'Asha K', email: 'asha@example.com', clientRequestId: 'cri-1' });

      await deduplicateLocalData();

      expect(await tables.friends.toArray()).toHaveLength(1);
    });
  });

  describe('offline transaction save', () => {
    it('queues the retry under the same key the failed POST used', async () => {
      const { saveTransactionWithBackendSync } = await import('@/lib/auth-sync-integration');

      // The server may well have committed this; only the response was lost.
      apiPost.mockRejectedValueOnce({ status: 0, code: 'TIMEOUT_ERROR' });
      const saved = await saveTransactionWithBackendSync({
        type: 'expense',
        amount: 250,
        accountId: 1,
        category: 'Food',
        date: new Date('2026-09-15T10:00:00.000Z'),
      });

      const directKey = apiPost.mock.calls[0][2]?.idempotencyKey;
      expect(directKey).toEqual(expect.any(String));
      expect(tables.transactions.rows.get(saved.id).clientRequestId).toBe(directKey);

      apiPost.mockResolvedValueOnce({ data: { id: 'cloud-tx-9' } });
      await drainQueue();

      expect(apiPost.mock.calls[1][2]?.idempotencyKey).toBe(directKey);
      expect(tables.transactions.rows.get(saved.id).cloudId).toBe('cloud-tx-9');
    });

    it('forwards a confirmed repeat so the server does not swallow it', async () => {
      const { saveTransactionWithBackendSync } = await import('@/lib/auth-sync-integration');

      apiPost.mockResolvedValueOnce({ data: { id: 'cloud-tx-10' } });
      await saveTransactionWithBackendSync({
        type: 'expense',
        amount: 250,
        accountId: 1,
        category: 'Food',
        date: new Date('2026-09-15T10:00:00.000Z'),
        intentionalDuplicate: true,
      });

      expect(apiPost.mock.calls[0][1]).toMatchObject({ intentionalDuplicate: true });
    });
  });

  describe('server-side side-effect transactions', () => {
    it('never sends accountId when pushing a loan', async () => {
      // POST /loans posts its own "Loan disbursement" transaction and moves the
      // account balance whenever an account is attached. Every client path that
      // creates a loan (AddTransaction's loan mode, the voice command centre, the
      // statement importer) has already recorded that cash movement as its own
      // transaction, so forwarding the account booked the same money twice —
      // the user's row plus a server-generated twin with a different description,
      // which the content-hash dedup cannot recognise as the same thing.
      tables.loans.seed({
        id: 4,
        type: 'borrowed',
        name: 'Borrowed from Asha',
        principalAmount: 5000,
        outstandingBalance: 5000,
        accountId: 1,
        status: 'active',
      });
      queueRecordUpsertSync('loans', 4);

      apiPost.mockResolvedValueOnce({ data: { id: 'cloud-loan-4' } });
      await drainQueue();

      expect(apiPost).toHaveBeenCalledTimes(1);
      const [path, body] = apiPost.mock.calls[0];
      expect(path).toBe('/loans');
      expect(body).not.toHaveProperty('accountId');
      expect(body).toMatchObject({ name: 'Borrowed from Asha', principalAmount: 5000 });
    });

    it('still resolves friendId to its cloud id on a loan push', async () => {
      tables.friends.seed({ id: 2, name: 'Asha', cloudId: 'cloud-friend-2' });
      tables.loans.seed({
        id: 5,
        type: 'lent',
        name: 'Lent to Asha',
        principalAmount: 1200,
        outstandingBalance: 1200,
        friendId: 2,
        accountId: 1,
        status: 'active',
      });
      queueRecordUpsertSync('loans', 5);

      apiPost.mockResolvedValueOnce({ data: { id: 'cloud-loan-5' } });
      await drainQueue();

      const [, body] = apiPost.mock.calls[0];
      expect(body).toMatchObject({ friendId: 'cloud-friend-2' });
      expect(body).not.toHaveProperty('accountId');
    });
  });

  describe('to-do tasks: one Add, one task', () => {
    const task = () => ({
      listId: 1,
      title: 'Buy milk',
      priority: 'medium',
      completed: false,
      createdBy: 'user-b',
      createdAt: new Date(),
    });

    beforeEach(() => {
      tables.toDoLists.seed({ id: 1, name: 'Groceries', cloudId: '501' });
    });

    it('creates one task when Add fires twice during the round trip', async () => {
      const { saveToDoItemWithBackendSync } = await import('@/lib/auth-sync-integration');
      let release!: () => void;
      apiPost.mockImplementation(
        () => new Promise((resolve) => { release = () => resolve({ data: { data: { id: 9001 } } }); }),
      );

      // Enter pressed twice (or Enter + button) before the first save came back.
      const first = saveToDoItemWithBackendSync(task());
      const second = saveToDoItemWithBackendSync(task());
      await flushBackgroundWork();
      release();
      const [a, b] = await Promise.all([first, second]);

      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(a.id).toBe(b.id);
      expect(await tables.toDoItems.toArray()).toHaveLength(1);
    });

    it('stores one task when the realtime refresh inserted it first', async () => {
      const { saveToDoItemWithBackendSync } = await import('@/lib/auth-sync-integration');

      // The server emits `todo_updated` to the creating device too. Its pull can
      // insert the new task before this save gets its own response back.
      apiPost.mockImplementation(async () => {
        tables.toDoItems.seed({ id: 77, listId: 1, title: 'Buy milk', cloudId: '9002', syncStatus: 'synced' });
        return { data: { data: { id: 9002 } } };
      });

      const saved = await saveToDoItemWithBackendSync(task());

      const rows = await tables.toDoItems.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 77, cloudId: '9002' });
      expect(saved.id).toBe(77);
    });

    it('still creates two tasks with different titles', async () => {
      const { saveToDoItemWithBackendSync } = await import('@/lib/auth-sync-integration');
      apiPost
        .mockResolvedValueOnce({ data: { data: { id: 9003 } } })
        .mockResolvedValueOnce({ data: { data: { id: 9004 } } });

      await saveToDoItemWithBackendSync(task());
      await saveToDoItemWithBackendSync({ ...task(), title: 'Buy bread' });

      expect(apiPost).toHaveBeenCalledTimes(2);
      expect(await tables.toDoItems.toArray()).toHaveLength(2);
    });

    it('creates one list when Create fires twice', async () => {
      const { saveToDoListWithBackendSync } = await import('@/lib/auth-sync-integration');
      apiPost.mockResolvedValue({ data: { data: { id: 601 } } });

      const list = () => ({ name: 'Weekend', ownerId: 'user-b', listType: 'individual', archived: false, createdAt: new Date() });
      await Promise.all([saveToDoListWithBackendSync(list()), saveToDoListWithBackendSync(list())]);

      expect(apiPost).toHaveBeenCalledTimes(1);
      expect((await tables.toDoLists.toArray()).filter((row: any) => row.name === 'Weekend')).toHaveLength(1);
    });
  });

  describe('queue entry identity', () => {
    it('folds repeat writes to one row into a single queued upsert', async () => {
      const localId = await tables.goals.add({ name: 'Bike', targetAmount: 90_000 });
      queueRecordUpsertSync('goals', localId);
      await tables.goals.update(localId, { targetAmount: 95_000 });

      const queued = readQueue().filter((item) => item.table === 'goals');
      expect(queued).toHaveLength(1);
    });
  });
});
