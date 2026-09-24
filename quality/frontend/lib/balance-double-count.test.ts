/**
 * One movement of money must change an account balance exactly once.
 *
 * The balance is DERIVED, never accumulated:
 *   balance = openingBalance + transaction deltas + contributions + repayments
 *
 * That is safe only while each real-world movement appears in exactly one of
 * those inputs. It did not. `POST /goals/:id/contribute` and `/withdraw` each
 * write their own side-effect `Transaction` server-side (`goal.controller.ts`),
 * which syncs into `db.transactions` — while the client also kept a
 * `goalContributions` row for the same movement. Both were counted, so every
 * contribution made while online deducted twice.
 *
 * It went unnoticed because the Goals page does not pull transactions: the
 * second deduction only appeared once the user navigated somewhere that does.
 *
 * `serverAccounted` records which side owns the movement. These tests pin that,
 * and pin that an OFFLINE contribution — which has no server transaction behind
 * it — is still counted locally.
 */
import { describe, it, expect } from 'vitest';
import { computeAccountDeltas, computeDerivedBalances } from '@/lib/transactionAggregation';

const ACCOUNT = 1;
const account = { id: ACCOUNT, balance: 0, openingBalance: 10_000 };

/** The row the server writes for a contribution, as it arrives via sync. */
const savingsGoalTransaction = {
  id: 90,
  accountId: ACCOUNT,
  type: 'expense',
  amount: 2_000,
  category: 'Savings Goal',
  description: 'Contribution to Emergency Fund',
  date: new Date('2026-09-20'),
};

describe('goal contribution — online (server wrote its own transaction)', () => {
  it('deducts once, not twice', () => {
    const balances = computeDerivedBalances(
      [account],
      [savingsGoalTransaction],
      [{ accountId: ACCOUNT, amount: 2_000, serverAccounted: true }],
      [],
    );

    // 10,000 − 2,000. The pre-fix engine returned 6,000.
    expect(balances.get(ACCOUNT)).toBe(8_000);
  });

  it('counts the transaction, not the contribution row', () => {
    const withRow = computeAccountDeltas(
      [savingsGoalTransaction],
      [{ accountId: ACCOUNT, amount: 2_000, serverAccounted: true }],
      [],
    );
    const withoutRow = computeAccountDeltas([savingsGoalTransaction], [], []);

    expect(withRow.get(ACCOUNT)).toBe(withoutRow.get(ACCOUNT));
  });

  it('applies the same rule to a withdrawal', () => {
    const incomeTransaction = { ...savingsGoalTransaction, type: 'income', amount: 2_000 };
    const balances = computeDerivedBalances(
      [account],
      [incomeTransaction],
      // Withdrawals are stored as a negative contribution.
      [{ accountId: ACCOUNT, amount: -2_000, serverAccounted: true }],
      [],
    );

    expect(balances.get(ACCOUNT)).toBe(12_000);
  });
});

describe('goal contribution — offline (no server transaction exists)', () => {
  it('is still counted, or the money would never leave the account', () => {
    const balances = computeDerivedBalances(
      [account],
      [], // the push failed, so no side-effect transaction was created
      [{ accountId: ACCOUNT, amount: 2_000, serverAccounted: false }],
      [],
    );

    expect(balances.get(ACCOUNT)).toBe(8_000);
  });

  it('treats a missing flag as "count it" — legacy rows predate the field', () => {
    const balances = computeDerivedBalances(
      [account],
      [],
      [{ accountId: ACCOUNT, amount: 2_000 }],
      [],
    );

    expect(balances.get(ACCOUNT)).toBe(8_000);
  });
});

describe('explicit transactionId still wins', () => {
  it('skips a contribution already linked to its own cash transaction', () => {
    const balances = computeDerivedBalances(
      [account],
      [savingsGoalTransaction],
      [{ accountId: ACCOUNT, amount: 2_000, transactionId: 90 }],
      [],
    );

    expect(balances.get(ACCOUNT)).toBe(8_000);
  });
});

describe('loan repayments', () => {
  it('are counted — nothing on the server duplicates them today', () => {
    // Unlike contributions, `POST /loans/:id/payment` creates no side-effect
    // transaction unless Ledger V2 is enabled (it is not), so the repayment row
    // is the only record of the cash leaving the account.
    const balances = computeDerivedBalances(
      [account],
      [],
      [],
      [{ accountId: ACCOUNT, amount: 1_500 }],
    );

    expect(balances.get(ACCOUNT)).toBe(8_500);
  });

  it('do not double-count when the same payment is hydrated twice', () => {
    // `mergeLoanPaymentsFromBackend` is idempotent by cloudId; this asserts the
    // arithmetic assumption behind it — two rows mean two payments, so the merge
    // must never insert the same server payment twice.
    const once = computeAccountDeltas([], [], [{ accountId: ACCOUNT, amount: 1_500 }]);
    const twice = computeAccountDeltas([], [], [
      { accountId: ACCOUNT, amount: 1_500 },
      { accountId: ACCOUNT, amount: 1_500 },
    ]);

    expect(once.get(ACCOUNT)).toBe(-1_500);
    expect(twice.get(ACCOUNT)).toBe(-3_000);
  });
});
