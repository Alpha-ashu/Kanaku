import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';

// NOTE: GET /reports/export/pdf and /reports/export/excel used to live here.
//
// They were stubs: each ran a full unbounded transaction query, threw the result
// away, and returned a hard-coded literal — `Buffer.from('%PDF-1.4 ... PDF
// content mock ...')` and `Buffer.from('Excel XML structure / Mock xlsx
// content')`. Any caller received a corrupt file plus a table scan.
//
// Nothing in the app called them: Reports.tsx builds its own PDF (via
// buildStatementReportPdf) and its own spreadsheet client-side. Rather than
// implement server-side generation nobody asked for, the endpoints and their
// unused api.ts wrappers were removed. The `pdfExport` / `excelExport`
// sub-feature flags still gate the client-side buttons and are untouched.

/** Hard cap on an export. Prevents an unbounded scan of a large history. */
const EXPORT_ROW_LIMIT = 10_000;

// ── CSV Export (csvExport sub-feature) ───────────────────────────────────────
export const exportCSV = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactions = await prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      orderBy: { date: 'desc' },
      take: EXPORT_ROW_LIMIT,
    });

    const headers = ['ID', 'Date', 'Type', 'Category', 'Amount', 'Description'];
    const rows = transactions.map((t) => [
      t.id,
      t.date.toISOString(),
      t.type,
      t.category,
      t.amount.toString(),
      t.description || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((val) => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=kanaku_report_${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

// ── AI Insights Report (aiInsightsReport sub-feature) ───────────────────────
export const getAIInsights = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const transactions = await prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      orderBy: { date: 'desc' },
      take: 500,
    });

    const expenses = transactions.filter((t) => t.type === 'expense');
    const incomes = transactions.filter((t) => t.type === 'income');

    const totalExpenses = expenses.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalIncome = incomes.reduce((sum, t) => sum + Number(t.amount), 0);
    const netSavings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netSavings / totalIncome) * 100)) : 0;

    const insights: Array<{ id: string; title: string; description: string; impact: 'high' | 'medium' | 'low' }> = [];

    // 1. Top Category Breakdown
    const categoryTotals: Record<string, number> = {};
    for (const exp of expenses) {
      const cat = exp.category || 'Uncategorized';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(exp.amount);
    }
    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

    if (sortedCategories.length > 0 && totalExpenses > 0) {
      const [topCategory, topAmount] = sortedCategories[0];
      const topPct = Math.round((topAmount / totalExpenses) * 100);
      insights.push({
        id: 'top-category',
        title: `Primary Spending: ${topCategory}`,
        description: `${topCategory} accounts for ${topPct}% of your total recorded expenses (${topAmount.toFixed(2)}).`,
        impact: topPct > 40 ? 'high' : 'medium',
      });
    }

    // 2. Spending Velocity (30-day velocity comparison)
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const recentExpenses = expenses.filter((t) => now - new Date(t.date).getTime() <= thirtyDaysMs);
    const priorExpenses = expenses.filter((t) => {
      const diff = now - new Date(t.date).getTime();
      return diff > thirtyDaysMs && diff <= 2 * thirtyDaysMs;
    });

    const recentSum = recentExpenses.reduce((sum, t) => sum + Number(t.amount), 0);
    const priorSum = priorExpenses.reduce((sum, t) => sum + Number(t.amount), 0);

    if (priorSum > 0) {
      const changePct = Math.round(((recentSum - priorSum) / priorSum) * 100);
      const isIncrease = changePct > 0;
      insights.push({
        id: 'spending-velocity',
        title: `Monthly Spending Velocity (${isIncrease ? '+' : ''}${changePct}%)`,
        description: `You spent ${recentSum.toFixed(2)} in the last 30 days compared to ${priorSum.toFixed(2)} in the prior 30 days.`,
        impact: Math.abs(changePct) > 20 ? 'high' : 'low',
      });
    } else if (recentSum > 0) {
      insights.push({
        id: 'spending-velocity',
        title: 'Monthly Spending Velocity',
        description: `You have recorded ${recentSum.toFixed(2)} in expenses over the last 30 days.`,
        impact: 'medium',
      });
    }

    // 3. Cashflow and Savings Health
    if (totalIncome > 0) {
      insights.push({
        id: 'cashflow-health',
        title: `Net Savings Rate: ${savingsRate}%`,
        description: netSavings >= 0
          ? `Positive cash flow of ${netSavings.toFixed(2)}. You are saving ${savingsRate}% of recorded income.`
          : `Deficit of ${Math.abs(netSavings).toFixed(2)}. Expenses exceed income; consider reviewing discretionary categories.`,
        impact: netSavings >= 0 ? 'low' : 'high',
      });
    } else if (totalExpenses > 0) {
      insights.push({
        id: 'cashflow-health',
        title: 'Income Tracking Opportunity',
        description: `Recorded ${totalExpenses.toFixed(2)} in expenses with no income logged. Adding income accounts improves forecasting accuracy.`,
        impact: 'medium',
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: 'getting-started',
        title: 'Awaiting Financial Data',
        description: 'Log your first income and expense transactions to generate personalized financial insights.',
        impact: 'low',
      });
    }

    res.json({ success: true, data: { insights } });
  } catch (error) {
    next(error);
  }
};

// ── Financial Forecasting (forecasting sub-feature) ──────────────────────────
export const getForecast = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const accounts = await prisma.account.findMany({
      where: { userId, deletedAt: null, isActive: true },
    });

    const currentBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

    // Compute past 90-day average monthly net burn/savings rate
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentTx = await prisma.transaction.findMany({
      where: { userId, deletedAt: null, date: { gte: ninetyDaysAgo } },
      select: { type: true, amount: true },
    });

    const recentIncome = recentTx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const recentExpense = recentTx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const monthsElapsed = Math.max(1, 3);
    const monthlyNetCashflow = (recentIncome - recentExpense) / monthsElapsed;

    const forecastPoints: any[] = [];
    const now = new Date();

    for (let i = 0; i <= 6; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      
      // If user has recorded transactions, project cashflow; otherwise conservative default
      let expected: number;
      let optimistic: number;
      let conservative: number;

      if (recentTx.length > 0) {
        expected = Math.max(0, currentBalance + monthlyNetCashflow * i);
        optimistic = Math.max(0, currentBalance + (monthlyNetCashflow >= 0 ? monthlyNetCashflow * 1.15 : monthlyNetCashflow * 0.85) * i);
        conservative = Math.max(0, currentBalance + (monthlyNetCashflow >= 0 ? monthlyNetCashflow * 0.85 : monthlyNetCashflow * 1.15) * i);
      } else {
        expected = currentBalance * Math.pow(1.01, i);
        optimistic = currentBalance * Math.pow(1.02, i);
        conservative = currentBalance * Math.pow(1.002, i);
      }

      forecastPoints.push({
        date: forecastDate.toISOString(),
        expected: Math.round(expected * 100) / 100,
        optimistic: Math.round(optimistic * 100) / 100,
        conservative: Math.round(conservative * 100) / 100,
      });
    }

    res.json({
      success: true,
      data: {
        currentBalance: Math.round(currentBalance * 100) / 100,
        monthlyNetCashflow: Math.round(monthlyNetCashflow * 100) / 100,
        forecast: forecastPoints,
      },
    });
  } catch (error) {
    next(error);
  }
};
