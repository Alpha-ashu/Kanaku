import { db, type Transaction } from '@/lib/database';

type TransactionLike = Pick<
  Transaction,
  | 'type'
  | 'amount'
  | 'accountId'
  | 'category'
  | 'date'
  | 'deletedAt'
  | 'transferToAccountId'
  | 'expenseMode'
  | 'loanType'
  | 'subcategory'
>;

export interface TransactionAggregation {
  totalIncome: number;
  totalExpenses: number;
  totalLent: number;
  totalBorrowed: number;
  netFlow: number;
  categorySpend: Record<string, number>;
  accountDeltas: Map<number, number>;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function getTransactionAccountDeltas(transaction: TransactionLike): Map<number, number> {
  const deltas = new Map<number, number>();
  if (transaction.deletedAt || !transaction.accountId) return deltas;

  const amount = Math.abs(Number(transaction.amount) || 0);
  if (amount <= 0) return deltas;

  const addDelta = (accountId: number | undefined, delta: number) => {
    if (!accountId || delta === 0) return;
    deltas.set(accountId, roundMoney((deltas.get(accountId) ?? 0) + delta));
  };

  if (transaction.type === 'transfer') {
    addDelta(transaction.accountId, -amount);
    addDelta(transaction.transferToAccountId, amount);
    return deltas;
  }

  if (transaction.expenseMode === 'loan' && transaction.loanType === 'borrowed') {
    addDelta(transaction.accountId, amount);
    return deltas;
  }

  if (transaction.type === 'income') {
    addDelta(transaction.accountId, amount);
  } else {
    addDelta(transaction.accountId, -amount);
  }

  return deltas;
}

export function mergeAccountDeltas(...deltaSets: Array<Map<number, number>>): Map<number, number> {
  const merged = new Map<number, number>();

  for (const deltas of deltaSets) {
    for (const [accountId, delta] of deltas.entries()) {
      merged.set(accountId, roundMoney((merged.get(accountId) ?? 0) + delta));
    }
  }

  return merged;
}

type LedgerMovement = { accountId?: number | null; amount?: number | null; transactionId?: number | null };
type AccountLike = { id?: number; balance: number; openingBalance?: number | null };

/**
 * Canonical single-source-of-truth balance engine.
 *
 * Every account's current balance is DERIVED, never accumulated:
 *
 *   balance = openingBalance
 *           + income            (transaction deltas)
 *           + transfers in
 *           - expenses
 *           - transfers out
 *           - goal contributions   (cash that left the account into a goal)
 *           - loan / EMI payments  (cash that left the account to repay a loan)
 *
 * Because the result is recomputed from the ledger every time, it is
 * idempotent: it can never double-count a transaction no matter how many
 * times an incremental update path runs. `goalContributions` and
 * `loanPayments` are included because those money movements adjust the
 * account balance WITHOUT a corresponding `transactions` row — omitting
 * them (as the previous transaction-only rebuild did) silently dropped
 * that spend from the balance.
 *
 * When an account has no `openingBalance` recorded (legacy rows), we
 * back-derive it from the stored balance so the derived value equals the
 * stored value and nothing is lost.
 */
export function computeAccountDeltas(
  transactions: TransactionLike[],
  goalContributions: LedgerMovement[] = [],
  loanPayments: LedgerMovement[] = [],
): Map<number, number> {
  const deltas = new Map<number, number>();
  const addDelta = (accountId: number | null | undefined, delta: number) => {
    if (!accountId || delta === 0) return;
    deltas.set(accountId, roundMoney((deltas.get(accountId) ?? 0) + delta));
  };

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    for (const [accountId, delta] of getTransactionAccountDeltas(transaction).entries()) {
      addDelta(accountId, delta);
    }
  }

  for (const contribution of goalContributions) {
    // Skip contributions that already have their own cash transaction — that
    // transaction is counted above, so counting the contribution too would
    // double-deduct the same spend.
    if (contribution.transactionId != null) continue;
    addDelta(contribution.accountId, -Math.abs(Number(contribution.amount) || 0));
  }

  for (const payment of loanPayments) {
    addDelta(payment.accountId, -Math.abs(Number(payment.amount) || 0));
  }

  return deltas;
}

export function computeDerivedBalances(
  accounts: AccountLike[],
  transactions: TransactionLike[],
  goalContributions: LedgerMovement[] = [],
  loanPayments: LedgerMovement[] = [],
): Map<number, number> {
  const deltas = computeAccountDeltas(transactions, goalContributions, loanPayments);
  const balances = new Map<number, number>();

  for (const account of accounts) {
    if (!account.id) continue;
    const delta = deltas.get(account.id) ?? 0;
    const opening = account.openingBalance != null
      ? Number(account.openingBalance)
      : roundMoney(Number(account.balance || 0) - delta);
    balances.set(account.id, roundMoney(opening + delta));
  }

  return balances;
}

export async function applyAccountBalanceDeltas(
  deltas: Map<number, number>,
  updatedAt = new Date(),
): Promise<void> {
  await db.transaction('rw', db.accounts, async () => {
    for (const [accountId, delta] of deltas.entries()) {
      if (!delta) continue;
      const account = await db.accounts.get(accountId);
      if (!account?.id) continue;

      await db.accounts.update(account.id, {
        balance: roundMoney(Number(account.balance || 0) + delta),
        updatedAt,
      });
    }
  });
}

export async function applyTransactionAccountImpact(
  transaction: TransactionLike,
  updatedAt = new Date(),
): Promise<void> {
  await applyAccountBalanceDeltas(getTransactionAccountDeltas(transaction), updatedAt);
}

/**
 * Sum of every ledger movement (transactions incl. transfers in/out, goal
 * contributions and loan payments) that affects a single account.
 */
export async function getAccountLedgerDelta(accountId: number): Promise<number> {
  const [transactions, goalContributions, loanPayments] = await Promise.all([
    db.transactions
      .filter((t) => !t.deletedAt && (t.accountId === accountId || t.transferToAccountId === accountId))
      .toArray(),
    db.goalContributions.where('accountId').equals(accountId).toArray(),
    db.loanPayments.where('accountId').equals(accountId).toArray(),
  ]);
  return computeAccountDeltas(transactions, goalContributions, loanPayments).get(accountId) ?? 0;
}

/**
 * Anchor an account to an ABSOLUTE target balance under the derived model.
 *
 * Because the displayed balance is always `openingBalance + ledger deltas`,
 * any flow that knows the true current balance (a statement snapshot, or a
 * user typing a "Current Balance") must record it by adjusting the opening
 * balance — otherwise the derived engine would immediately recompute over it.
 * This sets `openingBalance = target - ledgerDelta` so the derived balance
 * resolves exactly to `target`, and writes the resolved balance too.
 */
export async function setAccountTargetBalance(
  accountId: number,
  targetBalance: number,
  extraUpdates: Record<string, unknown> = {},
): Promise<void> {
  const delta = await getAccountLedgerDelta(accountId);
  const openingBalance = roundMoney(targetBalance - delta);
  await db.accounts.update(accountId, {
    openingBalance,
    balance: roundMoney(openingBalance + delta),
    updatedAt: new Date(),
    ...extraUpdates,
  });
}

/**
 * Rebuilds every account's balance from scratch using the canonical engine
 * (openingBalance + all non-deleted ledger deltas across transactions, goal
 * contributions and loan payments). Idempotent — call it after deduplication
 * or any bulk mutation to correct any double-applied or dropped impacts.
 */
export async function rebuildAccountBalances(): Promise<void> {
  const accounts = await db.accounts.filter((a) => !a.deletedAt).toArray();
  if (accounts.length === 0) return;

  const [transactions, goalContributions, loanPayments] = await Promise.all([
    db.transactions.filter((t) => !t.deletedAt).toArray(),
    db.goalContributions.toArray(),
    db.loanPayments.toArray(),
  ]);

  const balances = computeDerivedBalances(accounts, transactions, goalContributions, loanPayments);

  const now = new Date();
  await db.transaction('rw', db.accounts, async () => {
    for (const account of accounts) {
      if (!account.id) continue;
      const computed = balances.get(account.id);
      if (computed == null) continue;
      if (computed !== account.balance) {
        await db.accounts.update(account.id, { balance: computed, updatedAt: now });
      }
    }
  });
}

export function buildTransactionAggregation(transactions: TransactionLike[]): TransactionAggregation {
  const summary: TransactionAggregation = {
    totalIncome: 0,
    totalExpenses: 0,
    totalLent: 0,
    totalBorrowed: 0,
    netFlow: 0,
    categorySpend: {},
    accountDeltas: new Map<number, number>(),
  };

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    const amount = Math.abs(Number(transaction.amount) || 0);
    if (amount <= 0) continue;

    if (transaction.type === 'income') {
      summary.totalIncome = roundMoney(summary.totalIncome + amount);
    } else if (transaction.type === 'expense') {
      summary.totalExpenses = roundMoney(summary.totalExpenses + amount);
      const category = transaction.category || 'Uncategorized';
      summary.categorySpend[category] = roundMoney((summary.categorySpend[category] ?? 0) + amount);
    }

    if (
      transaction.loanType === 'lent'
      || /loan disbursed|lent/i.test(transaction.subcategory || '')
    ) {
      summary.totalLent = roundMoney(summary.totalLent + amount);
    }

    if (
      transaction.loanType === 'borrowed'
      || /loan received|borrowed/i.test(transaction.subcategory || '')
    ) {
      summary.totalBorrowed = roundMoney(summary.totalBorrowed + amount);
    }

    summary.accountDeltas = mergeAccountDeltas(
      summary.accountDeltas,
      getTransactionAccountDeltas(transaction),
    );
  }

  summary.netFlow = roundMoney(summary.totalIncome - summary.totalExpenses);
  return summary;
}
