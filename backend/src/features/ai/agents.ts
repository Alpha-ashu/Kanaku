/**
 * AI Agents System
 * 10 specialized agents that run on-demand or on schedule.
 * Each agent analyzes user financial data and produces structured insights.
 */

import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { getFinancialBaseline } from './financial-baseline';

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
  reason: string;
  severity: 'low' | 'medium' | 'high';
  amount: number;
}

export interface BillPrediction {
  merchant: string;
  predictedAmount: number;
  predictedDate: string;
  confidence: number;
}

//  Helper: Get date range for analysis 

function dateRangeStart(daysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d;
}

async function safeQuery<T>(fn: () => Promise<T> | T, fallback: any): Promise<any> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

//  Agent 1: Expense Categorization Agent 

export async function runExpenseCategorizationAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    // Find uncategorized transactions and auto-categorize them
    const { categorizeTextForUser } = await import('../categorization/categorization.engine');

    const uncategorized = await safeQuery(() => (prisma as any).transaction.findMany({
      where: {
        userId,
        OR: [{ category: '' }, { category: 'Others' }],
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    }), []);

    let updated = 0;
    for (const tx of uncategorized) {
      if (!tx.description) continue;
      try {
        const result = await categorizeTextForUser(userId, tx.description);
        if (result.confidence > 0.7) {
          await (prisma as any).transaction.update({
            where: { id: tx.id },
            data: { category: result.category, subcategory: result.subcategory },
          });
          updated++;
        }
      } catch { /* skip individual failures */ }
    }

    return {
      agentName: 'expense-categorization',
      status: 'success',
      output: {
        insights: [{ category: 'categorization', label: 'Auto-categorized', value: updated }],
      },
      executionMs: Date.now() - start,
    };
  } catch (error: any) {
    return { agentName: 'expense-categorization', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Agent 2: Goal Recommendation Agent 

export async function runGoalRecommendationAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    const [transactions, goals, baseline] = await Promise.all([
      safeQuery(() => (prisma as any).transaction.findMany({
        where: { userId, date: { gte: dateRangeStart(30) } },
        select: { type: true, amount: true },
      }), []),
      safeQuery(() => (prisma as any).goal?.findMany?.({ where: { userId } }), []),
      getFinancialBaseline(userId),
    ]);

    const txIncome = transactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const expenses = transactions.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
    // Prefer observed income; fall back to declared onboarding income so a
    // new user still gets a meaningful savings rate.
    const income = txIncome > 0 ? txIncome : baseline.declaredMonthlyIncome;
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

    const recommendations: Recommendation[] = [];

    if (income > 0 && savingsRate < 10) {
      recommendations.push({
        type: 'goal_suggestion',
        title: 'Low Savings Rate Detected',
        message: `Your savings rate is ${savingsRate.toFixed(1)}%. Consider setting up a savings goal to reach 20%.`,
        priority: 8,
        actionLabel: 'Create Savings Goal',
      });
    }

    if (goals.length === 0 && income > 0) {
      recommendations.push({
        type: 'goal_suggestion',
        title: 'No Financial Goals Set',
        message: `You have monthly income of ${income.toFixed(0)}. Set a goal to keep you motivated.`,
        priority: 6,
        actionLabel: 'Add Goal',
      });
    }

    return {
      agentName: 'goal-recommendation',
      status: 'success',
      output: {
        recommendations,
        insights: [
          { category: 'savings', label: 'Monthly Savings Rate', value: `${savingsRate.toFixed(1)}%` },
        ],
      },
      executionMs: Date.now() - start,
    };
  } catch (error: any) {
    return { agentName: 'goal-recommendation', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Agent 3: Budget Optimization Agent 

export async function runBudgetOptimizationAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    const transactions = await safeQuery(() => (prisma as any).transaction.findMany({
      where: { userId, type: 'expense', date: { gte: dateRangeStart(30) } },
      select: { amount: true, category: true },
    }), []);

    const income = await safeQuery(() => (prisma as any).transaction.aggregate({
      where: { userId, type: 'income', date: { gte: dateRangeStart(30) } },
      _sum: { amount: true },
    }), { _sum: { amount: 0 } });

    const baseline = await getFinancialBaseline(userId);
    const txMonthlyIncome = Number(income._sum?.amount ?? 0);
    // Fall back to declared onboarding income when there is no income history.
    const monthlyIncome = txMonthlyIncome > 0 ? txMonthlyIncome : baseline.declaredMonthlyIncome;

    // Group by category
    const byCategory: Record<string, number> = {};
    transactions.forEach((t: any) => {
      const cat = t.category || 'Others';
      byCategory[cat] = (byCategory[cat] || 0) + Number(t.amount);
    });

    const recommendations: Recommendation[] = [];

    // 50/30/20 rule check
    const totalExpense = Object.values(byCategory).reduce((s, v) => s + v, 0);
    if (monthlyIncome > 0 && totalExpense > monthlyIncome * 0.8) {
      recommendations.push({
        type: 'budget_alert',
        title: 'Spending Above 80% of Income',
        message: `This month you spent ${totalExpense.toFixed(0)} vs ${monthlyIncome.toFixed(0)} income. Try to keep spending below 80%.`,
        priority: 9,
      });
    }

    // Flag top over-spending category
    const sorted = Object.entries(byCategory).sort(([, a], [, b]) => b - a);
    if (sorted.length > 0 && monthlyIncome > 0) {
      const [topCat, topAmt] = sorted[0];
      const pct = (topAmt / monthlyIncome) * 100;
      if (pct > 40) {
        recommendations.push({
          type: 'budget_alert',
          title: `High ${topCat} Spending`,
          message: `${topCat} takes up ${pct.toFixed(0)}% of your income this month (${topAmt.toFixed(0)}).`,
          priority: 7,
        });
      }
    }

    return {
      agentName: 'budget-optimization',
      status: 'success',
      output: { recommendations },
      executionMs: Date.now() - start,
    };
  } catch (error: any) {
    return { agentName: 'budget-optimization', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Agent 4: Spending Pattern Agent 

export async function runSpendingPatternAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    const transactions = await safeQuery(() => (prisma as any).transaction.findMany({
      where: { userId, type: 'expense', date: { gte: dateRangeStart(90) } },
      select: { amount: true, category: true, date: true, merchant: true },
    }), []);

    const byCategory: Record<string, { total: number; count: number }> = {};
    transactions.forEach((t: any) => {
      const cat = t.category || 'Others';
      if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
      byCategory[cat].total += Number(t.amount);
      byCategory[cat].count++;
    });

    const insights: Insight[] = Object.entries(byCategory)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5)
      .map(([cat, data]) => ({
        category: 'spending',
        label: cat,
        value: `${data.total.toFixed(0)} (${data.count} txns)`,
      }));

    return {
      agentName: 'spending-pattern',
      status: 'success',
      output: { insights },
      executionMs: Date.now() - start,
    };
  } catch (error: any) {
    return { agentName: 'spending-pattern', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Agent 5: Bill Prediction Agent 

export async function runBillPredictionAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    // Look for recurring transactions (same merchant, similar amount, ~30 day intervals)
    const transactions = await safeQuery(() => (prisma as any).transaction.findMany({
      where: { userId, type: 'expense', date: { gte: dateRangeStart(120) } },
      select: { merchant: true, amount: true, date: true, category: true },
      orderBy: { date: 'asc' },
    }), []);

    const byMerchant: Record<string, Array<{ amount: number; date: Date }>> = {};
    transactions.forEach((t: any) => {
      if (!t.merchant) return;
      const key = t.merchant.toLowerCase();
      if (!byMerchant[key]) byMerchant[key] = [];
      byMerchant[key].push({ amount: Number(t.amount), date: new Date(t.date) });
    });

    const predictions: BillPrediction[] = [];
    const now = new Date();

    for (const [merchant, entries] of Object.entries(byMerchant)) {
      if (entries.length < 2) continue;

      const sorted = entries.sort((a, b) => a.date.getTime() - b.date.getTime());
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        intervals.push((sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / (1000 * 60 * 60 * 24));
      }

      const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      const isMonthly = avgInterval >= 25 && avgInterval <= 35;

      if (isMonthly) {
        const lastDate = sorted[sorted.length - 1].date;
        const nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + Math.round(avgInterval));

        if (nextDate > now) {
          const avgAmount = sorted.slice(-3).reduce((s, e) => s + e.amount, 0) / Math.min(3, sorted.length);
          predictions.push({
            merchant,
            predictedAmount: avgAmount,
            predictedDate: nextDate.toISOString().slice(0, 10),
            confidence: Math.min(0.95, 0.6 + entries.length * 0.05),
          });
        }
      }
    }

    return {
      agentName: 'bill-prediction',
      status: 'success',
      output: { predictions },
      executionMs: Date.now() - start,
    };
  } catch (error: any) {
    return { agentName: 'bill-prediction', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Agent 6: Fraud Detection Agent 

export async function runFraudDetectionAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    const transactions = await safeQuery(() => (prisma as any).transaction.findMany({
      where: { userId, date: { gte: dateRangeStart(30) } },
      select: { id: true, amount: true, date: true, merchant: true, type: true },
      orderBy: { date: 'desc' },
    }), []);

    if (transactions.length === 0) {
      return { agentName: 'fraud-detection', status: 'success', output: { flags: [] }, executionMs: Date.now() - start };
    }

    const amounts = transactions.map((t: any) => Number(t.amount));
    const mean = amounts.reduce((s: number, v: number) => s + v, 0) / amounts.length;
    const stddev = Math.sqrt(amounts.reduce((s: number, v: number) => s + Math.pow(v - mean, 2), 0) / amounts.length);

    const flags: FraudFlag[] = [];

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const date = new Date(tx.date);
      const hour = date.getHours();

      // Unusual amount: > 3 standard deviations
      if (amount > mean + 3 * stddev && amount > 5000) {
        flags.push({
          transactionId: tx.id,
          reason: 'unusual_amount',
          severity: amount > mean + 5 * stddev ? 'high' : 'medium',
          amount,
        });
      }

      // Late-night unusual transaction (2am-5am)
      if (hour >= 2 && hour <= 5 && amount > mean + stddev && amount > 1000) {
        flags.push({
          transactionId: tx.id,
          reason: 'unusual_time',
          severity: 'low',
          amount,
        });
      }
    }

    return {
      agentName: 'fraud-detection',
      status: 'success',
      output: { flags },
      executionMs: Date.now() - start,
    };
  } catch (error: any) {
    return { agentName: 'fraud-detection', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Agent 7: Financial Health Score Agent 

export async function runFinancialHealthScoreAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    const [incomeAgg, expenseAgg, goals, loans, baseline] = await Promise.all([
      safeQuery(() => (prisma as any).transaction.aggregate({
        where: { userId, type: 'income', date: { gte: dateRangeStart(30) } },
        _sum: { amount: true },
      }), { _sum: { amount: 0 } }),
      safeQuery(() => (prisma as any).transaction.aggregate({
        where: { userId, type: 'expense', date: { gte: dateRangeStart(30) } },
        _sum: { amount: true },
      }), { _sum: { amount: 0 } }),
      safeQuery(() => (prisma as any).goal?.findMany?.({ where: { userId } }) ?? [], []),
      safeQuery(() => (prisma as any).loan?.findMany?.({ where: { userId, status: 'active' } }) ?? [], []),
      getFinancialBaseline(userId),
    ]);

    const txIncome = Number(incomeAgg._sum?.amount ?? 0);
    const expenses = Number(expenseAgg._sum?.amount ?? 0);
    // Prefer observed income; fall back to declared onboarding income so the
    // score is grounded in the user's real financial profile from day one.
    const income = txIncome > 0 ? txIncome : baseline.declaredMonthlyIncome;
    const savingsRate = income > 0 ? ((income - expenses) / income) : 0;

    // Emergency-fund coverage: how many months of income the user holds in
    // their accounts today. Rewards real liquidity even before any
    // transactions exist.
    const monthsOfRunway = income > 0 ? baseline.totalBalance / income : 0;

    // Scoring (0-100)
    const savingsScore = Math.max(0, Math.min(30, Math.round(savingsRate * 150))); // 20% savings = 30pts
    const debtScore = loans.length === 0 ? 20 : Math.max(0, 20 - loans.length * 3);
    const goalScore = goals.length > 0 ? Math.min(20, goals.length * 5) : 0;
    const consistencyScore = income > 0 ? 15 : 0; // Has a known income (observed or declared)
    // Emergency score: up to 15 pts for >=3 months of runway, scaled otherwise.
    const emergencyScore = Math.max(0, Math.min(15, Math.round((monthsOfRunway / 3) * 15)));

    const total = savingsScore + debtScore + goalScore + consistencyScore + emergencyScore;

    const recommendations: Recommendation[] = [];
    if (total < 40) {
      recommendations.push({
        type: 'health_tip',
        title: 'Financial Health Needs Attention',
        message: 'Your financial health score is below 40. Focus on reducing expenses and building savings.',
        priority: 9,
      });
    } else if (total < 70) {
      recommendations.push({
        type: 'health_tip',
        title: 'Good Progress!',
        message: `Your financial health score is ${total}. Keep building your savings and reducing debt.`,
        priority: 4,
      });
    }

    return {
      agentName: 'financial-health-score',
      status: 'success',
      output: {
        score: total,
        recommendations,
        insights: [
          { category: 'health', label: 'Financial Health Score', value: total },
          { category: 'health', label: 'Savings Rate', value: `${(savingsRate * 100).toFixed(1)}%` },
          { category: 'health', label: 'Months of Runway', value: monthsOfRunway.toFixed(1) },
          { category: 'health', label: 'Active Loans', value: loans.length },
          { category: 'health', label: 'Active Goals', value: goals.length },
        ],
      },
      executionMs: Date.now() - start,
    };
  } catch (error: any) {
    return { agentName: 'financial-health-score', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Agent 8: Investment Suggestion Agent 

export async function runInvestmentSuggestionAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    const [incomeAgg, expenseAgg, baseline] = await Promise.all([
      safeQuery(() => (prisma as any).transaction.aggregate({
        where: { userId, type: 'income', date: { gte: dateRangeStart(30) } },
        _sum: { amount: true },
      }), { _sum: { amount: 0 } }),
      safeQuery(() => (prisma as any).transaction.aggregate({
        where: { userId, type: 'expense', date: { gte: dateRangeStart(30) } },
        _sum: { amount: true },
      }), { _sum: { amount: 0 } }),
      getFinancialBaseline(userId),
    ]);

    const txIncome = Number(incomeAgg._sum?.amount ?? 0);
    const income = txIncome > 0 ? txIncome : baseline.declaredMonthlyIncome;
    const expenses = Number(expenseAgg._sum?.amount ?? 0);
    const surplus = income - expenses;

    const recommendations: Recommendation[] = [];
    if (surplus > 5000) {
      recommendations.push({ type: 'investment_tip', title: 'Consider SIP Investment', message: `You have ${surplus.toFixed(0)} surplus this month. Consider starting a SIP of ${Math.round(surplus * 0.3)} in a mutual fund.`, priority: 6, actionLabel: 'Explore Investments' });
    }
    if (surplus > 25000) {
      recommendations.push({ type: 'investment_tip', title: 'FD Opportunity', message: 'With your surplus, a short-term Fixed Deposit (6-12 months) could earn 6-7% returns.', priority: 5 });
    }

    return { agentName: 'investment-suggestion', status: 'success', output: { recommendations }, executionMs: Date.now() - start };
  } catch (error: any) {
    return { agentName: 'investment-suggestion', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Agent 9: Loan Approval Heuristic 

export async function runLoanApprovalAgent(userId: string): Promise<AgentResult> {
  const start = Date.now();
  try {
    const [incomeAgg, loans, baseline] = await Promise.all([
      safeQuery(() => (prisma as any).transaction.aggregate({
        where: { userId, type: 'income', date: { gte: dateRangeStart(90) } },
        _sum: { amount: true },
      }), { _sum: { amount: 0 } }),
      safeQuery(() => (prisma as any).loan?.findMany?.({ where: { userId, status: 'active' }, select: { principalAmount: true } }) ?? [], []),
      getFinancialBaseline(userId),
    ]);

    const txMonthlyIncome = Number(incomeAgg._sum?.amount ?? 0) / 3;
    // Fall back to declared onboarding income so DTI/EMI are realistic for
    // users without 90 days of income history.
    const avgMonthlyIncome = txMonthlyIncome > 0 ? txMonthlyIncome : baseline.declaredMonthlyIncome;
    const totalDebt = loans.reduce((s: number, l: any) => s + Number(l.principalAmount), 0);
    // DTI is undefined without income and without debt — report 0 rather than
    // a misleading 1.00 when the user simply has no loans.
    const debtToIncomeRatio = avgMonthlyIncome > 0
      ? totalDebt / avgMonthlyIncome
      : (totalDebt > 0 ? 1 : 0);

    let approvalLikelihood = avgMonthlyIncome > 0 ? 100 : 50;
    approvalLikelihood -= Math.min(60, debtToIncomeRatio * 30);
    approvalLikelihood = Math.max(0, Math.round(approvalLikelihood));

    const insights: Insight[] = [
      { category: 'loan', label: 'Loan Approval Likelihood', value: `${approvalLikelihood}%` },
      { category: 'loan', label: 'Debt-to-Income Ratio', value: debtToIncomeRatio.toFixed(2) },
      { category: 'loan', label: 'Suggested Max Monthly EMI', value: `${Math.round(avgMonthlyIncome * 0.3)}` },
    ];

    return { agentName: 'loan-approval', status: 'success', output: { score: approvalLikelihood, insights }, executionMs: Date.now() - start };
  } catch (error: any) {
    return { agentName: 'loan-approval', status: 'error', error: error.message, executionMs: Date.now() - start };
  }
}

//  Run all agents 

export async function runAllAgents(userId: string): Promise<AgentResult[]> {
  const agentFns = [
    runExpenseCategorizationAgent,
    runGoalRecommendationAgent,
    runBudgetOptimizationAgent,
    runSpendingPatternAgent,
    runBillPredictionAgent,
    runFraudDetectionAgent,
    runFinancialHealthScoreAgent,
    runInvestmentSuggestionAgent,
    runLoanApprovalAgent,
  ];

  return Promise.all(agentFns.map(fn => fn(userId)));
}

