/**
 * AI insight agents — rule-based analyses of one user's finances that feed
 * GET /ai/insights (dashboard card, AI Insights page, Reports) and the
 * per-agent endpoints.
 *
 * Every agent works from one data load, so a full insights request costs a
 * handful of queries rather than one set per agent. The load ignores
 * soft-deleted rows (deleted transactions used to inflate spending and get
 * flagged as fraud), treats only money the user borrowed as debt (money they
 * lent is owed TO them), and never writes: a GET that re-categorised
 * transactions server-side bypassed sync versioning and surprised users.
 */

import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { getFinancialBaseline, type FinancialBaseline } from './financial-baseline';
import { INR } from './financial-snapshot';

//  Type Definitions

export interface AgentResult {
  agentName: string;
  status: 'success' | 'error';
  output?: AgentOutput;
  error?: string;
  executionMs: number;
}

export interface AgentOutput {
  recommendations?: Recommendation[];
  score?: number;
  insights?: Insight[];
  flags?: FraudFlag[];
  predictions?: BillPrediction[];
}

export interface Recommendation {
  type: string;
  title: string;
  message: string;
  /** 1–10, higher is more urgent. */
  priority: number;
  actionLabel?: string;
}

export interface Insight {
  category: string;
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'stable';
}

export interface FraudFlag {
  transactionId: string;
  reason: 'unusual_amount';
  severity: 'low' | 'medium' | 'high';
  amount: number;
  /** Human-readable explanation, safe to show as-is. */
  message: string;
  description?: string;
  category?: string;
  date?: string;
}

export interface BillPrediction {
  merchant: string;
  predictedAmount: number;
  predictedDate: string;
  confidence: number;
  source: 'recurring' | 'history';
}

//  Data

interface AgentTransaction {
  id: string;
  type: string;
  amount: number;
  category: string;
  merchant: string | null;
  description: string | null;
  date: Date;
}

export interface AgentData {
  now: Date;
  /** Non-deleted transactions from the last 120 days, oldest first. */
  transactions: AgentTransaction[];
  goals: Array<{ name: string; target: number; saved: number; targetDate: Date }>;
  /** Active loans the user owes (borrowed / EMI). */
  debts: Array<{ name: string; outstanding: number; emi: number }>;
  lentOutstanding: number;
  budgets: Array<{ category: string; amount: number; period: string; threshold: number }>;
  recurring: Array<{ title: string; amount: number; nextDueDate: Date; type: string | null }>;
  investedValue: number;
  baseline: FinancialBaseline;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 120;

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pct = (value: number) => `${value.toFixed(1)}%`;

async function soft<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.warn(`[agents] ${label} lookup failed`, { error: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}

export async function loadAgentData(userId: string, now = new Date()): Promise<AgentData> {
  const [transactions, goals, loans, budgets, recurring, investments, baseline] = await Promise.all([
    soft('transactions', [] as AgentTransaction[], async () => {
      const rows = await prisma.transaction.findMany({
        where: { userId, deletedAt: null, date: { gte: daysAgo(now, HISTORY_DAYS) } },
        select: { id: true, type: true, amount: true, category: true, merchant: true, description: true, date: true },
        orderBy: { date: 'asc' },
      });
      return rows.map((t) => ({ ...t, amount: num(t.amount) }));
    }),
    soft('goals', [] as AgentData['goals'], async () => {
      const rows = await prisma.goal.findMany({
        where: { userId, deletedAt: null },
        select: { name: true, targetAmount: true, currentAmount: true, targetDate: true },
      });
      return rows
        .map((g) => ({ name: g.name, target: num(g.targetAmount), saved: num(g.currentAmount), targetDate: g.targetDate }))
        .filter((g) => g.target > 0 && g.saved < g.target);
    }),
    soft('loans', [] as Array<{ type: string; name: string; contactPerson: string | null; outstandingBalance: unknown; emiAmount: unknown }>, () =>
      prisma.loan.findMany({
        where: { userId, deletedAt: null, status: 'active' },
        select: { type: true, name: true, contactPerson: true, outstandingBalance: true, emiAmount: true },
      })),
    soft('budgets', [] as AgentData['budgets'], async () => {
      const rows = await prisma.budget.findMany({
        where: { userId, deletedAt: null },
        select: { category: true, amount: true, period: true, threshold: true },
      });
      return rows.map((b) => ({ category: b.category, amount: num(b.amount), period: b.period, threshold: b.threshold ?? 80 }));
    }),
    soft('recurring', [] as AgentData['recurring'], async () => {
      const rows = await prisma.recurringTransaction.findMany({
        where: { userId, deletedAt: null, status: 'active', nextDueDate: { lte: new Date(now.getTime() + 35 * DAY_MS) } },
        select: { title: true, amount: true, nextDueDate: true, type: true },
        orderBy: { nextDueDate: 'asc' },
        take: 20,
      });
      return rows.map((r) => ({ ...r, amount: num(r.amount) }));
    }),
    soft('investments', 0, async () => {
      const agg = await prisma.investment.aggregate({
        where: { userId, deletedAt: null, OR: [{ positionStatus: 'open' }, { positionStatus: null }] },
        _sum: { currentValue: true },
      });
      return num(agg._sum.currentValue);
    }),
    getFinancialBaseline(userId),
  ]);

  const isDebt = (type: string) => type !== 'lent';
  return {
    now,
    transactions,
    goals,
    debts: loans.filter((l) => isDebt(l.type)).map((l) => ({
      name: l.contactPerson || l.name,
      outstanding: num(l.outstandingBalance),
      emi: num(l.emiAmount),
    })),
    lentOutstanding: loans.filter((l) => !isDebt(l.type)).reduce((s, l) => s + num(l.outstandingBalance), 0),
    budgets,
    recurring,
    investedValue: investments,
    baseline,
  };
}

//  Shared figures

interface Figures {
  income: number;
  expense: number;
  surplus: number;
  /** Fraction, e.g. 0.2 for 20%. Null without any income. */
  savingsRate: number | null;
  /** Months the account balances would cover at the last 30 days' spending. */
  runwayMonths: number;
  totalEmi: number;
  totalDebt: number;
}

function figures(data: AgentData): Figures {
  const since = daysAgo(data.now, 30);
  const recent = data.transactions.filter((t) => t.date >= since);
  const observedIncome = recent.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = recent.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  // Observed income first; the onboarding declaration keeps new users' numbers meaningful.
  const income = observedIncome > 0 ? observedIncome : data.baseline.declaredMonthlyIncome;
  const monthlyNeed = expense > 0 ? expense : income;
  return {
    income,
    expense,
    surplus: income - expense,
    savingsRate: income > 0 ? (income - expense) / income : null,
    runwayMonths: monthlyNeed > 0 ? data.baseline.totalBalance / monthlyNeed : 0,
    totalEmi: data.debts.reduce((s, d) => s + d.emi, 0),
    totalDebt: data.debts.reduce((s, d) => s + d.outstanding, 0),
  };
}

const sameCategory = (budgetCategory: string, txCategory: string): boolean => {
  const b = budgetCategory.trim().toLowerCase();
  const t = (txCategory ?? '').trim().toLowerCase();
  if (!b || !t) return false;
  if (b === t || t.includes(b) || b.includes(t)) return true;
  return b.split(/\s*(?:&|\band\b|\/|,)\s*/).filter((p) => p.length >= 3).some((part) => t.includes(part));
};

const budgetWindowStart = (period: string, now: Date): Date => {
  if (period === 'weekly') return daysAgo(now, 7);
  if (period === 'yearly') return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const run = (agentName: string, fn: () => AgentOutput): AgentResult => {
  const start = Date.now();
  try {
    return { agentName, status: 'success', output: fn(), executionMs: Date.now() - start };
  } catch (error) {
    return { agentName, status: 'error', error: error instanceof Error ? error.message : String(error), executionMs: Date.now() - start };
  }
};

//  Agent: goals & savings

export function analyseGoals(data: AgentData): AgentOutput {
  const f = figures(data);
  const recommendations: Recommendation[] = [];

  if (f.savingsRate !== null && f.savingsRate < 0) {
    recommendations.push({
      type: 'goal_suggestion',
      title: 'Spending More Than You Earn',
      message: `Over the last 30 days you spent ${INR(-f.surplus)} more than your income of ${INR(f.income)}. Trim one or two categories before adding new goals.`,
      priority: 9,
      actionLabel: 'Review Spending',
    });
  } else if (f.savingsRate !== null && f.savingsRate < 0.1) {
    recommendations.push({
      type: 'goal_suggestion',
      title: 'Low Savings Rate',
      message: `You kept ${pct(f.savingsRate * 100)} of your income over the last 30 days (${INR(f.surplus)}). Aim for 20% — a savings goal makes it automatic.`,
      priority: 7,
      actionLabel: 'Create Savings Goal',
    });
  }

  if (data.goals.length === 0 && f.income > 0) {
    recommendations.push({
      type: 'goal_suggestion',
      title: 'No Savings Goals Yet',
      message: `Setting aside 20% of your income is about ${INR(f.income * 0.2)} a month. Give it a name — an emergency fund is a good first goal.`,
      priority: 5,
      actionLabel: 'Add Goal',
    });
  }

  const behind = data.goals
    .map((g) => {
      const monthsLeft = (g.targetDate.getTime() - data.now.getTime()) / (30 * DAY_MS);
      const remaining = g.target - g.saved;
      return { ...g, remaining, monthsLeft, needed: monthsLeft > 0 ? remaining / Math.max(monthsLeft, 1) : remaining };
    })
    .filter((g) => g.monthsLeft <= 0 || (f.income > 0 && g.needed > Math.max(0, f.surplus)))
    .sort((a, b) => a.monthsLeft - b.monthsLeft)
    .slice(0, 2);

  for (const g of behind) {
    recommendations.push({
      type: 'goal_suggestion',
      title: g.monthsLeft <= 0 ? `${g.name}: Target Date Passed` : `${g.name} Is Behind Schedule`,
      message: g.monthsLeft <= 0
        ? `${INR(g.remaining)} is still needed. Move the target date or plan a monthly amount you can keep up.`
        : `You need about ${INR(g.needed)} a month to reach ${INR(g.target)} by ${g.targetDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, but saved ${INR(Math.max(0, f.surplus))} in the last 30 days.`,
      priority: 6,
      actionLabel: 'Open Goal',
    });
  }

  return {
    recommendations,
    insights: f.savingsRate === null ? [] : [{ category: 'savings', label: 'Savings Rate (30 days)', value: pct(f.savingsRate * 100) }],
  };
}

//  Agent: budgets & spending share

export function analyseBudgets(data: AgentData): AgentOutput {
  const f = figures(data);
  const since = daysAgo(data.now, 30);
  const recommendations: Recommendation[] = [];

  // Spending past 100% of income is already the savings agent's top warning.
  if (f.income > 0 && f.expense > f.income * 0.8 && f.expense <= f.income) {
    recommendations.push({
      type: 'budget_alert',
      title: 'Spending Above 80% of Income',
      message: `You spent ${INR(f.expense)} against ${INR(f.income)} of income in the last 30 days (${Math.round((f.expense / f.income) * 100)}%). Keeping it under 80% leaves room to save.`,
      priority: 9,
    });
  }

  const byCategory = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.type !== 'expense' || t.date < since) continue;
    const key = t.category || 'Uncategorised';
    byCategory.set(key, (byCategory.get(key) ?? 0) + t.amount);
  }
  const [top] = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  if (top && f.income > 0 && top[1] / f.income > 0.4) {
    recommendations.push({
      type: 'budget_alert',
      title: `High ${top[0]} Spending`,
      message: `${top[0]} took ${Math.round((top[1] / f.income) * 100)}% of your income in the last 30 days (${INR(top[1])}).`,
      priority: 7,
      actionLabel: 'Set a Budget',
    });
  }

  for (const b of data.budgets) {
    if (b.amount <= 0) continue;
    const start = budgetWindowStart(b.period, data.now);
    const spent = data.transactions
      .filter((t) => t.type === 'expense' && t.date >= start && sameCategory(b.category, t.category))
      .reduce((s, t) => s + t.amount, 0);
    const used = spent / b.amount;
    const window = b.period === 'weekly' ? 'this week' : b.period === 'yearly' ? 'this year' : 'this month';
    if (used >= 1) {
      recommendations.push({
        type: 'budget_alert',
        title: `${b.category} Budget Exceeded`,
        message: `${INR(spent)} spent ${window} against a ${INR(b.amount)} budget — ${INR(spent - b.amount)} over.`,
        priority: 8,
      });
    } else if (used * 100 >= b.threshold) {
      recommendations.push({
        type: 'budget_alert',
        title: `${b.category} Budget Nearly Used`,
        message: `${Math.round(used * 100)}% of your ${INR(b.amount)} ${b.category} budget is used ${window} (${INR(b.amount - spent)} left).`,
        priority: 6,
      });
    }
  }

  return { recommendations };
}

//  Agent: spending pattern

export function analyseSpendingPattern(data: AgentData): AgentOutput {
  const since = daysAgo(data.now, 90);
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const t of data.transactions) {
    if (t.type !== 'expense' || t.date < since) continue;
    const key = t.category || 'Uncategorised';
    const entry = byCategory.get(key) ?? { total: 0, count: 0 };
    entry.total += t.amount;
    entry.count += 1;
    byCategory.set(key, entry);
  }

  const insights: Insight[] = [...byCategory.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([label, entry]) => ({
      category: 'spending',
      label,
      value: `${INR(entry.total)} · ${entry.count} txn${entry.count === 1 ? '' : 's'} (90 days)`,
    }));

  return { insights };
}

//  Agent: upcoming bills

const billKey = (t: AgentTransaction) => (t.merchant || t.description || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function predictBills(data: AgentData): AgentOutput {
  const predictions: BillPrediction[] = [];
  const horizon = new Date(data.now.getTime() + 35 * DAY_MS);
  const staleCutoff = daysAgo(data.now, 3);

  // Recurring transactions the user set up are the authoritative schedule.
  for (const r of data.recurring) {
    if (r.type === 'income') continue;
    if (r.nextDueDate < staleCutoff) continue;
    predictions.push({
      merchant: r.title,
      predictedAmount: r.amount,
      predictedDate: r.nextDueDate.toISOString().slice(0, 10),
      confidence: 0.95,
      source: 'recurring',
    });
  }
  const known = new Set(predictions.map((p) => p.merchant.trim().toLowerCase()));

  // Then monthly patterns in the history: same payee, similar amount, ~monthly gaps.
  const groups = new Map<string, AgentTransaction[]>();
  for (const t of data.transactions) {
    if (t.type !== 'expense') continue;
    const key = billKey(t);
    if (key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  for (const [key, entries] of groups) {
    if (entries.length < 2 || known.has(key)) continue;
    const gaps = entries.slice(1).map((e, i) => (e.date.getTime() - entries[i].date.getTime()) / DAY_MS);
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGap < 25 || avgGap > 35 || gaps.some((g) => g < 20 || g > 40)) continue;

    const amounts = entries.slice(-3).map((e) => e.amount);
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (amounts.some((a) => Math.abs(a - avgAmount) > avgAmount * 0.25)) continue;

    const last = entries[entries.length - 1];
    const next = new Date(last.date.getTime() + Math.round(avgGap) * DAY_MS);
    if (next < staleCutoff || next > horizon) continue;

    predictions.push({
      merchant: (last.merchant || last.description || key).trim(),
      predictedAmount: Math.round(avgAmount),
      predictedDate: next.toISOString().slice(0, 10),
      confidence: Math.round(Math.min(0.9, 0.55 + entries.length * 0.08) * 100) / 100,
      source: 'history',
    });
  }

  predictions.sort((a, b) => a.predictedDate.localeCompare(b.predictedDate));
  return { predictions };
}

//  Agent: unusual expenses

export function detectUnusualExpenses(data: AgentData): AgentOutput {
  const expenses = data.transactions.filter((t) => t.type === 'expense' && t.amount > 0);
  // Too little history to know what "usual" is.
  if (expenses.length < 10) return { flags: [] };

  const sorted = expenses.map((t) => t.amount).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((a) => Math.abs(a - median)).sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length / 2)] * 1.4826 || median * 0.5;
  const threshold = Math.max(5000, median + 6 * mad, median * 8);

  const since = daysAgo(data.now, 30);
  const flags: FraudFlag[] = [];
  for (const t of expenses) {
    if (t.date < since || t.amount < threshold) continue;
    // Rent, EMIs and fees are large but expected: another payment of about the
    // same size in the same category means this is a pattern, not an anomaly.
    const repeats = expenses.some((o) => o.id !== t.id && o.category === t.category && Math.abs(o.amount - t.amount) <= t.amount * 0.15);
    if (repeats) continue;

    const label = t.merchant || t.description || t.category || 'an expense';
    flags.push({
      transactionId: t.id,
      reason: 'unusual_amount',
      severity: t.amount >= Math.max(25_000, median * 20) ? 'high' : 'medium',
      amount: t.amount,
      message: `${INR(t.amount)} for ${label} on ${t.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} is far above your usual expense of about ${INR(median)}.`,
      description: t.description ?? undefined,
      category: t.category,
      date: t.date.toISOString().slice(0, 10),
    });
  }

  flags.sort((a, b) => b.amount - a.amount);
  return { flags: flags.slice(0, 5) };
}

//  Agent: financial health score

export function scoreFinancialHealth(data: AgentData): AgentOutput {
  const f = figures(data);

  // Savings: 20% of income kept = full 30 points.
  const savingsScore = f.savingsRate === null ? 0 : Math.round(clamp(f.savingsRate * 150, 0, 30));
  // Debt: EMIs at half of income or more take all 20 points.
  const emiBurden = f.income > 0 ? f.totalEmi / f.income : 0;
  const debtScore = data.debts.length === 0
    ? 20
    : f.income > 0 ? Math.round(20 - clamp(emiBurden / 0.5, 0, 1) * 20) : 5;
  // Goals: having one is worth 10, progress on them the other 10.
  const avgProgress = data.goals.length > 0 ? data.goals.reduce((s, g) => s + g.saved / g.target, 0) / data.goals.length : 0;
  const goalScore = data.goals.length > 0 ? Math.round(10 + clamp(avgProgress, 0, 1) * 10) : 0;
  const incomeScore = f.income > 0 ? 15 : 0;
  // Emergency fund: three months of spending in the bank = full 15 points.
  const emergencyScore = Math.round(clamp(f.runwayMonths / 3, 0, 1) * 15);

  const score = savingsScore + debtScore + goalScore + incomeScore + emergencyScore;

  const weakest = [
    { score: savingsScore / 30, tip: 'raising your savings rate toward 20%' },
    { score: debtScore / 20, tip: 'bringing EMIs down to under a third of income' },
    { score: goalScore / 20, tip: 'setting and funding a savings goal' },
    { score: emergencyScore / 15, tip: 'building three months of expenses as an emergency fund' },
  ].sort((a, b) => a.score - b.score)[0];

  const recommendations: Recommendation[] = [];
  if (score < 40) {
    recommendations.push({
      type: 'health_tip',
      title: 'Financial Health Needs Attention',
      message: `Your health score is ${score}/100. The biggest lift would come from ${weakest.tip}.`,
      priority: 8,
    });
  } else if (score < 70) {
    recommendations.push({
      type: 'health_tip',
      title: 'Room to Improve',
      message: `Your health score is ${score}/100. Next step: ${weakest.tip}.`,
      priority: 4,
    });
  }

  return {
    score,
    recommendations,
    insights: [
      { category: 'health', label: 'Financial Health Score', value: score },
      ...(f.savingsRate === null ? [] : [{ category: 'health', label: 'Savings Rate (30 days)', value: pct(f.savingsRate * 100) }]),
      { category: 'health', label: 'Emergency Fund', value: `${f.runwayMonths.toFixed(1)} months` },
      { category: 'health', label: 'Loans You Owe', value: data.debts.length },
      { category: 'health', label: 'Active Goals', value: data.goals.length },
    ],
  };
}

//  Agent: investment suggestions

export function suggestInvestments(data: AgentData): AgentOutput {
  const f = figures(data);
  const recommendations: Recommendation[] = [];
  if (f.surplus <= 5000) return { recommendations };

  if (f.runwayMonths < 3) {
    recommendations.push({
      type: 'investment_tip',
      title: 'Build an Emergency Fund First',
      message: `You had ${INR(f.surplus)} left over in the last 30 days, but your balances cover about ${f.runwayMonths.toFixed(1)} months of spending. Park savings in a liquid fund or sweep FD until that reaches 3 months.`,
      priority: 6,
      actionLabel: 'Create Emergency Fund Goal',
    });
    return { recommendations };
  }

  recommendations.push({
    type: 'investment_tip',
    title: 'Put Your Surplus to Work',
    message: `You had ${INR(f.surplus)} left over in the last 30 days. A monthly SIP of about ${INR(f.surplus * 0.3)} in a diversified index fund would invest it without touching your spending.`,
    priority: 5,
    actionLabel: 'Explore Investments',
  });
  if (f.surplus > 25000 && data.investedValue === 0) {
    recommendations.push({
      type: 'investment_tip',
      title: 'No Investments Recorded',
      message: 'Your savings are all in accounts. Splitting new savings between a short-term FD and equity SIPs balances safety and growth.',
      priority: 4,
    });
  }
  return { recommendations };
}

//  Agent: borrowing capacity

export function assessBorrowing(data: AgentData): AgentOutput {
  const f = figures(data);
  const emiRatio = f.income > 0 ? f.totalEmi / f.income : 0;
  // Lenders commonly cap total EMIs near 40–50% of take-home pay.
  const headroom = Math.max(0, f.income * 0.4 - f.totalEmi);
  const likelihood = f.income > 0 ? Math.round(clamp(100 - (emiRatio / 0.5) * 70, 10, 95)) : 30;

  return {
    score: likelihood,
    insights: [
      { category: 'loan', label: 'Loan Approval Likelihood', value: `${likelihood}%` },
      { category: 'loan', label: 'EMI-to-Income Ratio', value: pct(emiRatio * 100) },
      { category: 'loan', label: 'Room for New EMI', value: INR(headroom) },
    ],
  };
}

//  Runners

const AGENTS: Array<[string, (data: AgentData) => AgentOutput]> = [
  ['goal-recommendation', analyseGoals],
  ['budget-optimization', analyseBudgets],
  ['spending-pattern', analyseSpendingPattern],
  ['bill-prediction', predictBills],
  ['fraud-detection', detectUnusualExpenses],
  ['financial-health-score', scoreFinancialHealth],
  ['investment-suggestion', suggestInvestments],
  ['loan-approval', assessBorrowing],
];

export function runAgentsOn(data: AgentData): AgentResult[] {
  return AGENTS.map(([name, fn]) => run(name, () => fn(data)));
}

export async function runAllAgents(userId: string): Promise<AgentResult[]> {
  return runAgentsOn(await loadAgentData(userId));
}

// Single-agent endpoints load the same data; a load failure rejects and the
// route answers 500.
export async function runGoalRecommendationAgent(userId: string): Promise<AgentResult> {
  const data = await loadAgentData(userId);
  return run('goal-recommendation', () => analyseGoals(data));
}
export async function runBudgetOptimizationAgent(userId: string): Promise<AgentResult> {
  const data = await loadAgentData(userId);
  return run('budget-optimization', () => analyseBudgets(data));
}
export async function runSpendingPatternAgent(userId: string): Promise<AgentResult> {
  const data = await loadAgentData(userId);
  return run('spending-pattern', () => analyseSpendingPattern(data));
}
export async function runBillPredictionAgent(userId: string): Promise<AgentResult> {
  const data = await loadAgentData(userId);
  return run('bill-prediction', () => predictBills(data));
}
export async function runFraudDetectionAgent(userId: string): Promise<AgentResult> {
  const data = await loadAgentData(userId);
  return run('fraud-detection', () => detectUnusualExpenses(data));
}
export async function runFinancialHealthScoreAgent(userId: string): Promise<AgentResult> {
  const data = await loadAgentData(userId);
  return run('financial-health-score', () => scoreFinancialHealth(data));
}
export async function runInvestmentSuggestionAgent(userId: string): Promise<AgentResult> {
  const data = await loadAgentData(userId);
  return run('investment-suggestion', () => suggestInvestments(data));
}
export async function runLoanApprovalAgent(userId: string): Promise<AgentResult> {
  const data = await loadAgentData(userId);
  return run('loan-approval', () => assessBorrowing(data));
}
