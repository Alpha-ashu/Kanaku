/**
 * Budgets and recurring rules live in Dexie but are owned by the backend — the
 * budget alert engine and the recurring worker run off the server's copy. These
 * tests pin the reconciliation contract that keeps the two in step, including
 * the failure modes that made the previous write-only flow lose data:
 *   - the server id must land in `cloudId`, never in the Dexie primary key;
 *   - a POST that never happened (offline) must be retried, not forgotten;
 *   - a row deleted on the server must disappear locally;
 *   - an unreachable server must change nothing at all.
 *
 * RESPONSE SHAPE — these mocks must mirror apiClient, not the wire format.
 * api.ts returns `{ success, data: body.data || body, message }`, so it has
 * ALREADY unwrapped one envelope level: `response.data` is the payload and
 * `response.data.data` does not exist. These mocks previously returned the raw
 * wire envelope nested under `.data`, which made the buggy `response.data?.data`
 * read look correct — the budget list silently resolved to [] against the real
 * client, every local budget re-POSTed forever, and the suite stayed green.
 * Mock what apiClient returns.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    budgets: [] as Array<Record<string, any>>,
    recurring: [] as Array<Record<string, any>>,
  },
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

const makeTable = (rows: Array<Record<string, any>>, key: string) => ({
  toArray: vi.fn(async () => [...rows]),
  get: vi.fn(async (id: any) => rows.find((row) => row[key] === id)),
  put: vi.fn(async (row: Record<string, any>) => {
    const index = rows.findIndex((existing) => existing[key] === row[key]);
    if (index >= 0) rows[index] = row; else rows.push(row);
    return row[key];
  }),
  add: vi.fn(async (row: Record<string, any>) => {
    const id = rows.length + 1;
    rows.push({ ...row, [key]: row[key] ?? id });
    return id;
  }),
  update: vi.fn(async (id: any, changes: Record<string, any>) => {
    const row = rows.find((existing) => existing[key] === id);
    if (!row) return 0;
    Object.assign(row, changes);
    return 1;
  }),
  delete: vi.fn(async (id: any) => {
    const index = rows.findIndex((existing) => existing[key] === id);
    if (index >= 0) rows.splice(index, 1);
  }),
});

vi.mock('@/lib/api', () => ({
  apiClient: {
    get: (...args: any[]) => mocks.get(...args),
    post: (...args: any[]) => mocks.post(...args),
    put: (...args: any[]) => mocks.put(...args),
    delete: (...args: any[]) => mocks.del(...args),
  },
}));

vi.mock('@/lib/database', () => ({
  db: {
    get budgets() { return makeTable(mocks.state.budgets, 'id'); },
    get recurringTransactions() { return makeTable(mocks.state.recurring, 'id'); },
  },
}));

const { syncBudgets, syncRecurringTransactions, deleteBudgetEverywhere, pushBudgetUpdate } =
  await import('@/services/featureSyncService');

beforeEach(() => {
  mocks.state.budgets = [];
  mocks.state.recurring = [];
  vi.clearAllMocks();
  if (!globalThis.crypto?.randomUUID) {
    (globalThis as any).crypto = { randomUUID: () => `uuid-${Math.random()}` };
  }
});

describe('syncBudgets', () => {
  it('creates a local row for a server budget the device has never seen', async () => {
    mocks.get.mockResolvedValue({
      success: true,
      data: [{ id: 'srv-1', category: 'Food', amount: 5000, period: 'monthly', spent: 1200, threshold: 80 }],
    });

    const result = await syncBudgets();

    expect(result.pulled).toBe(1);
    expect(mocks.state.budgets).toHaveLength(1);
    expect(mocks.state.budgets[0]).toMatchObject({ cloudId: 'srv-1', category: 'Food', amount: 5000, threshold: 80 });
    // The local key is the app's own UUID — never the server id.
    expect(mocks.state.budgets[0].id).not.toBe('srv-1');
  });

  it('retries a budget that was created offline and never pushed', async () => {
    mocks.state.budgets.push({ id: 'local-1', category: 'Travel', amount: 3000, period: 'monthly', spent: 0, threshold: 85 });
    mocks.get.mockResolvedValue({ success: true, data: [] });
    mocks.post.mockResolvedValue({ success: true, data: { id: 'srv-9' } });

    const result = await syncBudgets();

    expect(result.pushed).toBe(1);
    expect(mocks.post).toHaveBeenCalledWith('/budgets', expect.objectContaining({ category: 'Travel' }), expect.anything());
    expect(mocks.state.budgets[0].cloudId).toBe('srv-9');
    expect(mocks.state.budgets[0].syncStatus).toBe('synced');
  });

  it('removes a local budget that no longer exists on the server', async () => {
    mocks.state.budgets.push({ id: 'local-1', cloudId: 'srv-gone', category: 'Fuel', amount: 2000, period: 'monthly', spent: 0 });
    mocks.get.mockResolvedValue({ success: true, data: [] });

    const result = await syncBudgets();

    expect(result.removed).toBe(1);
    expect(mocks.state.budgets).toHaveLength(0);
  });

  it('leaves local data untouched when the server is unreachable', async () => {
    mocks.state.budgets.push({ id: 'local-1', cloudId: 'srv-1', category: 'Food', amount: 5000, period: 'monthly', spent: 0 });
    mocks.get.mockRejectedValue(new Error('network down'));

    const result = await syncBudgets();

    expect(result.offline).toBe(true);
    expect(mocks.state.budgets).toHaveLength(1);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  // The server's unique key is (userId, category, period), so an unlinked local
  // row whose twin already exists can never be POSTed — it 400s DUPLICATE_BUDGET
  // every time. Before adoption existed this ran on every single sync.
  it('adopts an existing server budget instead of re-POSTing a duplicate', async () => {
    mocks.state.budgets.push({ id: 'local-1', category: 'Food', amount: 5000, period: 'monthly', spent: 0, threshold: 85 });
    mocks.get.mockResolvedValue({
      success: true,
      data: [{ id: 'srv-1', category: 'Food', amount: 5000, period: 'monthly', spent: 1200, threshold: 80 }],
    });

    await syncBudgets();

    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.state.budgets).toHaveLength(1);
    expect(mocks.state.budgets[0].cloudId).toBe('srv-1');
  });

  it('matches the server twin regardless of category casing or blank period', async () => {
    mocks.state.budgets.push({ id: 'local-1', category: '  food  ', amount: 5000, period: '', spent: 0 });
    mocks.get.mockResolvedValue({
      success: true,
      data: [{ id: 'srv-1', category: 'Food', amount: 5000, period: 'monthly', spent: 0, threshold: 80 }],
    });

    await syncBudgets();

    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.state.budgets[0].cloudId).toBe('srv-1');
  });

  it('links rather than loops when the server rejects a push as duplicate', async () => {
    mocks.state.budgets.push({ id: 'local-1', category: 'Fuel', amount: 2000, period: 'monthly', spent: 0 });
    // Server lists the twin only AFTER the push attempt races it in.
    mocks.get.mockResolvedValue({
      success: true,
      data: [{ id: 'srv-7', category: 'Fuel', amount: 2000, period: 'monthly', spent: 0, threshold: 80 }],
    });
    mocks.post.mockRejectedValue(Object.assign(new Error('dup'), { status: 400, code: 'DUPLICATE_BUDGET' }));

    await syncBudgets();

    expect(mocks.state.budgets[0].cloudId).toBe('srv-7');
    expect(mocks.state.budgets[0].syncStatus).toBe('synced');
  });
});

describe('budget mutations', () => {
  it('deletes on the server using the cloud id, not the local key', async () => {
    const budget = { id: 'local-1', cloudId: 'srv-1', category: 'Food', amount: 5000, period: 'monthly', spent: 0 } as any;
    mocks.state.budgets.push(budget);
    mocks.del.mockResolvedValue({ data: {} });

    await deleteBudgetEverywhere(budget);

    expect(mocks.del).toHaveBeenCalledWith('/budgets/srv-1', expect.anything());
    expect(mocks.state.budgets).toHaveLength(0);
  });

  it('does not call the API for a budget that was never pushed', async () => {
    const budget = { id: 'local-1', category: 'Food', amount: 5000, period: 'monthly', spent: 0 } as any;
    mocks.state.budgets.push(budget);

    await deleteBudgetEverywhere(budget);

    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.state.budgets).toHaveLength(0);
  });

  it('pushes a threshold change so the server alert engine uses the same number', async () => {
    mocks.put.mockResolvedValue({ data: {} });

    await pushBudgetUpdate({ id: 'local-1', cloudId: 'srv-1' }, { threshold: 60 });

    expect(mocks.put).toHaveBeenCalledWith('/budgets/srv-1', { threshold: 60 }, expect.anything());
  });

  it('marks an unpushed budget pending instead of losing the edit', async () => {
    mocks.state.budgets.push({ id: 'local-1', category: 'Food', amount: 5000, period: 'monthly', spent: 0 });

    await pushBudgetUpdate({ id: 'local-1', cloudId: undefined }, { threshold: 60 });

    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.state.budgets[0].syncStatus).toBe('pending');
  });
});

describe('syncRecurringTransactions', () => {
  it('pulls server rules into the local table', async () => {
    mocks.get.mockResolvedValue({
      success: true,
      data: [{
        id: 'rec-1', title: 'Rent', amount: 18000, type: 'expense',
        category: 'housing', interval: 'monthly', nextDueDate: '2026-09-01T00:00:00.000Z', status: 'active',
      }],
    });

    const result = await syncRecurringTransactions();

    expect(result.pulled).toBe(1);
    expect(mocks.state.recurring[0]).toMatchObject({ cloudId: 'rec-1', name: 'Rent', amount: 18000, frequency: 'monthly' });
  });

  it('pushes a rule created offline so the worker actually runs it', async () => {
    mocks.state.recurring.push({
      id: 1, name: 'Netflix', amount: 649, type: 'expense', category: 'entertainment',
      frequency: 'monthly', nextDueDate: new Date('2026-09-05'), status: 'active',
    });
    mocks.get.mockResolvedValue({ success: true, data: [] });
    mocks.post.mockResolvedValue({ success: true, data: { id: 'rec-9' } });

    const result = await syncRecurringTransactions();

    expect(result.pushed).toBe(1);
    expect(mocks.state.recurring[0].cloudId).toBe('rec-9');
  });

  it('does not push a schedule the API cannot represent', async () => {
    mocks.state.recurring.push({
      id: 1, name: 'Metro pass', amount: 500, type: 'expense', category: 'transport',
      frequency: 'biweekly', nextDueDate: new Date('2026-09-05'), status: 'active',
    });
    mocks.get.mockResolvedValue({ success: true, data: [] });

    const result = await syncRecurringTransactions();

    expect(result.pushed).toBe(0);
    expect(mocks.post).not.toHaveBeenCalled();
    // Still there — a rule the server cannot store is kept, not dropped.
    expect(mocks.state.recurring).toHaveLength(1);
  });

  it('leaves local rules untouched when the server is unreachable', async () => {
    mocks.state.recurring.push({ id: 1, name: 'Rent', amount: 18000, type: 'expense', category: 'housing', frequency: 'monthly', nextDueDate: new Date(), status: 'active' });
    mocks.get.mockRejectedValue(new Error('offline'));

    const result = await syncRecurringTransactions();

    expect(result.offline).toBe(true);
    expect(mocks.state.recurring).toHaveLength(1);
  });
});
