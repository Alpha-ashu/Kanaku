import { describe, expect, it, vi } from 'vitest';

// The module imports `db` at load time; the engine functions under test are
// pure and never touch it, so a minimal stub is enough.
vi.mock('@/lib/database', () => ({
  db: {},
}));

import {
  computeAccountDeltas,
  computeDerivedBalances,
  getAccountBalanceSnapshot,
  getTransactionAccountDeltas,
} from './transactionAggregation';

const account = (id: number, openingBalance: number | undefined, balance = 0) => ({
  id,
  openingBalance,
  balance,
});

const tx = (
  type: 'income' | 'expense' | 'transfer',
  amount: number,
  accountId: number,
  extra: Record<string, unknown> = {},
) => ({ type, amount, accountId, ...extra }) as any;

describe('computeDerivedBalances — spec scenarios', () => {
  it('Scenario 1: opening 5000, expense 5000 → 0', () => {
    const balances = computeDerivedBalances(
      [account(1, 5000)],
      [tx('expense', 5000, 1)],
    );
    expect(balances.get(1)).toBe(0);
  });

  it('Scenario 2: opening 5000, expense 2000 → 3000', () => {
    const balances = computeDerivedBalances(
      [account(1, 5000)],
      [tx('expense', 2000, 1)],
    );
    expect(balances.get(1)).toBe(3000);
  });

  it('Scenario 3: opening 5000, expense 6000 → -1000 (overspend allowed)', () => {
    const balances = computeDerivedBalances(
      [account(1, 5000)],
      [tx('expense', 6000, 1)],
    );
    expect(balances.get(1)).toBe(-1000);
  });

  it('income + expense are each counted exactly once (no double-deduction)', () => {
    const balances = computeDerivedBalances(
      [account(1, 0)],
      [tx('income', 5000, 1), tx('expense', 5000, 1)],
    );
    expect(balances.get(1)).toBe(0);
  });

  it('is idempotent: recomputing the same ledger never drifts (the -1200-for-one-600-expense bug)', () => {
    const accounts = [account(1, 0)];
    const txns = [tx('expense', 600, 1)];
    const first = computeDerivedBalances(accounts, txns);
    const second = computeDerivedBalances(accounts, txns);
    // A single 600 expense yields -600, never -1200, no matter how often we recompute.
    expect(first.get(1)).toBe(-600);
    expect(second.get(1)).toBe(-600);
  });
});

describe('computeDerivedBalances — transfers', () => {
  it('moves money from source to destination, net zero across both', () => {
    const balances = computeDerivedBalances(
      [account(1, 5000), account(2, 0)],
      [tx('transfer', 2000, 1, { transferToAccountId: 2 })],
    );
    expect(balances.get(1)).toBe(3000);
    expect(balances.get(2)).toBe(2000);
  });
});

describe('computeDerivedBalances — goal contributions & loan payments', () => {
  it('counts UI goal contributions (no linked transaction) as outflow', () => {
    const balances = computeDerivedBalances(
      [account(1, 5000)],
      [],
      [{ accountId: 1, amount: 1500 }],
    );
    expect(balances.get(1)).toBe(3500);
  });

  it('does NOT double-count import goal contributions linked to a transaction', () => {
    const balances = computeDerivedBalances(
      [account(1, 5000)],
      [tx('expense', 1500, 1)],
      // Linked to the imported expense above → must not deduct again.
      [{ accountId: 1, amount: 1500, transactionId: 99 }],
    );
    expect(balances.get(1)).toBe(3500);
  });

  it('counts loan/EMI payments as outflow', () => {
    const balances = computeDerivedBalances(
      [account(1, 5000)],
      [],
      [],
      [{ accountId: 1, amount: 2000 }],
    );
    expect(balances.get(1)).toBe(3000);
  });
});

describe('computeDerivedBalances — edit / delete behaviour', () => {
  it('removing a transaction from the ledger restores the balance', () => {
    const accounts = [account(1, 5000)];
    const withExpense = computeDerivedBalances(accounts, [tx('expense', 1000, 1)]);
    expect(withExpense.get(1)).toBe(4000);

    const afterDelete = computeDerivedBalances(accounts, []);
    expect(afterDelete.get(1)).toBe(5000);
  });

  it('editing a transaction amount reflects the new amount only', () => {
    const accounts = [account(1, 5000)];
    const edited = computeDerivedBalances(accounts, [tx('expense', 2500, 1)]);
    expect(edited.get(1)).toBe(2500);
  });
});

describe('computeDerivedBalances — legacy accounts', () => {
  it('preserves the stored balance when openingBalance is absent', () => {
    // No openingBalance recorded → back-derive so nothing is lost.
    const balances = computeDerivedBalances(
      [account(1, undefined, 1234.56)],
      [tx('expense', 100, 1)],
    );
    expect(balances.get(1)).toBe(1234.56);
  });
});

describe('getAccountBalanceSnapshot — Previous → Current card', () => {
  const dated = (
    type: 'income' | 'expense' | 'transfer',
    amount: number,
    accountId: number,
    date: string,
    extra: Record<string, unknown> = {},
  ) => tx(type, amount, accountId, { date, ...extra });

  it('spec example: last txn is a 5000 expense → previous 5000, current 0', () => {
    const snap = getAccountBalanceSnapshot({ id: 1, balance: 0 }, [
      dated('income', 5000, 1, '2026-01-01'),
      dated('expense', 5000, 1, '2026-01-10'),
    ]);
    expect(snap).toMatchObject({ previous: 5000, current: 0, lastDelta: -5000, hasActivity: true });
  });

  it('always reconciles: current === previous + lastDelta', () => {
    const snap = getAccountBalanceSnapshot({ id: 1, balance: 2500 }, [
      dated('expense', 2500, 1, '2026-02-02'),
    ]);
    expect(snap.previous + snap.lastDelta).toBe(snap.current);
    expect(snap.previous).toBe(5000); // current 2500 - (-2500)
  });

  it('uses the most recent transaction by date, not insertion order', () => {
    const snap = getAccountBalanceSnapshot({ id: 1, balance: 100 }, [
      dated('expense', 900, 1, '2026-03-20'), // most recent
      dated('income', 1000, 1, '2026-03-01'),
    ]);
    expect(snap.lastDelta).toBe(-900);
    expect(snap.previous).toBe(1000);
  });

  it('counts an incoming transfer as a positive delta for the destination', () => {
    const snap = getAccountBalanceSnapshot({ id: 2, balance: 2000 }, [
      dated('transfer', 2000, 1, '2026-04-01', { transferToAccountId: 2 }),
    ]);
    expect(snap.lastDelta).toBe(2000);
    expect(snap.previous).toBe(0);
  });

  it('reports no activity (previous === current) when there are no transactions', () => {
    const snap = getAccountBalanceSnapshot({ id: 1, balance: 5000 }, []);
    expect(snap).toMatchObject({ previous: 5000, current: 5000, hasActivity: false });
  });

  it('ignores soft-deleted transactions when picking the latest', () => {
    const snap = getAccountBalanceSnapshot({ id: 1, balance: 4000 }, [
      dated('expense', 1000, 1, '2026-05-10'),
      dated('expense', 9999, 1, '2026-05-20', { deletedAt: new Date() }),
    ]);
    expect(snap.lastDelta).toBe(-1000);
    expect(snap.previous).toBe(5000);
  });
});

describe('getTransactionAccountDeltas / computeAccountDeltas', () => {
  it('ignores soft-deleted and zero-amount transactions', () => {
    const deltas = computeAccountDeltas([
      tx('expense', 1000, 1, { deletedAt: new Date() }),
      tx('expense', 0, 1),
    ]);
    expect(deltas.get(1) ?? 0).toBe(0);
  });

  it('treats a borrowed-loan expense as an inflow to the account', () => {
    const deltas = getTransactionAccountDeltas(
      tx('expense', 5000, 1, { expenseMode: 'loan', loanType: 'borrowed' }),
    );
    expect(deltas.get(1)).toBe(5000);
  });
});
