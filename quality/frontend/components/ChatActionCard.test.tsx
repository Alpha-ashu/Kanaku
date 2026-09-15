// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { executeKaiAction, executeAssistantTask, resolveDefaultAccount, refreshData, toast } = vi.hoisted(() => ({
  executeKaiAction: vi.fn(),
  executeAssistantTask: vi.fn(),
  resolveDefaultAccount: vi.fn(),
  refreshData: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/kai/kaiActionExecutor', () => ({
  executeKaiAction,
  resolveDefaultAccount,
  actionOutflow: (action: { kind: string; entities: { amount?: number } }) =>
    action.kind === 'income' ? 0 : Number(action.entities.amount ?? 0),
}));
vi.mock('@/services/aiTaskExecutor', () => ({ executeAssistantTask }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/contexts/AppContext', () => ({
  useApp: () => ({
    accounts: [
      { id: 1, name: 'HDFC Savings', cloudId: 'acc-cloud-1' },
      { id: 2, name: 'Cash', deletedAt: new Date() },
    ],
    currency: 'INR',
    refreshData,
  }),
}));
vi.mock('sonner', () => ({ toast }));
// lucide-react resolves the root React 18 copy; stub icons so only frontend's React renders.
vi.mock('lucide-react', () => ({ Check: () => null, Loader2: () => null, X: () => null }));

import { ChatActionCard, isConfirmableChatAction, type ChatProposedAction } from '@/app/components/features/ai/ChatActionCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const expense: ChatProposedAction = {
  type: 'expense',
  entities: { amount: 1850, category: 'Groceries', description: 'Groceries', merchant: 'DMart' },
  confidence: 0.9,
  requiresConfirmation: true,
};

const budget: ChatProposedAction = {
  type: 'task',
  entities: { task: { type: 'create_budget', title: 'Food Delivery', category: 'Food Delivery', amount: 3000, period: 'monthly' } },
  confidence: 0.9,
  requiresConfirmation: true,
};

describe('isConfirmableChatAction', () => {
  it('accepts money records and tasks that need confirmation', () => {
    expect(isConfirmableChatAction(expense)).toBe(true);
    expect(isConfirmableChatAction(budget)).toBe(true);
  });

  it('rejects missing, unconfirmed, unknown or empty-task actions', () => {
    expect(isConfirmableChatAction(undefined)).toBe(false);
    expect(isConfirmableChatAction({ ...expense, requiresConfirmation: false })).toBe(false);
    expect(isConfirmableChatAction({ ...expense, type: 'goal' })).toBe(false);
    expect(isConfirmableChatAction({ ...budget, entities: {} })).toBe(false);
  });
});

describe('ChatActionCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  const click = async (testId: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    expect(button).not.toBeNull();
    await act(async () => {
      button!.click();
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    resolveDefaultAccount.mockResolvedValue({ id: 1, name: 'HDFC Savings' });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('saves nothing until Confirm, then records through the Kai executor', async () => {
    const onResolved = vi.fn();
    executeKaiAction.mockResolvedValue({ refs: [], balanceDelta: {}, entities: expense.entities, say: 'Saved ₹1,850.' });

    await act(async () => {
      root.render(<ChatActionCard messageId="m1" prompt="Spent 1850 at DMart" action={expense} status="pending" onResolved={onResolved} />);
    });

    expect(executeKaiAction).not.toHaveBeenCalled();
    // Deleted accounts are not offered.
    expect(container.querySelectorAll('option')).toHaveLength(1);

    await click('kai-chat-action-confirm');

    expect(executeKaiAction).toHaveBeenCalledTimes(1);
    const [action, ctx] = executeKaiAction.mock.calls[0];
    expect(action).toMatchObject({
      actionId: 'chat:m1',
      kind: 'expense',
      rawSegment: 'Spent 1850 at DMart',
      entities: { amount: 1850, category: 'Groceries', merchant: 'DMart' },
    });
    expect(ctx).toEqual({ userId: 'user-1', accountId: 1 });
    expect(refreshData).toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalledWith('saved', 'Saved ₹1,850.');
  });

  it('creates a budget through the assistant task executor', async () => {
    const onResolved = vi.fn();
    executeAssistantTask.mockResolvedValue('Budget set: ₹3,000/month for Food Delivery');

    await act(async () => {
      root.render(<ChatActionCard messageId="m2" prompt="Set a food delivery budget" action={budget} status="pending" onResolved={onResolved} />);
    });
    await click('kai-chat-action-confirm');

    expect(executeAssistantTask).toHaveBeenCalledWith(budget.entities.task, {
      userId: 'user-1',
      accountId: undefined,
      accountCloudId: undefined,
    });
    expect(executeKaiAction).not.toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalledWith('saved', 'Budget set: ₹3,000/month for Food Delivery');
  });

  it('keeps the card pending and shows the error when saving fails', async () => {
    const onResolved = vi.fn();
    executeKaiAction.mockRejectedValue(new Error('HDFC Savings only has ₹100 — this needs ₹1,850.'));

    await act(async () => {
      root.render(<ChatActionCard messageId="m3" prompt="Spent 1850" action={expense} status="pending" onResolved={onResolved} />);
    });
    await click('kai-chat-action-confirm');

    expect(toast.error).toHaveBeenCalledWith('HDFC Savings only has ₹100 — this needs ₹1,850.');
    expect(onResolved).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="kai-chat-action-confirm"]')).not.toBeNull();
  });

  it('cancelling resolves without saving', async () => {
    const onResolved = vi.fn();
    await act(async () => {
      root.render(<ChatActionCard messageId="m4" prompt="Spent 1850" action={expense} status="pending" onResolved={onResolved} />);
    });
    await click('kai-chat-action-dismiss');

    expect(onResolved).toHaveBeenCalledWith('dismissed');
    expect(executeKaiAction).not.toHaveBeenCalled();
  });
});
