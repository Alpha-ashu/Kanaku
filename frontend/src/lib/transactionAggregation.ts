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
