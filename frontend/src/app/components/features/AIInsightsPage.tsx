import React, { useMemo, useState } from 'react';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { Card } from '@/app/components/ui/card';
import { Brain, TrendingUp, Sparkles, DollarSign, ArrowRight, Zap, Target, PiggyBank, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

interface Insight {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  description: string;
  impact: string;
  impactColor: string;
}

export const AIInsightsPage: React.FC = () => {
  const { currency } = useApp();
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const fc = (n: number) => formatCurrencyAmount(Math.abs(n), currency, { maximumFractionDigits: 0 });

  const analysisData = useLiveQuery(async () => {
    const now = new Date(lastRefreshed);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [allTx, budgets, goals, loans] = await Promise.all([
      db.transactions.filter((t) => !t.deletedAt).toArray(),
      db.budgets.toArray(),
      db.goals.filter((g) => !g.deletedAt).toArray(),
      db.loans.filter((l) => !l.deletedAt && l.status === 'active').toArray(),
    ]);

    const thisMonth = allTx.filter((t) => new Date(t.date) >= thisMonthStart);
    const lastMonth = allTx.filter((t) => {
      const d = new Date(t.date);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });

    const expenses = (txs: typeof allTx) => txs.filter((t) => t.type === 'expense');
    const income = (txs: typeof allTx) => txs.filter((t) => t.type === 'income');
    const sum = (txs: typeof allTx) => txs.reduce((s, t) => s + t.amount, 0);

    const thisMonthExpense = sum(expenses(thisMonth));
    const lastMonthExpense = sum(expenses(lastMonth));
    const thisMonthIncome = sum(income(thisMonth));

    // Category breakdown this month
    const categoryTotals: Record<string, number> = {};
    expenses(thisMonth).forEach((t) => {
      categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + t.amount;
    });
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];

    // Budget breach detection
    const breachedBudgets = (budgets as any[]).filter((b) => {
      const spent = categoryTotals[b.category?.toLowerCase()] ?? 0;
      return spent > (b.amount ?? 0) * ((b.threshold ?? 85) / 100);
    });

    // Savings rate
    const savingsRate = thisMonthIncome > 0
      ? ((thisMonthIncome - thisMonthExpense) / thisMonthIncome) * 100
      : 0;

    // Goal progress
    const totalGoalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
    const totalGoalCurrent = goals.reduce((s, g) => s + g.currentAmount, 0);
    const goalPct = totalGoalTarget > 0 ? (totalGoalCurrent / totalGoalTarget) * 100 : 0;

    // Total active loan balance
    const totalLoanBalance = loans.reduce((s, l) => s + l.outstandingBalance, 0);

    // Month-over-month expense change
    const momChange = lastMonthExpense > 0
      ? ((thisMonthExpense - lastMonthExpense) / lastMonthExpense) * 100
      : 0;

    return {
      thisMonthExpense,
      lastMonthExpense,
      thisMonthIncome,
      savingsRate,
      topCategory,
      breachedBudgets,
      categoryTotals,
      goalPct,
      totalGoalTarget,
      totalGoalCurrent,
      totalLoanBalance,
      momChange,
      goalsCount: goals.length,
      loansCount: loans.length,
    };
  }, [lastRefreshed]);

  const insights = useMemo<Insight[]>(() => {
    if (!analysisData) return [];
    const {
      thisMonthExpense, lastMonthExpense, savingsRate,
      topCategory, breachedBudgets, categoryTotals, momChange,
    } = analysisData;
    const list: Insight[] = [];

    // Insight 1: MoM spending change
    if (lastMonthExpense > 0) {
      const increased = momChange > 0;
      list.push({
        id: 'mom',
        title: increased ? 'Spending Increased This Month' : 'Great Job — Spending Down',
        icon: TrendingUp,
        color: increased ? 'text-rose-500 bg-rose-500/10' : 'text-emerald-500 bg-emerald-500/10',
        description: increased
          ? `Your expenses this month are ${Math.abs(momChange).toFixed(0)}% higher than last month (${fc(thisMonthExpense)} vs ${fc(lastMonthExpense)}). Review your top categories to find reductions.`
          : `Your expenses this month are ${Math.abs(momChange).toFixed(0)}% lower than last month (${fc(thisMonthExpense)} vs ${fc(lastMonthExpense)}). Keep up the disciplined spending!`,
        impact: increased ? 'Needs Attention' : 'Positive Trend',
        impactColor: increased
          ? 'text-rose-600 bg-rose-50 border-rose-200'
          : 'text-emerald-600 bg-emerald-50 border-emerald-200',
      });
    }

    // Insight 2: Top category spending
    if (topCategory) {
      list.push({
        id: 'top-cat',
        title: `Top Spend: ${topCategory[0]}`,
        icon: DollarSign,
        color: 'text-amber-500 bg-amber-500/10',
        description: `Your highest expense category this month is "${topCategory[0]}" at ${fc(topCategory[1])}. ${topCategory[1] > (lastMonthExpense * 0.4) ? 'This single category accounts for a large share of your monthly budget — consider setting a specific limit.' : 'Track this category closely to keep it within budget.'}`,
        impact: topCategory[1] > (lastMonthExpense * 0.4) ? 'High Share' : 'Track it',
        impactColor: 'text-amber-600 bg-amber-50 border-amber-200',
      });
    }

    // Insight 3: Savings rate
    list.push({
      id: 'savings',
      title: savingsRate >= 20 ? 'Healthy Savings Rate' : 'Boost Your Savings Rate',
      icon: PiggyBank,
      color: savingsRate >= 20 ? 'text-emerald-500 bg-emerald-500/10' : 'text-indigo-500 bg-indigo-500/10',
      description: savingsRate > 0
        ? `You are saving ${savingsRate.toFixed(1)}% of your income this month. ${savingsRate >= 20 ? 'Excellent — you are on track with the 20% savings benchmark.' : 'Aim for at least 20% savings rate to build a strong financial cushion.'}`
        : 'No income recorded this month yet. Add income transactions to track your savings rate.',
      impact: savingsRate >= 20 ? 'On Target' : 'Needs Boost',
      impactColor: savingsRate >= 20
        ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
        : 'text-indigo-600 bg-indigo-50 border-indigo-200',
    });

    // Insight 4: Budget breaches
    if (breachedBudgets.length > 0) {
      list.push({
        id: 'budget-breach',
        title: `${breachedBudgets.length} Budget${breachedBudgets.length > 1 ? 's' : ''} Near Limit`,
        icon: AlertTriangle,
        color: 'text-rose-500 bg-rose-500/10',
        description: `The following categories are approaching or have breached their limits this month: ${breachedBudgets.map((b: any) => `${b.category} (${fc(categoryTotals[b.category?.toLowerCase()] ?? 0)}/${fc(b.amount)})`).join(', ')}. Review and adjust your spending to stay on track.`,
        impact: 'Action Required',
        impactColor: 'text-rose-600 bg-rose-50 border-rose-200',
      });
    }

    // Insight 5: Recurring potential (categories with 4+ transactions)
    const catFrequency: Record<string, number> = {};
    Object.keys(categoryTotals).forEach((cat) => {
      catFrequency[cat] = 0;
    });
    if (analysisData.categoryTotals) {
      const highFreqCat = Object.entries(catFrequency).find(([, n]) => n >= 4);
      if (highFreqCat) {
        list.push({
          id: 'recurring',
          title: `Recurring Pattern in ${highFreqCat[0]}`,
          icon: Zap,
          color: 'text-purple-500 bg-purple-500/10',
          description: `You have ${highFreqCat[1]} transactions in "${highFreqCat[0]}" this month. Consider converting repeating payments to Recurring Transactions for better tracking and auto-reminders.`,
          impact: 'Optimize',
          impactColor: 'text-purple-600 bg-purple-50 border-purple-200',
        });
      }
    }

    return list.slice(0, 6);
  }, [analysisData, currency]);

  if (!analysisData) {
    return (
      <CenteredLayout>
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </CenteredLayout>
    );
  }

  const { savingsRate, goalPct, totalGoalTarget, totalGoalCurrent, totalLoanBalance, goalsCount, loansCount, thisMonthIncome } = analysisData;
  const emergencyFundMonths = thisMonthIncome > 0 && analysisData.thisMonthExpense > 0
    ? totalGoalCurrent / analysisData.thisMonthExpense
    : 0;

  return (
    <CenteredLayout>
      <div className="w-full">
        <div className="pb-4 lg:pb-6">
          <PageHeader
            title="AI Insights"
            subtitle="Real-time spending analysis and personalized financial recommendations"
            icon={<Brain className="text-purple-600" size={20} />}
          />
        </div>

        {/* Hero Section */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-800 rounded-[32px] p-8 shadow-xl relative overflow-hidden mb-8 group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/20 text-white mb-4">
                <Sparkles size={10} /> Live Transaction Analysis
              </span>
              <h3 className="text-2xl font-black text-white tracking-tight mb-2">
                {insights.length > 0 ? `${insights.length} Insights from Your Data` : 'Add Transactions to Get Insights'}
              </h3>
              <p className="text-purple-100 text-sm leading-relaxed font-medium">
                Insights are computed from your actual transactions, budgets, and goals — updated in real time as you add data.
              </p>
            </div>
            <button
              onClick={() => setLastRefreshed(new Date())}
              className="bg-white text-indigo-900 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-purple-50 active:scale-95 transition-all shadow-lg text-center shrink-0"
            >
              Refresh Analysis
            </button>
          </div>
        </div>

        {/* Insights Grid */}
        {insights.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-4 py-16 text-center mb-8">
            <Brain className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="text-sm font-semibold text-slate-500">No insights yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add transactions, set budgets, and create goals to unlock personalized insights.</p>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
          >
            {insights.map((insight) => {
              const Icon = insight.icon;
              return (
                <motion.div key={insight.id} variants={itemVariants}>
                  <Card variant="glass" className="h-full border-white/40 flex flex-col p-8 hover:shadow-xl transition-shadow duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${insight.color}`}>
                        <Icon size={22} />
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${insight.impactColor}`}>
                        {insight.impact}
                      </span>
                    </div>
                    <h4 className="text-lg font-black text-gray-900 mb-2 tracking-tight">{insight.title}</h4>
                    <p className="text-gray-500 text-sm font-medium leading-relaxed flex-1">
                      {insight.description}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Financial Objectives Panel */}
        <div className="bg-slate-50 border border-slate-100 rounded-[32px] p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
              <Target size={20} className="text-indigo-600" />
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Financial Snapshot</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Savings Rate */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100/55 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Savings Rate (This Month)</p>
              <h4 className="text-xl font-black text-slate-900">{savingsRate > 0 ? `${savingsRate.toFixed(1)}%` : '—'}</h4>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${savingsRate >= 20 ? 'bg-emerald-500' : savingsRate >= 10 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(savingsRate, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">
                {savingsRate >= 20 ? 'On track — above 20% target' : `Target: 20% (${savingsRate > 0 ? (20 - savingsRate).toFixed(1) + '% gap' : 'add income to track'})`}
              </p>
            </div>

            {/* Goals Progress */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100/55 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Goals Progress {goalsCount > 0 ? `(${goalsCount} active)` : ''}
              </p>
              <h4 className="text-xl font-black text-slate-900">{goalPct > 0 ? `${goalPct.toFixed(0)}%` : '—'}</h4>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${Math.min(goalPct, 100)}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">
                {totalGoalTarget > 0
                  ? `${fc(totalGoalCurrent)} saved of ${fc(totalGoalTarget)} target`
                  : 'No goals set yet — create your first goal'}
              </p>
            </div>

            {/* Loan Exposure */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100/55 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Active Loan Exposure {loansCount > 0 ? `(${loansCount} loans)` : ''}
              </p>
              <h4 className="text-xl font-black text-slate-900">{totalLoanBalance > 0 ? fc(totalLoanBalance) : '—'}</h4>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${totalLoanBalance === 0 ? 'bg-emerald-500' : 'bg-rose-400'}`}
                  style={{ width: totalLoanBalance === 0 ? '0%' : '100%' }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">
                {totalLoanBalance === 0
                  ? loansCount > 0 ? 'All loans cleared — great work!' : 'No active loans'
                  : `Outstanding balance across all loans`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </CenteredLayout>
  );
};

export default AIInsightsPage;
