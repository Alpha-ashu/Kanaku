/**
 * Financial snapshot — one compact, LLM-safe picture of a user's finances.
 *
 * Feeds the conversational assistant's "overview" answer and grounds its
 * "advice" answers in the user's real numbers. Every section is fetched
 * independently and fails soft, so one broken table never blanks the whole
 * summary.
 */

import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { getFinancialBaseline } from './financial-baseline';

export interface SnapshotGoal { name: string; target: number; saved: number; pct: number; targetDate: string | null }
export interface SnapshotLoan { person: string; type: 'lent' | 'borrowed'; outstanding: number; emi?: number; dueDate?: string }
export interface SnapshotBudget { category: string; limit: number; spent: number; pct: number; period: string; status: 'ok' | 'warning' | 'exceeded' }
export interface SnapshotUpcoming { title: string; amount: number; dueDate: string; category: string; type: string }

export interface FinancialSnapshot {
  generatedAt: string;
  accounts: { count: number; totalBalance: number; top: Array<{ name: string; type: string; balance: number }> };
  month: {
    label: string;
    income: number;
    expense: number;
    net: number;
    savingsRate: number | null;
    txCount: number;
    topCategories: Array<{ category: string; amount: number; count: number }>;
  };
  lastMonth: { income: number; expense: number };
  baseline: { monthlyIncome: number; source: string };
  goals: { count: number; totalTarget: number; totalSaved: number; progressPct: number | null; items: SnapshotGoal[] };
  loans: { lentOutstanding: number; borrowedOutstanding: number; items: SnapshotLoan[] };
  investments: { count: number; invested: number; currentValue: number; profitLoss: number; byType: Array<{ assetType: string; value: number }> };
  budgets: { items: SnapshotBudget[]; breached: number };
  upcoming: SnapshotUpcoming[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const INR = (n: number): string =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;

const isoDay = (d: Date | null | undefined): string | null =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;

async function safe<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`[snapshot] ${label} failed`, { error: err instanceof Error ? err.message : String(err) });
    return fallback;
  }
}

const monthBounds = (offset = 0) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

interface CategoryRow { category: string; amount: number; count: number }

async function expenseByCategory(userId: string, start: Date, end: Date): Promise<CategoryRow[]> {
  const rows = await prisma.transaction.groupBy({
    by: ['category'],
    where: { userId, deletedAt: null, type: 'expense', date: { gte: start, lte: end } },
    _sum: { amount: true },
    _count: { id: true },
    orderBy: { _sum: { amount: 'desc' } },
  });
  return rows.map((r) => ({ category: r.category || 'Uncategorised', amount: num(r._sum.amount), count: r._count.id }));
}

async function sumByType(userId: string, type: 'income' | 'expense', start: Date, end: Date): Promise<{ total: number; count: number }> {
  const agg = await prisma.transaction.aggregate({
    where: { userId, deletedAt: null, type, date: { gte: start, lte: end } },
    _sum: { amount: true },
    _count: { id: true },
  });
  return { total: num(agg._sum.amount), count: agg._count.id };
}

export async function buildFinancialSnapshot(userId: string): Promise<FinancialSnapshot> {
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);
  const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const [
    accounts,
    incomeNow,
    expenseNow,
    incomePrev,
    expensePrev,
    categories,
    goals,
    loans,
    investments,
    budgets,
    recurring,
    baseline,
  ] = await Promise.all([
    safe('accounts', [] as Array<{ name: string; type: string; balance: unknown }>, () =>
      prisma.account.findMany({
        where: { userId, isActive: true, deletedAt: null },
        select: { name: true, type: true, balance: true },
        orderBy: { balance: 'desc' },
      })),
    safe('income', { total: 0, count: 0 }, () => sumByType(userId, 'income', thisMonth.start, thisMonth.end)),
    safe('expense', { total: 0, count: 0 }, () => sumByType(userId, 'expense', thisMonth.start, thisMonth.end)),
    safe('income-prev', { total: 0, count: 0 }, () => sumByType(userId, 'income', lastMonth.start, lastMonth.end)),
    safe('expense-prev', { total: 0, count: 0 }, () => sumByType(userId, 'expense', lastMonth.start, lastMonth.end)),
    safe('categories', [] as CategoryRow[], () => expenseByCategory(userId, thisMonth.start, thisMonth.end)),
    safe('goals', [] as Array<{ name: string; targetAmount: unknown; currentAmount: unknown; targetDate: Date }>, () =>
      prisma.goal.findMany({
        where: { userId, deletedAt: null },
        select: { name: true, targetAmount: true, currentAmount: true, targetDate: true },
        orderBy: { targetDate: 'asc' },
        take: 10,
      })),
    safe('loans', [] as Array<{ type: string; contactPerson: string | null; name: string; outstandingBalance: unknown; emiAmount: unknown; dueDate: Date | null }>, () =>
      prisma.loan.findMany({
        where: { userId, deletedAt: null, status: 'active' },
        select: { type: true, contactPerson: true, name: true, outstandingBalance: true, emiAmount: true, dueDate: true },
        take: 20,
      })),
    safe('investments', [] as Array<{ assetType: string; totalInvested: unknown; currentValue: unknown; profitLoss: unknown }>, () =>
      prisma.investment.findMany({
        where: { userId, deletedAt: null, OR: [{ positionStatus: 'open' }, { positionStatus: null }] },
        select: { assetType: true, totalInvested: true, currentValue: true, profitLoss: true },
      })),
    safe('budgets', [] as Array<{ category: string; amount: unknown; period: string; threshold: number }>, () =>
      prisma.budget.findMany({
        where: { userId, deletedAt: null },
        select: { category: true, amount: true, period: true, threshold: true },
      })),
    safe('recurring', [] as Array<{ title: string; amount: unknown; nextDueDate: Date; category: string; type: string | null }>, () =>
      prisma.recurringTransaction.findMany({
        where: { userId, deletedAt: null, status: 'active', nextDueDate: { lte: inTwoWeeks } },
        select: { title: true, amount: true, nextDueDate: true, category: true, type: true },
        orderBy: { nextDueDate: 'asc' },
        take: 6,
      })),
    safe('baseline', { monthlyIncome: 0, incomeSource: 'none', transactionMonthlyIncome: 0, declaredMonthlyIncome: 0, totalBalance: 0 }, () =>
      getFinancialBaseline(userId)),
  ]);

  const totalBalance = accounts.reduce((s, a) => s + num(a.balance), 0);
  const income = incomeNow.total;
  const expense = expenseNow.total;
  const effectiveIncome = income > 0 ? income : baseline.monthlyIncome;
  const savingsRate = effectiveIncome > 0 ? Math.round(((effectiveIncome - expense) / effectiveIncome) * 100) : null;

  const spentByKey = new Map<string, number>();
  for (const c of categories) spentByKey.set(c.category.trim().toLowerCase(), c.amount);

  const budgetItems: SnapshotBudget[] = budgets.map((b) => {
    const limit = num(b.amount);
    const spent = spentByKey.get(b.category.trim().toLowerCase()) ?? 0;
    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    const threshold = b.threshold ?? 80;
    const status: SnapshotBudget['status'] = pct >= 100 ? 'exceeded' : pct >= threshold ? 'warning' : 'ok';
    return { category: b.category, limit, spent, pct, period: b.period, status };
  });

  const goalItems: SnapshotGoal[] = goals.map((g) => {
    const target = num(g.targetAmount);
    const saved = num(g.currentAmount);
    return {
      name: g.name,
      target,
      saved,
      pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
      targetDate: isoDay(g.targetDate),
    };
  });
  const totalTarget = goalItems.reduce((s, g) => s + g.target, 0);
  const totalSaved = goalItems.reduce((s, g) => s + g.saved, 0);

  const loanItems: SnapshotLoan[] = loans.map((l) => ({
    person: l.contactPerson || l.name,
    type: l.type === 'lent' ? 'lent' : 'borrowed',
    outstanding: num(l.outstandingBalance),
    emi: num(l.emiAmount) > 0 ? num(l.emiAmount) : undefined,
    dueDate: isoDay(l.dueDate) ?? undefined,
  }));

  const byType = new Map<string, number>();
  for (const inv of investments) byType.set(inv.assetType, (byType.get(inv.assetType) ?? 0) + num(inv.currentValue));

  const snapshot: FinancialSnapshot = {
    generatedAt: new Date().toISOString(),
    accounts: {
      count: accounts.length,
      totalBalance,
      top: accounts.slice(0, 5).map((a) => ({ name: a.name, type: a.type, balance: num(a.balance) })),
    },
    month: {
      label: thisMonth.start.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
      income,
      expense,
      net: income - expense,
      savingsRate,
      txCount: incomeNow.count + expenseNow.count,
      topCategories: categories.slice(0, 5),
    },
    lastMonth: { income: incomePrev.total, expense: expensePrev.total },
    baseline: { monthlyIncome: baseline.monthlyIncome, source: baseline.incomeSource },
    goals: {
      count: goalItems.length,
      totalTarget,
      totalSaved,
      progressPct: totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : null,
      items: goalItems,
    },
    loans: {
      lentOutstanding: loanItems.filter((l) => l.type === 'lent').reduce((s, l) => s + l.outstanding, 0),
      borrowedOutstanding: loanItems.filter((l) => l.type === 'borrowed').reduce((s, l) => s + l.outstanding, 0),
      items: loanItems,
    },
    investments: {
      count: investments.length,
      invested: investments.reduce((s, i) => s + num(i.totalInvested), 0),
      currentValue: investments.reduce((s, i) => s + num(i.currentValue), 0),
      profitLoss: investments.reduce((s, i) => s + num(i.profitLoss), 0),
      byType: [...byType.entries()].map(([assetType, value]) => ({ assetType, value })).sort((a, b) => b.value - a.value),
    },
    budgets: { items: budgetItems, breached: budgetItems.filter((b) => b.status !== 'ok').length },
    upcoming: recurring.map((r) => ({
      title: r.title,
      amount: num(r.amount),
      dueDate: isoDay(r.nextDueDate) ?? '',
      category: r.category,
      type: r.type ?? 'expense',
    })),
  };

  return snapshot;
}

/** Compact text form for LLM prompts — numbers only, no row dumps. */
export function snapshotForPrompt(s: FinancialSnapshot): string {
  const lines: string[] = [];
  lines.push(`Month: ${s.month.label}. Income ${INR(s.month.income)}, expenses ${INR(s.month.expense)}, net ${INR(s.month.net)}` +
    (s.month.savingsRate !== null ? `, savings rate ${s.month.savingsRate}%` : '') + `.`);
  if (s.baseline.monthlyIncome > 0) lines.push(`Typical monthly income: ${INR(s.baseline.monthlyIncome)} (${s.baseline.source}).`);
  lines.push(`Last month: income ${INR(s.lastMonth.income)}, expenses ${INR(s.lastMonth.expense)}.`);
  lines.push(`Accounts: ${s.accounts.count}, total balance ${INR(s.accounts.totalBalance)}.`);
  if (s.month.topCategories.length) {
    lines.push('Top spending this month: ' + s.month.topCategories.map((c) => `${c.category} ${INR(c.amount)}`).join(', ') + '.');
  }
  if (s.budgets.items.length) {
    lines.push('Budgets: ' + s.budgets.items.map((b) => `${b.category} ${INR(b.spent)}/${INR(b.limit)} (${b.pct}%, ${b.status})`).join('; ') + '.');
  }
  if (s.goals.count) {
    lines.push('Goals: ' + s.goals.items.map((g) => `${g.name} ${INR(g.saved)}/${INR(g.target)} (${g.pct}%${g.targetDate ? `, by ${g.targetDate}` : ''})`).join('; ') + '.');
  }
  if (s.loans.items.length) {
    lines.push(`Loans: owed to you ${INR(s.loans.lentOutstanding)}, you owe ${INR(s.loans.borrowedOutstanding)}. ` +
      s.loans.items.slice(0, 6).map((l) => `${l.type === 'lent' ? `${l.person} owes you` : `you owe ${l.person}`} ${INR(l.outstanding)}`).join('; ') + '.');
  }
  if (s.investments.count) {
    lines.push(`Investments: ${s.investments.count} holdings, invested ${INR(s.investments.invested)}, worth ${INR(s.investments.currentValue)} (${s.investments.profitLoss >= 0 ? '+' : '-'}${INR(Math.abs(s.investments.profitLoss))}).`);
  }
  if (s.upcoming.length) {
    lines.push('Due in next 14 days: ' + s.upcoming.map((u) => `${u.title} ${INR(u.amount)} on ${u.dueDate}`).join(', ') + '.');
  }
  return lines.join('\n');
}

/** User-facing overview — plain text with light markdown (bold + bullets). */
export function renderOverview(s: FinancialSnapshot): string {
  const out: string[] = [];
  out.push(`**Your finances — ${s.month.label}**`);
  out.push(`• Balance across ${s.accounts.count} account${s.accounts.count === 1 ? '' : 's'}: **${INR(s.accounts.totalBalance)}**`);
  out.push(`• Income ${INR(s.month.income)} · Spent ${INR(s.month.expense)} · Net **${s.month.net >= 0 ? '+' : '-'}${INR(Math.abs(s.month.net))}**` +
    (s.month.savingsRate !== null ? ` (savings rate ${s.month.savingsRate}%)` : ''));

  if (s.lastMonth.expense > 0) {
    const delta = ((s.month.expense - s.lastMonth.expense) / s.lastMonth.expense) * 100;
    out.push(`• Spending vs last month: ${delta >= 0 ? '+' : ''}${Math.round(delta)}% (${INR(s.lastMonth.expense)} last month)`);
  }
  if (s.month.topCategories.length) {
    out.push(`• Top categories: ${s.month.topCategories.slice(0, 3).map((c) => `${c.category} ${INR(c.amount)}`).join(', ')}`);
  }
  if (s.budgets.items.length) {
    const hot = s.budgets.items.filter((b) => b.status !== 'ok');
    out.push(hot.length
      ? `• Budgets: ${hot.length} of ${s.budgets.items.length} need attention — ${hot.map((b) => `${b.category} ${b.pct}%`).join(', ')}`
      : `• Budgets: all ${s.budgets.items.length} within limits`);
  }
  if (s.goals.count) {
    out.push(`• Goals: ${INR(s.goals.totalSaved)} of ${INR(s.goals.totalTarget)} saved (${s.goals.progressPct ?? 0}%) across ${s.goals.count} goal${s.goals.count === 1 ? '' : 's'}`);
  }
  if (s.loans.items.length) {
    out.push(`• Loans: people owe you ${INR(s.loans.lentOutstanding)} · you owe ${INR(s.loans.borrowedOutstanding)}`);
  }
  if (s.investments.count) {
    out.push(`• Investments: ${INR(s.investments.currentValue)} (${s.investments.profitLoss >= 0 ? 'up' : 'down'} ${INR(Math.abs(s.investments.profitLoss))})`);
  }
  if (s.upcoming.length) {
    out.push(`• Coming up: ${s.upcoming.slice(0, 3).map((u) => `${u.title} ${INR(u.amount)} (${u.dueDate})`).join(', ')}`);
  }
  if (s.month.txCount === 0 && s.accounts.count === 0) {
    out.push('');
    out.push('I don\'t see any transactions or accounts yet. Add an account and a few expenses (or just tell me "I spent ₹500 on groceries") and I\'ll build your picture from there.');
  }
  return out.join('\n');
}

/** Rule-based guidance when no LLM is reachable — still grounded in the numbers. */
export function offlineAdvice(s: FinancialSnapshot, question: string): string {
  const tips: string[] = [];
  const q = question.toLowerCase();

  if (s.month.savingsRate !== null) {
    if (s.month.savingsRate < 10) tips.push(`Your savings rate this month is ${s.month.savingsRate}%. A first target is 20% — that is about ${INR(Math.max(0, (s.baseline.monthlyIncome || s.month.income) * 0.2 - s.month.net))} more set aside this month.`);
    else if (s.month.savingsRate < 20) tips.push(`You are saving ${s.month.savingsRate}% of income. Nudging that to 20% builds a cushion faster; automating a transfer on payday is the easiest way.`);
    else tips.push(`You are saving ${s.month.savingsRate}% of income — above the 20% benchmark. Consider routing the surplus into a goal or an SIP so it compounds.`);
  }
  const top = s.month.topCategories[0];
  if (top && s.month.expense > 0 && top.amount / s.month.expense > 0.35) {
    tips.push(`${top.category} is ${Math.round((top.amount / s.month.expense) * 100)}% of this month's spending (${INR(top.amount)}). Setting a budget for it — say "set a ${top.category} budget of ${INR(Math.round(top.amount * 0.85))}" — gives you an alert before it runs away.`);
  }
  const exceeded = s.budgets.items.filter((b) => b.status === 'exceeded');
  if (exceeded.length) tips.push(`Budgets already over: ${exceeded.map((b) => `${b.category} (${b.pct}%)`).join(', ')}. Pause discretionary spends in those categories for the rest of the month.`);
  if (s.loans.borrowedOutstanding > 0) tips.push(`You owe ${INR(s.loans.borrowedOutstanding)}. Clearing the highest-interest loan first saves the most; if these are interest-free personal loans, schedule fixed monthly repayments so they don't linger.`);
  const months = s.month.expense > 0 ? s.accounts.totalBalance / s.month.expense : 0;
  if (/emergency|cushion|safety/.test(q) || months < 3) {
    tips.push(months < 3
      ? `Your balances cover about ${months.toFixed(1)} month${months >= 2 ? 's' : ''} of expenses. Aim for a 3–6 month emergency fund (${INR(s.month.expense * 3)}–${INR(s.month.expense * 6)}) in a liquid account before locking money away.`
      : `Your balances cover roughly ${months.toFixed(1)} months of expenses — a healthy emergency cushion. Money beyond 6 months can work harder in an SIP, FD or index fund.`);
  }
  if (/invest|sip|mutual|stock|fd/.test(q)) {
    tips.push('A simple starting mix: an emergency fund first, then a monthly SIP into a low-cost index fund, with FDs/RDs for money you need within 3 years. Keep any single stock under 10% of your portfolio.');
  }
  if (s.goals.count === 0 && /goal|save for|plan/.test(q)) {
    tips.push('You have no goals yet. Tell me "create a goal Emergency fund ₹1,00,000 by next March" and I\'ll set it up and track it.');
  }
  if (tips.length === 0) {
    tips.push('Track every expense for a full month, set budgets for your top 3 categories, keep a 3–6 month emergency fund, and automate savings on payday. Ask me for an overview any time to see where you stand.');
  }
  return tips.map((t) => `• ${t}`).join('\n') + '\n\n_General guidance based on your Kanaku data — not personalised financial advice._';
}
