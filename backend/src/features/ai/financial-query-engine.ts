/**
 * Financial Query Engine
 *
 * Maps structured query intents from the conversational AI layer to controlled
 * Prisma queries. All public methods enforce userId isolation and return compact,
 * LLM-safe summaries — never raw DB row dumps.
 *
 * Supported intents:
 *   SUM_EXPENSES          – aggregate spend by category / date range
 *   DATE_RANGE_SUMMARY    – top categories within a period
 *   MERCHANT_LOOKUP       – transactions matching a keyword
 *   PERSON_BALANCE        – outstanding loan balance for a named person
 *   ACCOUNT_BALANCE       – balances across accounts
 *   RECENT_TRANSACTIONS   – last N transactions (capped at 20)
 *   CATEGORY_USAGE        – user's historically most-used categories
 */

import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { buildFinancialSnapshot } from './financial-snapshot';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type QueryIntent =
  | 'SUM_EXPENSES'
  | 'DATE_RANGE_SUMMARY'
  | 'MERCHANT_LOOKUP'
  | 'PERSON_BALANCE'
  | 'ACCOUNT_BALANCE'
  | 'RECENT_TRANSACTIONS'
  | 'CATEGORY_USAGE'
  | 'INCOME_SUMMARY'
  | 'GOALS_PROGRESS'
  | 'LOANS_SUMMARY'
  | 'INVESTMENT_SUMMARY'
  | 'BUDGET_STATUS'
  | 'UPCOMING_RECURRING';

export interface QueryParams {
  intent: QueryIntent;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  person?: string;
  keyword?: string;
  limit?: number;
}

export interface TransactionSummaryRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  type: string;
}

export interface QueryResult {
  summary: string;
  transactions?: TransactionSummaryRow[];
  meta?: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INR = (n: number) =>
  `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function toRow(t: any): TransactionSummaryRow {
  return {
    id: t.id,
    date: t.date instanceof Date
      ? t.date.toISOString().slice(0, 10)
      : String(t.date).slice(0, 10),
    description: t.description ?? '',
    amount: Number(t.amount ?? 0),
    category: t.category ?? 'General',
    type: t.type ?? 'expense',
  };
}

function currentPeriodBounds(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { startDate, endDate };
}

// ─── Query Handlers ───────────────────────────────────────────────────────────

async function sumExpenses(userId: string, params: QueryParams): Promise<QueryResult> {
  const { startDate, endDate, category } = params;
  const { startDate: defaultStart, endDate: defaultEnd } = currentPeriodBounds();

  const whereClause: any = {
    userId,
    deletedAt: null,
    type: 'expense',
    date: {
      gte: startDate ?? defaultStart,
      lte: endDate ?? defaultEnd,
    },
  };

  if (category) {
    whereClause.category = { equals: category, mode: 'insensitive' };
  }

  const [rows, aggregate] = await Promise.all([
    prisma.transaction.findMany({
      where: whereClause,
      orderBy: { date: 'desc' },
      take: 10,
      select: { id: true, date: true, description: true, amount: true, category: true, type: true },
    }),
    prisma.transaction.aggregate({
      where: whereClause,
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const total = Number(aggregate._sum.amount ?? 0);
  const count = aggregate._count.id;
  const catLabel = category ? ` on ${category}` : '';
  const period = startDate
    ? `${startDate.toDateString()} – ${(endDate ?? defaultEnd).toDateString()}`
    : 'this month';

  return {
    summary: `You spent ${INR(total)}${catLabel} ${period} across ${count} transaction${count !== 1 ? 's' : ''}.`,
    transactions: rows.map(toRow),
    meta: { total, count, category, period },
  };
}

async function dateRangeSummary(userId: string, params: QueryParams): Promise<QueryResult> {
  const { startDate, endDate } = params;
  const { startDate: defaultStart, endDate: defaultEnd } = currentPeriodBounds();

  const rows = await prisma.transaction.groupBy({
    by: ['category'],
    where: {
      userId,
      deletedAt: null,
      type: 'expense',
      date: {
        gte: startDate ?? defaultStart,
        lte: endDate ?? defaultEnd,
      },
    },
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: 6,
  });

  if (rows.length === 0) {
    return { summary: 'No expense transactions found for that period.', meta: {} };
  }

  const lines = rows.map(
    r => `${r.category}: ${INR(Number(r._sum.amount ?? 0))} (${r._count.id} txns)`,
  );
  const grandTotal = rows.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
  const period = startDate
    ? `${startDate.toDateString()} – ${(endDate ?? defaultEnd).toDateString()}`
    : 'this month';

  return {
    summary: `Your top spending categories ${period}:\n${lines.join('\n')}\n\nTotal: ${INR(grandTotal)}`,
    meta: {
      categories: rows.map(r => ({
        category: r.category,
        amount: Number(r._sum.amount ?? 0),
      })),
    },
  };
}

async function merchantLookup(userId: string, params: QueryParams): Promise<QueryResult> {
  const keyword = (params.keyword ?? '').trim();
  if (!keyword) return { summary: 'Please specify a merchant or description keyword.' };

  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      description: { contains: keyword, mode: 'insensitive' },
    },
    orderBy: { date: 'desc' },
    take: 10,
    select: { id: true, date: true, description: true, amount: true, category: true, type: true },
  });

  if (rows.length === 0) {
    return { summary: `No transactions found matching "${keyword}".` };
  }

  const total = rows.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  return {
    summary: `Found ${rows.length} transaction${rows.length !== 1 ? 's' : ''} matching "${keyword}" totalling ${INR(total)}.`,
    transactions: rows.map(toRow),
    meta: { keyword, total, count: rows.length },
  };
}

async function personBalance(userId: string, params: QueryParams): Promise<QueryResult> {
  const name = (params.person ?? '').trim();
  if (!name) return { summary: "Please specify a person's name." };

  const loans = await prisma.loan.findMany({
    where: {
      userId,
      contactPerson: { contains: name, mode: 'insensitive' },
      status: 'active',
    },
    select: {
      id: true,
      type: true,
      contactPerson: true,
      originalAmount: true,
      outstandingBalance: true,
      description: true,
    },
  });

  if (loans.length === 0) {
    return { summary: `No active loans found for "${name}".` };
  }

  let netBalance = 0;
  const lines: string[] = [];
  for (const loan of loans) {
    const outstanding = Number(loan.outstandingBalance ?? loan.originalAmount ?? 0);
    if (loan.type === 'lent') {
      netBalance += outstanding;
      lines.push(
        `${loan.contactPerson} owes you ${INR(outstanding)}${loan.description ? ` (${loan.description})` : ''}`,
      );
    } else {
      netBalance -= outstanding;
      lines.push(
        `You owe ${loan.contactPerson} ${INR(outstanding)}${loan.description ? ` (${loan.description})` : ''}`,
      );
    }
  }

  const net =
    netBalance >= 0
      ? `Net: ${name} owes you ${INR(netBalance)}`
      : `Net: You owe ${name} ${INR(Math.abs(netBalance))}`;

  return {
    summary: `${lines.join('\n')}\n${net}`,
    meta: { person: name, netBalance, loans: loans.length },
  };
}

async function accountBalance(userId: string): Promise<QueryResult> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true, name: true, balance: true, type: true },
    orderBy: { balance: 'desc' },
  });

  if (accounts.length === 0) {
    return { summary: 'No accounts found. Please add an account first.' };
  }

  const total = accounts.reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const lines = accounts.map(a => `${a.name} (${a.type}): ${INR(Number(a.balance ?? 0))}`);

  return {
    summary: `Your account balances:\n${lines.join('\n')}\n\nTotal: ${INR(total)}`,
    meta: {
      total,
      accounts: accounts.map(a => ({ name: a.name, balance: Number(a.balance ?? 0) })),
    },
  };
}

async function recentTransactions(userId: string, params: QueryParams): Promise<QueryResult> {
  const limit = Math.min(params.limit ?? 5, 20);

  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      category: { not: 'Personal Share Offset' },
    },
    orderBy: { date: 'desc' },
    take: limit,
    select: { id: true, date: true, description: true, amount: true, category: true, type: true },
  });

  if (rows.length === 0) {
    return { summary: 'No transactions recorded yet.' };
  }

  const lines = rows.map(t =>
    `${String(t.date).slice(0, 10)} | ${t.description ?? t.category} | ${INR(Number(t.amount ?? 0))} | ${t.type}`,
  );

  return {
    summary: `Your last ${rows.length} transaction${rows.length !== 1 ? 's' : ''}:\n${lines.join('\n')}`,
    transactions: rows.map(toRow),
    meta: { count: rows.length },
  };
}

async function categoryUsage(userId: string): Promise<QueryResult> {
  const rows = await prisma.transaction.groupBy({
    by: ['category'],
    where: { userId, deletedAt: null, type: 'expense' },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 8,
  });

  const categories = rows.map(r => r.category).filter(Boolean);
  return {
    summary: `Your most-used categories: ${categories.join(', ')}.`,
    meta: { categories },
  };
}

// ─── Snapshot-backed summaries ───────────────────────────────────────────────
// Goals, loans, investments, budgets and upcoming recurring items are read
// through the shared snapshot so the chat's "overview" and these targeted
// answers can never disagree about the same numbers.

async function incomeSummary(userId: string, params: QueryParams): Promise<QueryResult> {
  const { startDate, endDate } = params;
  const { startDate: defaultStart, endDate: defaultEnd } = currentPeriodBounds();
  const where = { userId, deletedAt: null, type: 'income', date: { gte: startDate ?? defaultStart, lte: endDate ?? defaultEnd } };

  const [rows, aggregate] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 10,
      select: { id: true, date: true, description: true, amount: true, category: true, type: true },
    }),
    prisma.transaction.aggregate({ where, _sum: { amount: true }, _count: { id: true } }),
  ]);

  const total = Number(aggregate._sum.amount ?? 0);
  const period = startDate ? `${startDate.toDateString()} – ${(endDate ?? defaultEnd).toDateString()}` : 'this month';
  if (aggregate._count.id === 0) {
    return { summary: `No income recorded ${period}. Tell me "got salary ₹50,000" and I'll add it.` };
  }
  return {
    summary: `You received ${INR(total)} ${period} across ${aggregate._count.id} credit${aggregate._count.id !== 1 ? 's' : ''}.`,
    transactions: rows.map(toRow),
    meta: { total, count: aggregate._count.id, period },
  };
}

async function goalsProgress(userId: string): Promise<QueryResult> {
  const { goals } = await buildFinancialSnapshot(userId);
  if (goals.count === 0) {
    return { summary: 'You have no goals yet. Say "create a goal Emergency fund ₹1,00,000 by March" and I\'ll set one up.' };
  }
  const lines = goals.items.map((g) =>
    `• ${g.name}: ${INR(g.saved)} of ${INR(g.target)} (${g.pct}%)${g.targetDate ? ` — target ${g.targetDate}` : ''}`);
  return {
    summary: `Goals — ${INR(goals.totalSaved)} saved of ${INR(goals.totalTarget)} (${goals.progressPct ?? 0}%):\n${lines.join('\n')}`,
    meta: { goals: goals.items },
  };
}

async function loansSummary(userId: string): Promise<QueryResult> {
  const { loans } = await buildFinancialSnapshot(userId);
  if (loans.items.length === 0) return { summary: 'No active loans — nobody owes you and you owe nobody.' };
  const owedToYou = loans.items.filter((l) => l.type === 'lent');
  const youOwe = loans.items.filter((l) => l.type === 'borrowed');
  const parts: string[] = [];
  if (owedToYou.length) {
    parts.push(`People owe you ${INR(loans.lentOutstanding)}:\n${owedToYou.map((l) => `• ${l.person}: ${INR(l.outstanding)}`).join('\n')}`);
  }
  if (youOwe.length) {
    parts.push(`You owe ${INR(loans.borrowedOutstanding)}:\n${youOwe.map((l) => `• ${l.person}: ${INR(l.outstanding)}${l.emi ? ` (EMI ${INR(l.emi)})` : ''}${l.dueDate ? `, due ${l.dueDate}` : ''}`).join('\n')}`);
  }
  return { summary: parts.join('\n\n'), meta: { lent: loans.lentOutstanding, borrowed: loans.borrowedOutstanding } };
}

async function investmentSummary(userId: string): Promise<QueryResult> {
  const { investments } = await buildFinancialSnapshot(userId);
  if (investments.count === 0) return { summary: 'No investments recorded yet. Say "invested ₹10,000 in SIP" to add one.' };
  const direction = investments.profitLoss >= 0 ? 'up' : 'down';
  const byType = investments.byType.map((t) => `• ${t.assetType.replace('_', ' ')}: ${INR(t.value)}`).join('\n');
  return {
    summary: `Portfolio worth ${INR(investments.currentValue)} on ${INR(investments.invested)} invested — ${direction} ${INR(Math.abs(investments.profitLoss))} across ${investments.count} holding${investments.count !== 1 ? 's' : ''}.\n${byType}`,
    meta: { ...investments },
  };
}

async function budgetStatus(userId: string): Promise<QueryResult> {
  const { budgets } = await buildFinancialSnapshot(userId);
  if (budgets.items.length === 0) return { summary: 'No budgets set. Say "set a food budget of ₹8,000" and I\'ll create one with alerts.' };
  const lines = budgets.items.map((b) => {
    const flag = b.status === 'exceeded' ? ' — over limit' : b.status === 'warning' ? ' — near limit' : '';
    return `• ${b.category}: ${INR(b.spent)} of ${INR(b.limit)} (${b.pct}%)${flag}`;
  });
  const head = budgets.breached > 0
    ? `${budgets.breached} of ${budgets.items.length} budgets need attention:`
    : `All ${budgets.items.length} budgets are within limits:`;
  return { summary: `${head}\n${lines.join('\n')}`, meta: { budgets: budgets.items } };
}

async function upcomingRecurring(userId: string): Promise<QueryResult> {
  const { upcoming } = await buildFinancialSnapshot(userId);
  if (upcoming.length === 0) return { summary: 'Nothing recurring is due in the next two weeks.' };
  const total = upcoming.reduce((s, u) => s + u.amount, 0);
  const lines = upcoming.map((u) => `• ${u.title}: ${INR(u.amount)} on ${u.dueDate}`);
  return { summary: `Due in the next 14 days (${INR(total)} total):\n${lines.join('\n')}`, meta: { upcoming } };
}

// ─── Public Entry Point ───────────────────────────────────────────────────────

export async function executeFinancialQuery(
  userId: string,
  params: QueryParams,
): Promise<QueryResult> {
  try {
    switch (params.intent) {
      case 'SUM_EXPENSES':        return await sumExpenses(userId, params);
      case 'DATE_RANGE_SUMMARY':  return await dateRangeSummary(userId, params);
      case 'MERCHANT_LOOKUP':     return await merchantLookup(userId, params);
      case 'PERSON_BALANCE':      return await personBalance(userId, params);
      case 'ACCOUNT_BALANCE':     return await accountBalance(userId);
      case 'RECENT_TRANSACTIONS': return await recentTransactions(userId, params);
      case 'CATEGORY_USAGE':      return await categoryUsage(userId);
      case 'INCOME_SUMMARY':      return await incomeSummary(userId, params);
      case 'GOALS_PROGRESS':      return await goalsProgress(userId);
      case 'LOANS_SUMMARY':       return await loansSummary(userId);
      case 'INVESTMENT_SUMMARY':  return await investmentSummary(userId);
      case 'BUDGET_STATUS':       return await budgetStatus(userId);
      case 'UPCOMING_RECURRING':  return await upcomingRecurring(userId);
      default:
        return { summary: 'Unsupported query type.' };
    }
  } catch (err) {
    logger.error('FinancialQueryEngine error', { intent: params.intent, userId, err });
    return { summary: 'I encountered an error looking up your data. Please try again.' };
  }
}
