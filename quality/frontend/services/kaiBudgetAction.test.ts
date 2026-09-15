import { beforeEach, describe, expect, it, vi } from 'vitest';

const { budgets, saveBudget, deleteBudgetEverywhere, updateBudget } = vi.hoisted(() => ({
  budgets: new Map<string, { id: string; cloudId?: string; category: string; amount: number; period: string; syncStatus?: string }>(),
  saveBudget: vi.fn(),
  deleteBudgetEverywhere: vi.fn(),
  updateBudget: vi.fn(),
}));

vi.mock('@/lib/database', () => ({
  db: {
    accounts: { get: vi.fn(async () => ({ id: 1, name: 'HDFC', balance: 50000 })) },
    budgets: {
      get: vi.fn(async (id: string) => budgets.get(id)),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const row = budgets.get(id);
        if (row) budgets.set(id, { ...row, ...changes });
        return 1;
      }),
    },
  },
}));
vi.mock('@/lib/api', () => ({ apiClient: {} }));
vi.mock('@/lib/backend-api', () => ({ backendService: { updateBudget } }));
vi.mock('@/lib/auth-sync-integration', () => ({}));
vi.mock('@/lib/transactionAggregation', () => ({ applyAccountBalanceDeltas: vi.fn(), getTransactionAccountDeltas: vi.fn() }));
vi.mock('@/services/aiTaskExecutor', () => ({ saveBudget, resolveAssistantTodoList: vi.fn() }));
vi.mock('@/services/featureSyncService', () => ({ deleteBudgetEverywhere }));

import { executeKaiAction, removeKaiAction, updateKaiAction } from '@/services/kai/kaiActionExecutor';
import type { KaiAction, KaiExecutedAction } from '@/services/kai/kaiTypes';

const spoken: KaiAction = {
  actionId: 'kai:s1:1:0',
  kind: 'budget',
  rawSegment: 'set a food budget of 3000',
  entities: { category: 'Food & Dining', amount: 3000, period: 'monthly' },
  confidence: 0.95,
  requiresReview: false,
};

const executed = (outcome: Awaited<ReturnType<typeof executeKaiAction>>): KaiExecutedAction => ({
  ...spoken,
  status: 'saved',
  refs: outcome.refs,
  balanceDelta: outcome.balanceDelta,
  entities: outcome.entities,
  summary: 'Food & Dining budget',
  utteranceSeq: 1,
  createdAt: new Date().toISOString(),
});

describe('Kai budget actions', () => {
  beforeEach(() => {
    budgets.clear();
    saveBudget.mockReset();
    deleteBudgetEverywhere.mockReset();
    updateBudget.mockReset();
  });

  it('creates a budget without touching any account balance', async () => {
    const row = { id: 'b-new', cloudId: 'srv-1', category: 'Food & Dining', amount: 3000, period: 'monthly' };
    budgets.set(row.id, row);
    saveBudget.mockResolvedValue({ budget: row, created: true });

    const outcome = await executeKaiAction(spoken, { userId: 'u1', accountId: 1 });

    expect(saveBudget).toHaveBeenCalledWith({ category: 'Food & Dining', amount: 3000, period: 'monthly' });
    expect(outcome.refs).toEqual([{ table: 'budgets', budgetId: 'b-new', owned: true }]);
    expect(outcome.balanceDelta).toEqual({});
    expect(outcome.say).toMatch(/₹3,000 a month for Food & Dining/);
  });

  it('undo deletes a budget Kai created but never one it only updated', async () => {
    const row = { id: 'b-new', cloudId: 'srv-1', category: 'Food & Dining', amount: 3000, period: 'monthly' };
    budgets.set(row.id, row);

    saveBudget.mockResolvedValue({ budget: row, created: true });
    await removeKaiAction(executed(await executeKaiAction(spoken, { accountId: 1 })));
    expect(deleteBudgetEverywhere).toHaveBeenCalledWith(row);

    deleteBudgetEverywhere.mockReset();
    saveBudget.mockResolvedValue({ budget: row, created: false });
    await removeKaiAction(executed(await executeKaiAction(spoken, { accountId: 1 })));
    expect(deleteBudgetEverywhere).not.toHaveBeenCalled();
  });

  it('edits the limit locally and on the server', async () => {
    const row = { id: 'b-new', cloudId: 'srv-1', category: 'Food & Dining', amount: 3000, period: 'monthly' };
    budgets.set(row.id, row);
    saveBudget.mockResolvedValue({ budget: row, created: true });
    const action = executed(await executeKaiAction(spoken, { accountId: 1 }));

    await updateKaiAction(action, { amount: 4500, period: 'weekly' }, { accountId: 1 });

    expect(budgets.get('b-new')).toMatchObject({ amount: 4500, period: 'weekly' });
    expect(updateBudget).toHaveBeenCalledWith('srv-1', { amount: 4500, period: 'weekly' });
  });
});
