/**
 * BALANCE ENGINE - Unit tests for the per-transaction balance delta logic.
 *
 * These assert the invariant behind the reported bug: an expense is deducted
 * EXACTLY ONCE, income added exactly once, and transfers move money out of the
 * source and into the destination. Balance = openingBalance + Σ(these deltas),
 * so verifying the deltas verifies the formula:
 *
 *   Current Balance = Opening + Income + TransfersIn - Expenses - TransfersOut
 *
 * The heavy IO dependencies (redis, prisma repositories, event bus) are mocked
 * so this runs as a pure unit test without a database.
 */

jest.mock('../../../../backend/src/cache/redis', () => ({ cacheDeleteByPrefix: jest.fn() }));
jest.mock('../../../../backend/src/features/transactions/transaction.repository', () => ({
  transactionRepository: {},
}));
jest.mock('../../../../backend/src/features/accounts/account.repository', () => ({
  accountRepository: {},
}));
jest.mock('../../../../backend/src/utils/eventBus', () => ({ eventBus: { emit: jest.fn() } }));

import { transactionService } from '../../../../backend/src/features/transactions/transaction.service';
import { isOverdraw } from '../../../../backend/src/utils/money';

// getBalanceImpactDeltas is private; access it directly for unit testing.
const deltasFor = (tx: Record<string, unknown>): Map<string, number> => {
  const raw: Map<string, any> = (transactionService as any).getBalanceImpactDeltas(tx);
  const out = new Map<string, number>();
  for (const [accountId, delta] of raw.entries()) {
    out.set(accountId, Number(delta.toString()));
  }
  return out;
};

// Apply a list of transactions to an opening balance, mirroring how the
// repository increments account.balance by each delta exactly once.
const balanceAfter = (accountId: string, opening: number, txns: Record<string, unknown>[]) => {
  let balance = opening;
  for (const tx of txns) {
    balance += deltasFor(tx).get(accountId) ?? 0;
  }
  return balance;
};

describe('BALANCE ENGINE - getBalanceImpactDeltas', () => {
  it('deducts an expense exactly once (no double subtraction)', () => {
    const deltas = deltasFor({ type: 'expense', amount: 600, accountId: 'A' });
    expect(deltas.get('A')).toBe(-600);
    expect(deltas.size).toBe(1);
  });

  it('adds income exactly once', () => {
    const deltas = deltasFor({ type: 'income', amount: 5000, accountId: 'A' });
    expect(deltas.get('A')).toBe(5000);
  });

  it('moves a transfer out of source and into destination', () => {
    const deltas = deltasFor({
      type: 'transfer',
      amount: 2000,
      accountId: 'A',
      transferToAccountId: 'B',
    });
    expect(deltas.get('A')).toBe(-2000);
    expect(deltas.get('B')).toBe(2000);
  });

  it('ignores non-positive amounts', () => {
    expect(deltasFor({ type: 'expense', amount: 0, accountId: 'A' }).size).toBe(0);
    expect(deltasFor({ type: 'expense', amount: -10, accountId: 'A' }).size).toBe(0);
  });
});

describe('BALANCE ENGINE - spec scenarios (opening + Σ deltas)', () => {
  it('Scenario 1: opening 5000, expense 5000 -> 0', () => {
    expect(balanceAfter('A', 5000, [{ type: 'expense', amount: 5000, accountId: 'A' }])).toBe(0);
  });

  it('Scenario 2: opening 5000, expense 2000 -> 3000', () => {
    expect(balanceAfter('A', 5000, [{ type: 'expense', amount: 2000, accountId: 'A' }])).toBe(3000);
  });

  it('Scenario 3: opening 5000, expense 6000 -> -1000 (overspend only)', () => {
    expect(balanceAfter('A', 5000, [{ type: 'expense', amount: 6000, accountId: 'A' }])).toBe(-1000);
  });

  it('income then equal expense nets to opening', () => {
    expect(
      balanceAfter('A', 0, [
        { type: 'income', amount: 5000, accountId: 'A' },
        { type: 'expense', amount: 5000, accountId: 'A' },
      ]),
    ).toBe(0);
  });

  it('many small expenses are each counted once', () => {
    const txns = Array.from({ length: 10 }, () => ({ type: 'expense', amount: 100, accountId: 'A' }));
    expect(balanceAfter('A', 5000, txns)).toBe(4000);
  });
});

describe('NO-OVERDRAW RULE - isOverdraw', () => {
  // balanceAfter applies the delta; an expense of `amt` on balance `bal` ends at
  // bal-amt with delta -amt. This is exactly what the repository checks.
  const expenseDecision = (bal: number, amt: number, type = 'bank') =>
    isOverdraw(bal - amt, -amt, type);

  it('rejects an expense that exceeds the available balance', () => {
    // Opening 200, expense 60 -> 140 available; new expense 150 -> would be -10.
    expect(expenseDecision(140, 150)).toBe(true);
  });

  it('allows an expense equal to the available balance (ends exactly at 0)', () => {
    expect(expenseDecision(10, 10)).toBe(false);
  });

  it('allows an expense within the available balance', () => {
    expect(expenseDecision(140, 60)).toBe(false);
  });

  it('never blocks income / credits (positive delta)', () => {
    expect(isOverdraw(250, 100, 'bank')).toBe(false); // income raises balance
    expect(isOverdraw(-10, 100, 'bank')).toBe(false); // a credit paying down a negative
  });

  it('blocks a further debit on an already-negative account', () => {
    expect(expenseDecision(-10, 20)).toBe(true); // -10 -> -30
  });

  it('exempts credit / overdraft / loan account types', () => {
    expect(expenseDecision(140, 150, 'credit')).toBe(false);
    expect(expenseDecision(140, 150, 'overdraft')).toBe(false);
    expect(expenseDecision(140, 150, 'loan')).toBe(false);
  });

  it('reproduces the reported bug as an overdraw: opening 200, -60, then -150', () => {
    const afterFirst = balanceAfter('A', 200, [{ type: 'expense', amount: 60, accountId: 'A' }]);
    expect(afterFirst).toBe(140);
    // The second expense (150) would drive the balance to -10 — now rejected.
    expect(isOverdraw(afterFirst - 150, -150, 'bank')).toBe(true);
  });
});
