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
 *   BUDGET_STATUS         – budgets (optionally one category) over their own period window
 *   EXPENSE_REPORT        – period total + full category breakdown (for report cards)
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
  | 'UPCOMING_RECURRING'
  | 'EXPENSE_REPORT';

export const QUERY_TYPES: QueryIntent[] = [
  'SUM_EXPENSES', 'DATE_RANGE_SUMMARY', 'MERCHANT_LOOKUP', 'PERSON_BALANCE', 'ACCOUNT_BALANCE',
  'RECENT_TRANSACTIONS', 'CATEGORY_USAGE', 'INCOME_SUMMARY', 'GOALS_PROGRESS', 'LOANS_SUMMARY',
  'INVESTMENT_SUMMARY', 'BUDGET_STATUS', 'UPCOMING_RECURRING', 'EXPENSE_REPORT',
];

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

interface TransactionRowSource {
  id: string;
  date: Date | string;
  description?: string | null;
  amount?: unknown;
  category?: string | null;
  type?: string | null;
}

function toRow(t: TransactionRowSource): TransactionSummaryRow {
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

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

/** "today" / "yesterday" / "tomorrow" / ISO date → YYYY-MM-DD, else undefined. */
export function normaliseDateInput(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().toLowerCase();
  if (t === 'today') return TODAY_ISO();
  if (t === 'yesterday' || t === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + (t === 'tomorrow' ? 1 : -1));
    return d.toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(t).getTime()) ? t : undefined;
}

export interface RawQueryFields {
  queryType?: string | null;
  category?: string | null;
  person?: string | null;
  keyword?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number | null;
}

const cleanText = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, 120) : undefined;
};

/** Turn loosely-typed LLM/regex output into validated QueryParams. */
export function toQueryParams(raw: RawQueryFields): QueryParams {
  const requested = String(raw.queryType ?? 'SUM_EXPENSES').toUpperCase() as QueryIntent;
  const intent: QueryIntent = QUERY_TYPES.includes(requested) ? requested : 'SUM_EXPENSES';
  const params: QueryParams = {
    intent,
    category: cleanText(raw.category),
    person: cleanText(raw.person),
    keyword: cleanText(raw.keyword),
    limit: typeof raw.limit === 'number' && Number.isFinite(raw.limit) ? raw.limit : undefined,
  };
  const start = normaliseDateInput(raw.startDate);
  const end = normaliseDateInput(raw.endDate);
  if (start) params.startDate = new Date(start);
  if (end) params.endDate = new Date(`${end}T23:59:59`);
  return params;
}

function periodLabel(start: Date, end: Date): string {
  const wholeMonth =
    start.getDate() === 1 &&
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear() &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  if (wholeMonth) return start.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const now = new Date();
  const monthToDate = start.getDate() === 1 && start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear()
    && end.getTime() >= now.getTime() - 2 * 24 * 60 * 60 * 1000;
  if (monthToDate) return `${start.toLocaleString('en-IN', { month: 'long', year: 'numeric' })} so far`;
  const short = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return `${short(start, start.getFullYear() !== end.getFullYear())} – ${short(end, true)}`;
}

/**
 * The period as it reads inside a sentence: "this month", "in August 2026",
 * "between 3 Aug and 16 Sep 2026". The model usually sends explicit dates even
 * for "this month", which used to surface as "Tue Sep 01 2026 – Wed Sep 16 2026".
 */
function spokenPeriod(startDate: Date | undefined, endDate: Date | undefined, defaultEnd: Date): string {
  if (!startDate) return 'this month';
  const end = endDate ?? defaultEnd;
  const now = new Date();
  const sameMonth = startDate.getMonth() === end.getMonth() && startDate.getFullYear() === end.getFullYear();
  const startsMonth = startDate.getDate() === 1;
  const endsMonth = end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  const currentMonth = sameMonth && startDate.getMonth() === now.getMonth() && startDate.getFullYear() === now.getFullYear();
  if (startsMonth && currentMonth && (endsMonth || end.getTime() >= now.getTime() - 2 * 24 * 60 * 60 * 1000)) return 'this month';
  if (startsMonth && sameMonth && endsMonth) return `in ${startDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`;
  const short = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return `between ${short(startDate, startDate.getFullYear() !== end.getFullYear())} and ${short(end, true)}`;
}

// ─── Query Handlers ───────────────────────────────────────────────────────────

/**
 * Transactions in a spoken/canonical category. The assistant names categories
 * canonically ("Food & Dining") while users' records carry whatever they chose
 * ("Food", "Dining out"), so an exact match answered ₹0 for real spending.
 */
function categoryMatch(category: string): Array<Record<string, unknown>> {
  const parts = category.split(/\s*(?:&|\band\b|\/|,)\s*/i).map((p) => p.trim()).filter((p) => p.length >= 3);
  return [
    { category: { equals: category, mode: 'insensitive' } },
    { category: { contains: category, mode: 'insensitive' } },
    ...parts.map((part) => ({ category: { contains: part, mode: 'insensitive' } })),
  ];
}

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
    whereClause.OR = categoryMatch(category);
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
  const period = spokenPeriod(startDate, endDate, defaultEnd);

  return {
    summary: `You spent ${INR(total)}${catLabel} ${period} across ${count} transaction${count !== 1 ? 's' : ''}.`,
    transactions: rows.map(toRow),
    meta: { total, count, category, period },
  };
}

async function dateRangeSummary(userId: string, params: QueryParams): Promise<QueryResult> {
  const { startDate, endDate } = params;
  const { startDate: defaultStart, endDate: defaultEnd } = currentPeriodBounds();

  const where = {
    userId,
    deletedAt: null,
    type: 'expense',
    date: {
      gte: startDate ?? defaultStart,
      lte: endDate ?? defaultEnd,
    },
  };

  const [rows, aggregate] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['category'],
      where,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 6,
    }),
    prisma.transaction.aggregate({ where, _sum: { amount: true } }),
  ]);

  if (rows.length === 0) {
    return { summary: 'No expense transactions found for that period.', meta: {} };
  }

  const lines = rows.map(
    r => `${r.category}: ${INR(Number(r._sum.amount ?? 0))} (${r._count.id} txns)`,
  );
  const grandTotal = Number(aggregate._sum.amount ?? 0);
  const period = spokenPeriod(startDate, endDate, defaultEnd);

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
      deletedAt: null,
      contactPerson: { contains: name, mode: 'insensitive' },
      status: 'active',
    },
    select: {
      id: true,
      type: true,
      name: true,
      contactPerson: true,
      principalAmount: true,
      outstandingBalance: true,
    },
  });

  if (loans.length === 0) {
    return { summary: `No active loans found for "${name}".` };
  }

  let netBalance = 0;
  const lines: string[] = [];
  for (const loan of loans) {
    const outstanding = Number(loan.outstandingBalance ?? loan.principalAmount ?? 0);
    const person = loan.contactPerson || loan.name;
    const label = loan.name && loan.name !== person ? ` (${loan.name})` : '';
    if (loan.type === 'lent') {
      netBalance += outstanding;
      lines.push(`${person} owes you ${INR(outstanding)}${label}`);
    } else {
      netBalance -= outstanding;
      lines.push(`You owe ${person} ${INR(outstanding)}${label}`);
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
  const period = spokenPeriod(startDate, endDate, defaultEnd);
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

/** Same window rule as POST /budgets/:id/recalculate. */
function budgetWindowStart(period: string, now: Date): Date {
  if (period === 'weekly') {
    const d = new Date(now);
    d.setDate(now.getDate() - 7);
    return d;
  }
  if (period === 'yearly') return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function budgetStatus(userId: string, params: QueryParams): Promise<QueryResult> {
  const category = (params.category ?? '').trim();
  const budgets = await prisma.budget.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(category ? { category: { contains: category, mode: 'insensitive' } } : {}),
    },
    select: { category: true, amount: true, period: true, threshold: true },
  });

  if (budgets.length === 0) {
    return {
      summary: category
        ? `No budget set for ${category}. Say "set a ${category} budget of ₹8,000" and I'll create one with alerts.`
        : 'No budgets set. Say "set a food budget of ₹8,000" and I\'ll create one with alerts.',
    };
  }

  const now = new Date();
  const items = await Promise.all(budgets.map(async (b) => {
    const agg = await prisma.transaction.aggregate({
      where: {
        userId,
        deletedAt: null,
        type: 'expense',
        category: { equals: b.category, mode: 'insensitive' },
        date: { gte: budgetWindowStart(b.period, now), lte: now },
      },
      _sum: { amount: true },
    });
    const limit = Number(b.amount ?? 0);
    const spent = Number(agg._sum.amount ?? 0);
    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    const threshold = b.threshold ?? 80;
    const status = pct >= 100 ? 'exceeded' : pct >= threshold ? 'warning' : 'ok';
    return { category: b.category, limit, spent, remaining: Math.max(0, limit - spent), pct, period: b.period, status };
  }));

  const lines = items.map((b) => {
    const flag = b.status === 'exceeded' ? ' — over limit' : b.status === 'warning' ? ' — near limit' : '';
    return `• ${b.category} (${b.period}): ${INR(b.spent)} of ${INR(b.limit)} (${b.pct}%), ${INR(b.remaining)} left${flag}`;
  });
  const breached = items.filter((b) => b.status !== 'ok').length;
  const head = items.length === 1
    ? ''
    : breached > 0
      ? `${breached} of ${items.length} budgets need attention:\n`
      : `All ${items.length} budgets are within limits:\n`;
  return { summary: `${head}${lines.join('\n')}`, meta: { budgets: items } };
}

/**
 * LLM date math is occasionally off by a day ("last month" → Jul 31 – Aug 30).
 * A window that is roughly one month long snaps to the calendar month it
 * mostly covers; anything else is left alone.
 */
export function snapToCalendarMonth(start: Date, end: Date): { start: Date; end: Date } {
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days < 26 || days > 33) return { start, end };
  const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
  return {
    start: new Date(mid.getFullYear(), mid.getMonth(), 1),
    end: new Date(mid.getFullYear(), mid.getMonth() + 1, 0, 23, 59, 59),
  };
}

async function expenseReport(userId: string, params: QueryParams): Promise<QueryResult> {
  const { startDate: defaultStart, endDate: defaultEnd } = currentPeriodBounds();
  const snapped = params.startDate && params.endDate ? snapToCalendarMonth(params.startDate, params.endDate) : null;
  const start = snapped?.start ?? params.startDate ?? defaultStart;
  const end = snapped?.end ?? params.endDate ?? defaultEnd;
  const base = { userId, deletedAt: null, date: { gte: start, lte: end } };
  const expenseWhere = { ...base, type: 'expense', category: { not: 'Personal Share Offset' } };

  const [rows, expenseAgg, incomeAgg] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['category'],
      where: expenseWhere,
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
    }),
    prisma.transaction.aggregate({ where: expenseWhere, _sum: { amount: true }, _count: { id: true } }),
    prisma.transaction.aggregate({ where: { ...base, type: 'income' }, _sum: { amount: true } }),
  ]);

  const total = Number(expenseAgg._sum.amount ?? 0);
  const count = expenseAgg._count.id;
  const income = Number(incomeAgg._sum.amount ?? 0);
  const label = periodLabel(start, end);
  const categories = rows.map((r) => {
    const amount = Number(r._sum.amount ?? 0);
    return {
      category: r.category || 'Uncategorised',
      amount,
      count: r._count.id,
      pct: total > 0 ? Math.round((amount / total) * 100) : 0,
    };
  });

  if (count === 0) {
    return {
      summary: `No expenses recorded for ${label}.`,
      meta: { period: label, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), total: 0, count: 0, income, net: income, categories: [] },
    };
  }

  const top = categories[0];
  const summary =
    `${label}: you spent ${INR(total)} across ${count} transaction${count !== 1 ? 's' : ''}` +
    (income > 0 ? ` and earned ${INR(income)}` : '') +
    `. ${top.category} was your biggest category at ${INR(top.amount)} (${top.pct}%).`;

  return {
    summary,
    meta: {
      period: label,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      total,
      count,
      income,
      net: income - total,
      categories,
    },
  };
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
      case 'BUDGET_STATUS':       return await budgetStatus(userId, params);
      case 'UPCOMING_RECURRING':  return await upcomingRecurring(userId);
      case 'EXPENSE_REPORT':      return await expenseReport(userId, params);
      default:
        return { summary: 'Unsupported query type.' };
    }
  } catch (err) {
    logger.error('FinancialQueryEngine error', { intent: params.intent, userId, err });
    return { summary: 'I encountered an error looking up your data. Please try again.' };
  }
}
