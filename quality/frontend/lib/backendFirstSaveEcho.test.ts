// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A backend-confirmed save used to write its Dexie row with the sync hooks live,
// so the hook queued the row and the queue echoed it straight back as a redundant
// PUT /transactions/:id. The mock tables below run the REAL hooks the sync module
// registers, so these tests observe the actual sync queue.
const { tables, apiPost, apiPut } = vi.hoisted(() => {
  const createHookedTable = () => {
    const rows = new Map<number, any>();
    const hooks: Record<string, (...args: any[]) => void> = {};
    let nextId = 1;
    return {
      rows,
      hook: (name: string, fn: (...args: any[]) => void) => { hooks[name] = fn; },
      add: vi.fn(async (item: any) => {
        const ctx: { onsuccess?: (key: number) => void } = {};
        hooks.creating?.call(ctx, undefined, item);
        const id = nextId++;
        rows.set(id, { ...item, id });
        ctx.onsuccess?.(id);
        return id;
      }),
      get: vi.fn(async (id: number) => rows.get(Number(id))),
      toArray: vi.fn(async () => Array.from(rows.values())),
      update: vi.fn(async (id: number, mods: any) => {
        const existing = rows.get(Number(id));
        if (!existing) return 0;
        const ctx: { onsuccess?: () => void } = {};
        hooks.updating?.call(ctx, mods, id, existing);
        rows.set(Number(id), { ...existing, ...mods });
        ctx.onsuccess?.();
        return 1;
      }),
    };
  };
  return {
    tables: {
      accounts: createHookedTable(),
      friends: createHookedTable(),
      transactions: createHookedTable(),
      loans: createHookedTable(),
      goals: createHookedTable(),
      groupExpenses: createHookedTable(),
      investments: createHookedTable(),
      toDoLists: createHookedTable(),
      toDoItems: createHookedTable(),
      toDoListShares: createHookedTable(),
    },
    apiPost: vi.fn(),
    apiPut: vi.fn(),
  };
});

vi.mock('@/lib/database', () => ({
  db: {
    ...tables,
    // Server-confirmed rows are stored inside a read-write transaction so a
    // concurrent pull cannot insert a second copy; the mock just runs the body.
    transaction: vi.fn(async (_mode: string, _tables: unknown, work: () => Promise<unknown>) => work()),
  },
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiClient: { post: apiPost, put: apiPut, get: vi.fn(), delete: vi.fn() } };
});

import { saveTransactionWithBackendSync, updateTransactionWithBackendSync } from '@/lib/auth-sync-integration';
import { resetSubmitGuard } from '@/lib/submitGuard';

const SYNC_QUEUE_STORAGE_KEY = 'KANAKU_sync_queue_v3';
const queuedKeys = (): string[] =>
  JSON.parse(localStorage.getItem(SYNC_QUEUE_STORAGE_KEY) || '[]').map((item: { key: string }) => item.key);

const expense = {
  type: 'expense',
  amount: 250,
  accountId: 1,
  category: 'Food',
  date: new Date('2026-09-15T10:00:00.000Z'),
};

describe('backend-first transaction saves', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
    Object.values(tables).forEach((table) => table.rows.clear());
    // Every test here saves the same expense; without a reset the create
    // coalescer (correctly) folds each one into the previous test's save.
    resetSubmitGuard();
    tables.accounts.rows.set(1, { id: 1, name: 'Bank', cloudId: 'cloud-acc-1', balance: 1000 });
    apiPost.mockReset();
    apiPut.mockReset();
  });

  it('does not queue an echo of a transaction the server just created', async () => {
    apiPost.mockResolvedValue({ data: { id: 'cloud-tx-1', createdAt: '2026-09-15T10:00:01.000Z' } });

    const saved = await saveTransactionWithBackendSync(expense);

    expect(saved).toMatchObject({ cloudId: 'cloud-tx-1', syncStatus: 'synced' });
    expect(queuedKeys()).not.toContain(`transactions:${saved.id}`);
  });

  it('still queues the row when the backend is unavailable and it is saved locally', async () => {
    apiPost.mockRejectedValue({ status: 503, code: 'DATABASE_UNAVAILABLE' });

    const saved = await saveTransactionWithBackendSync(expense);

    expect(saved).toMatchObject({ syncStatus: 'pending' });
    expect(queuedKeys()).toContain(`transactions:${saved.id}`);
  });

  it('keeps a throttled save locally and queues it instead of failing', async () => {
    apiPost.mockRejectedValue({ status: 429, code: 'RATE_LIMIT_EXCEEDED' });

    const saved = await saveTransactionWithBackendSync(expense);

    expect(saved).toMatchObject({ syncStatus: 'pending' });
    expect(queuedKeys()).toContain(`transactions:${saved.id}`);
  });

  it('does not queue an echo of an update the server just accepted', async () => {
    tables.transactions.rows.set(7, { ...expense, id: 7, cloudId: 'cloud-tx-7', syncStatus: 'synced' });
    apiPut.mockResolvedValue({ data: { id: 'cloud-tx-7', updatedAt: '2026-09-15T11:00:00.000Z' } });

    await updateTransactionWithBackendSync(7, { amount: 300 });

    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(tables.transactions.rows.get(7)).toMatchObject({ amount: 300, syncStatus: 'synced' });
    expect(queuedKeys()).not.toContain('transactions:7');
  });
});
