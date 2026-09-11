import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { PageHeader } from '@/app/components/ui/PageHeader';
import {
 TrendingUp, CreditCard, Wallet, Banknote, Smartphone,
 ArrowUpRight, ArrowDownLeft, Target, TrendingDown,
 AlertCircle, Calendar, Users, BarChart3, ChevronRight,
 Clock, CheckCircle2, AlertTriangle, BadgeDollarSign,
 HandCoins, Activity, Landmark, Receipt, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { TimeFilter, TimeFilterPeriod, filterByTimePeriod, getPeriodLabel } from '@/app/components/ui/TimeFilter';
import { fetchMultipleQuotes, getStockDataSetupHint, StockQuote } from '@/lib/stockApi';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { formatLocalDate } from '@/lib/dateUtils';
import { buildTransactionAggregation } from '@/lib/transactionAggregation';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { db } from '@/lib/database';
import { useLiveQuery } from 'dexie-react-hooks';
import {
 getInvestmentDisplayName,
 getInvestmentMetrics,
 getRequiredInvestmentQuoteSymbols,
 isClosedInvestment,
} from '@/lib/investmentUtils';
import { AIInsightsCard } from '@/app/components/shared/AIInsightsCard';
import { CardNetworkLogo, getBankCardLogo } from '@/app/components/ui/AccountLogos';
import { calculateAccountTotalBalance, calculateNetWorth, parseMonetary, roundToMoney } from '@/lib/financialMath';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { backendSyncService } from '@/lib/backend-sync-service';
import { calculateTaxSummary } from '@/lib/taxService';
import { AppArcGauge } from '@/app/components/ui/AppArcGauge';
import { AppMiniGauge } from '@/app/components/ui/AppMiniGauge';
import { AppDateStrip } from '@/app/components/ui/AppDateStrip';

interface DashboardProps {
 setCurrentPage?: (page: string) => void;
}



const getCardStyle = (account: any) => {
 const CARD_COLORS = [
 { id: 'midnight', bg: 'bg-[#0F172A]', glow: 'bg-indigo-500/10', color: '#0F172A' },
 { id: 'emerald', bg: 'bg-[#064E3B]', glow: 'bg-emerald-500/10', color: '#064E3B' },
 { id: 'rose', bg: 'bg-[#4C0519]', glow: 'bg-rose-500/10', color: '#4C0519' },
 { id: 'amber', bg: 'bg-[#451A03]', glow: 'bg-amber-500/10', color: '#451A03' },
 { id: 'violet', bg: 'bg-[#2E1065]', glow: 'bg-violet-500/10', color: '#2E1065' },
 { id: 'blue', bg: 'bg-[#1E3A8A]', glow: 'bg-blue-500/10', color: '#1E3A8A' },
 ];

 const colorId = account.colorId || 'midnight';
 const matched = CARD_COLORS.find(c => c.id === colorId);

 if (colorId === 'custom' && account.customColor) {
 return {
 background: account.customColor,
 glow: 'bg-white/5'
 };
 }

 if (matched) {
 return {
 bgClass: matched.bg,
 glow: matched.glow
 };
 }

 // Fallback gradients based on account type if no custom color
 switch(account.type) {
 case 'bank': return { bgClass: 'bg-gradient-to-br from-blue-600 to-indigo-700', glow: 'bg-blue-500/10' };
 case 'card': return { bgClass: 'bg-gradient-to-br from-purple-600 to-violet-800', glow: 'bg-purple-500/10' };
 case 'wallet': return { bgClass: 'bg-gradient-to-br from-emerald-500 to-teal-700', glow: 'bg-emerald-500/10' };
 case 'cash': return { bgClass: 'bg-gradient-to-br from-orange-500 to-amber-700', glow: 'bg-orange-500/10' };
 default: return { bgClass: 'bg-gradient-to-br from-slate-600 to-slate-800', glow: 'bg-slate-500/10' };
 }
};

export function Dashboard({ setCurrentPage: propSetCurrentPage }: DashboardProps) {
  const { setCurrentPage: contextSetCurrentPage, accounts, transactions, goals: contextGoals, loans: contextLoans, investments: contextInvestments, groupExpenses: contextGroupExpenses, currency, visibleFeatures, aiCapabilities, refreshData } = useApp();
  const setCurrentPage = propSetCurrentPage || contextSetCurrentPage;

  // Direct reactive queries from IndexedDB (Dexie) so Dashboard updates instantly when records are created
  const liveLoans = useLiveQuery(() => db.loans.filter(l => !l.deletedAt).toArray(), []) || [];
  const liveInvestments = useLiveQuery(() => db.investments.filter(i => !i.deletedAt).toArray(), []) || [];
  const liveGoals = useLiveQuery(() => db.goals.filter(g => !g.deletedAt).toArray(), []) || [];
  const liveGroupExpenses = useLiveQuery(() => db.groupExpenses.filter(ge => !ge.deletedAt).toArray(), []) || [];
  const liveDocuments = useLiveQuery(() => db.documents.filter(d => !d.deletedAt).toArray(), []) || [];

  const loans = liveLoans.length > 0 ? liveLoans : (contextLoans || []);
  const investments = liveInvestments.length > 0 ? liveInvestments : (contextInvestments || []);
  const goals = liveGoals.length > 0 ? liveGoals : (contextGoals || []);
  const groupExpenses = liveGroupExpenses.length > 0 ? liveGroupExpenses : (contextGroupExpenses || []);

  useEffect(() => {
    console.log('[KANAKU Startup] Dashboard Loaded: Reason = Valid Session');
  }, []);

  const showAiSummary = useSubFeature('dashboard', 'aiSummary');
  const showQuickActions = useSubFeature('dashboard', 'quickActions');
  const showRecentActivity = useSubFeature('dashboard', 'recentActivity');
  const [activeTab, setActiveTab] = useState<'all' | 'bank' | 'card' | 'wallet' | 'cash'>('all');
  const [timePeriod, setTimePeriod] = useState<TimeFilterPeriod>('daily');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [investmentQuotes, setInvestmentQuotes] = useState<Record<string, StockQuote | null>>({});
  const investmentPriceTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const openInvestments = useMemo(
    () => investments.filter((investment) => !investment.deletedAt && !isClosedInvestment(investment)),
    [investments],
  );

  const filteredAccounts = useMemo(() => {
    if (activeTab === 'all') return accounts;
    return accounts.filter(a => a.type === activeTab);
  }, [accounts, activeTab]);

  const filterReferenceDate = useMemo(() => {
    if (transactions.length === 0) return new Date();
    return transactions.reduce((latest, transaction) => {
      const txDate = new Date(transaction.date);
      if (Number.isNaN(txDate.getTime())) return latest;
      return txDate > latest ? txDate : latest;
    }, new Date(transactions[0].date));
  }, [transactions]);

  const timeFilteredTransactions = useMemo(() =>
    filterByTimePeriod(transactions, timePeriod, selectedDate),
    [transactions, timePeriod, selectedDate],
  );

  const filteredAccountIdSet = useMemo(
    () => new Set(filteredAccounts.map((account) => account.id)),
    [filteredAccounts],
  );

  const filteredTransactions = useMemo(() => {
    if (activeTab === 'all') return timeFilteredTransactions;
    return timeFilteredTransactions.filter(t => filteredAccountIdSet.has(t.accountId));
  }, [timeFilteredTransactions, filteredAccountIdSet, activeTab]);

  const stats = useMemo(() => {
    const aggregation = buildTransactionAggregation(timeFilteredTransactions);
    const income = parseMonetary(aggregation.totalIncome, 'income');
    const expense = parseMonetary(aggregation.totalExpenses, 'expense');

    const totalBalance = calculateAccountTotalBalance(accounts);
    const savingsRate = income > 0 ? roundToMoney(((income - expense) / income) * 100) : 0;

    return {
      totalBalance,
      monthlyIncome: income,
      monthlyExpense: expense,
      savingsRate,
    };
  }, [accounts, timeFilteredTransactions]);

  const recentTransactions = useMemo(() => filteredTransactions.slice(0, 5), [filteredTransactions]);

  const activeGoals = useMemo(() => goals.filter(g => !g.deletedAt && g.currentAmount < g.targetAmount).slice(0, 3), [goals]);

  // Loans & EMI computed data
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const activeLoans = useMemo(() =>
    loans.filter(l => !l.deletedAt && (l.status === 'active' || l.status === 'overdue' || !l.status || (l.outstandingBalance ?? 0) > 0)).slice(0, 3),
    [loans]);

 const getLoanStatus = (loan: typeof loans[0]) => {
 if (loan.status === 'overdue') return 'overdue';
 if (loan.dueDate && new Date(loan.dueDate) <= sevenDaysFromNow) return 'upcoming';
 return 'active';
 };

  // One-time check to ensure all loans have a valid calculated EMI amount
  useEffect(() => {
    void db.loans.toArray().then((allLoans) => {
      allLoans.forEach((loan) => {
        if (loan.id && (!loan.emiAmount || loan.emiAmount <= 0)) {
          let calculatedEmi = 0;
          if (loan.principalAmount && loan.tenureMonths && loan.tenureMonths > 0) {
            calculatedEmi = Math.round(loan.principalAmount / loan.tenureMonths);
          } else if (loan.outstandingBalance && loan.outstandingBalance > 0) {
            calculatedEmi = Math.round(loan.outstandingBalance / 12);
          }
          if (calculatedEmi > 0) {
            void db.loans.update(loan.id, { emiAmount: calculatedEmi });
          }
        }
      });
    });
  }, []);

  // ─── Calendar / Upcoming Events ──────────────────────────────────────────
  const upcomingEvents = useMemo(() => {
    const events: { label: string; date: Date; type: 'emi' | 'bill' | 'transaction'; amount?: number; timeCategory: 'today' | 'week' | 'month' }[] = [];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // EMI due dates from loans
    loans.filter(l => (l.status === 'active' || !l.status || l.status === 'overdue') && l.dueDate).forEach(loan => {
      const dueDate = new Date(loan.dueDate!);
      if (dueDate >= now && dueDate <= endOfMonth) {
        const isToday = dueDate.toDateString() === now.toDateString();
        const isThisWeek = dueDate <= sevenDaysFromNow;

        let emi = Number(loan.emiAmount || 0);
        if (emi <= 0 && loan.principalAmount && loan.tenureMonths && loan.tenureMonths > 0) {
          emi = Math.round(loan.principalAmount / loan.tenureMonths);
        } else if (emi <= 0 && loan.outstandingBalance && loan.outstandingBalance > 0) {
          emi = Math.round(loan.outstandingBalance / 12);
        }

        events.push({
          label: `${loan.name} EMI`,
          date: dueDate,
          type: 'emi',
          amount: emi > 0 ? emi : (loan.outstandingBalance || loan.principalAmount || 0),
          timeCategory: isToday ? 'today' : isThisWeek ? 'week' : 'month',
        });
      }
    });

    // Upcoming scheduled transactions
    transactions.filter(t =>
      t.type === 'expense' && t.date >= now && t.date <= endOfMonth &&
      (t.category === 'bills' || t.category === 'subscriptions' || t.description.toLowerCase().includes('emi'))
    ).forEach(t => {
      const isToday = new Date(t.date).toDateString() === now.toDateString();
      const isThisWeek = new Date(t.date) <= sevenDaysFromNow;
      events.push({
        label: t.description,
        date: new Date(t.date),
        type: 'bill',
        amount: t.amount,
        timeCategory: isToday ? 'today' : isThisWeek ? 'week' : 'month',
      });
    });

    return events.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);
  }, [loans, transactions]);

  const groupStats = useMemo(() => {
    const borrowed = loans.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.outstandingBalance || 0), 0);
    const lent = loans.filter(l => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + Number(l.outstandingBalance || 0), 0);
    const pendingSettlements = groupExpenses.reduce((s, g) => {
      const unpaid = (g.members || []).filter(m => !m.paid).reduce((ms, m) => ms + Number(m.share || 0), 0);
      return s + unpaid;
    }, 0);
    return { borrowed, lent, pendingSettlements, activeGroups: groupExpenses.length };
  }, [loans, groupExpenses]);

  // ── Investments ─────────────────────────────────────────────────────────────
  const portfolioSymbols = useMemo(
    () => getRequiredInvestmentQuoteSymbols(openInvestments, currency),
    [currency, openInvestments],
  );

  const fetchDashboardInvestmentQuotes = useCallback(async () => {
    if (!portfolioSymbols.length || !navigator.onLine) {
      return;
    }

    const quotes = await fetchMultipleQuotes(portfolioSymbols);
    setInvestmentQuotes(quotes);
  }, [portfolioSymbols]);

  useEffect(() => {
    if (investmentPriceTimer.current) {
      clearInterval(investmentPriceTimer.current);
      investmentPriceTimer.current = null;
    }

    if (!portfolioSymbols.length) {
      setInvestmentQuotes({});
      return;
    }

    void fetchDashboardInvestmentQuotes();
    investmentPriceTimer.current = setInterval(() => {
      void fetchDashboardInvestmentQuotes();
    }, 10_000);

    return () => {
      if (investmentPriceTimer.current) {
        clearInterval(investmentPriceTimer.current);
        investmentPriceTimer.current = null;
      }
    };
  }, [portfolioSymbols, fetchDashboardInvestmentQuotes]);

  const getDashboardInvestmentMetrics = useCallback(
    (investment: typeof investments[number]) => getInvestmentMetrics(investment, currency, investmentQuotes),
    [currency, investmentQuotes]
  );

  const investmentStats = useMemo(() => {
    const totalInvested = openInvestments.reduce((sum, investment) => sum + Number(getDashboardInvestmentMetrics(investment).totalInvested || 0), 0);
    const currentValue = openInvestments.reduce((sum, investment) => sum + Number(getDashboardInvestmentMetrics(investment).currentValue || 0), 0);
    const totalReturns = currentValue - totalInvested;
    const returnsPercent = totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;
    return { totalInvested, currentValue, totalReturns, returnsPercent, count: openInvestments.length };
  }, [getDashboardInvestmentMetrics, openInvestments]);

  const totalNetWorth = calculateNetWorth({
    accountBalance: visibleFeatures?.accounts !== false ? stats.totalBalance : 0,
    investmentValue: visibleFeatures?.investments !== false ? investmentStats.currentValue : 0,
    totalLent: visibleFeatures?.loans !== false ? groupStats.lent : 0,
    totalBorrowed: visibleFeatures?.loans !== false ? groupStats.borrowed : 0,
  });

  const formatCurrency = useCallback(
    (amount: number) => formatCurrencyAmount(amount, currency),
    [currency]
  );

  const taxSummary = useMemo(
    () => calculateTaxSummary(transactions, liveDocuments),
    [transactions, liveDocuments]
  );

  const fadeUp = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 }
  };

  const SectionHeader = ({ title, onViewAll, viewLabel = 'View All' }: { title: string; onViewAll?: () => void; viewLabel?: string }) => (
    <div className="flex items-center justify-between mb-3 px-1">
      <h3 className="font-section-title text-slate-900 tracking-tight">{title}</h3>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer transition-colors"
        >
          {viewLabel} <ChevronRight size={14} />
        </button>
      )}
    </div>
  );

  const EmptyWidget = ({ icon: Icon, message }: { icon: any; message: string }) => (
    <div className="flex flex-col items-center justify-center p-6 text-center text-gray-400">
      <Icon size={28} className="mb-2 opacity-50" />
      <p className="text-xs font-medium">{message}</p>
    </div>
  );

  return (
    <CenteredLayout>
      <div className="space-y-6 sm:space-y-7">
        {/* Top Header Row with Greeting */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <p className="font-stat-label text-slate-400 mb-0.5">Welcome Back 👋</p>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-tight">
              Stay On Track Today
            </h1>
          </div>
        </div>

        {/* Horizontal Calendar Date Strip & Period Filter (Reference Image Style) */}
        <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col items-center gap-5 sm:gap-6">
          <AppDateStrip
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            period={timePeriod}
          />
          <div className="flex justify-center w-full">
            <TimeFilter value={timePeriod} onChange={setTimePeriod} testId="dashboard-time-filter" />
          </div>
        </div>

        {/* ── Unified Hero Card: Net Worth + Arc Gauge + 3 Mini Gauges ── */}
        <motion.div {...fadeUp}>
          <Card className="bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] rounded-[28px] sm:rounded-[32px] relative overflow-hidden">
            {/* Top half: Net Worth + Arc Gauge */}
            <div className="p-6 sm:p-8">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                {/* Left: Summary Metrics */}
                <div className="md:col-span-7 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100/80 text-xs font-bold mb-3">
                      <Sparkles size={13} className="text-purple-600" />
                      <span>Total Net Worth</span>
                    </div>
                    <h2 className="font-hero-metric tracking-tight text-slate-900">
                      {formatCurrency(totalNetWorth)}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
                      <span className="font-medium text-slate-400 block text-[10px] uppercase font-bold">Total Assets</span>
                      <strong className="text-slate-900 font-bold text-sm">
                        {formatCurrency(stats.totalBalance + investmentStats.currentValue)}
                      </strong>
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
                      <span className="font-medium text-slate-400 block text-[10px] uppercase font-bold">Active Accounts</span>
                      <strong className="text-slate-900 font-bold text-sm">{accounts.length}</strong>
                    </div>
                    {stats.savingsRate > 0 && (
                      <div className="px-3.5 py-2 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-800">
                        <span className="font-medium text-emerald-600 block text-[10px] uppercase font-bold">Savings Rate</span>
                        <strong className="text-emerald-700 font-bold text-sm">{stats.savingsRate}%</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Arc Gauge */}
                <div className="md:col-span-5 flex justify-center md:justify-end pt-2 md:pt-0">
                  <AppArcGauge
                    value={stats.monthlyExpense}
                    max={stats.monthlyIncome > 0 ? stats.monthlyIncome : (stats.monthlyExpense * 1.3 || 10000)}
                    centerValue={formatCurrency(stats.monthlyExpense)}
                    subtitle={stats.monthlyIncome > 0 ? `of ${formatCurrency(stats.monthlyIncome)}` : 'Expenses'}
                    size={200}
                    strokeWidth={15}
                    strokeColor="#18181B"
                    trackColor="#F1F5F9"
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 mx-4 sm:mx-6" />

            {/* Bottom half: 3 Mini Gauges */}
            <div className="grid grid-cols-3 gap-0 divide-x divide-slate-100">
              <AppMiniGauge
                tone="peach"
                label="Total Expenses"
                value={formatCurrency(stats.monthlyExpense)}
                subLabel={getPeriodLabel(timePeriod, selectedDate)}
                progressPercent={stats.monthlyIncome > 0 ? Math.min(100, (stats.monthlyExpense / stats.monthlyIncome) * 100) : 50}
                icon={<TrendingDown size={16} />}
                onClick={() => setCurrentPage?.('transactions')}
                className="rounded-none rounded-bl-[28px] sm:rounded-bl-[32px] border-0 shadow-none bg-transparent"
              />
              <AppMiniGauge
                tone="lavender"
                label="Total Income"
                value={formatCurrency(stats.monthlyIncome)}
                subLabel={getPeriodLabel(timePeriod, selectedDate)}
                progressPercent={100}
                icon={<TrendingUp size={16} />}
                onClick={() => setCurrentPage?.('transactions')}
                className="rounded-none border-0 shadow-none bg-transparent"
              />
              <AppMiniGauge
                tone="mint"
                label="Net Cashflow"
                value={formatCurrency(stats.monthlyIncome - stats.monthlyExpense)}
                subLabel={(stats.monthlyIncome - stats.monthlyExpense >= 0) ? 'Surplus' : 'Deficit'}
                progressPercent={stats.monthlyIncome > 0 ? Math.min(100, Math.max(0, stats.savingsRate)) : 40}
                icon={<Activity size={16} />}
                onClick={() => setCurrentPage?.('reports')}
                className="rounded-none rounded-br-[28px] sm:rounded-br-[32px] border-0 shadow-none bg-transparent"
              />
            </div>
          </Card>
        </motion.div>

        {/* 3. Tax Summary: Soft Light Card */}
        <motion.div {...fadeUp}>
          <Card
            className="p-5 bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] rounded-[28px] hover:border-purple-300/80 cursor-pointer transition-all duration-200 active:scale-[0.99] group"
            onClick={() => setCurrentPage?.('receipt-scanner')}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                  <Receipt size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-purple-700 transition-colors">Tax Summary</h4>
                    <ChevronRight size={14} className="text-purple-500 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs text-slate-400 font-medium">Calculated from transactions & receipts · Tap for breakdown</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:gap-6 text-center sm:text-right pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Total Tax</p>
                  <p className="text-sm sm:text-base font-black text-amber-600">{formatCurrency(taxSummary.totalTax)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">This Month</p>
                  <p className="text-sm sm:text-base font-black text-slate-900">{formatCurrency(taxSummary.monthlyTax)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">This Week</p>
                  <p className="text-sm sm:text-base font-black text-slate-900">{formatCurrency(taxSummary.weeklyTax)}</p>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* 4. Lower Dashboard Section 1: Accounts & Wallets */}
        {visibleFeatures?.accounts !== false && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Accounts & Wallets" onViewAll={() => setCurrentPage?.('accounts')} />

            {/* Account Type Filters — centered on desktop, scrollable on mobile */}
            <div className="flex justify-start sm:justify-center mb-3">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none max-w-full">
              {[
                { id: 'all', label: 'All' },
                { id: 'bank', label: 'Banks' },
                { id: 'card', label: 'Cards' },
                { id: 'wallet', label: 'Wallets' },
                { id: 'cash', label: 'Cash' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer',
                    activeTab === tab.id
                      ? 'bg-[#18181B] text-white shadow-xs'
                      : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                  )}
                >
                  {tab.label}
                </button>
              ))}
              </div>
            </div>

            {filteredAccounts.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 snap-x snap-mandatory scrollbar-none scroll-smooth touch-scroll -mx-1">
                {filteredAccounts.map((account) => {
                  const style = getCardStyle(account);
                  return (
                    <Card
                      key={account.id}
                      className={cn(
                        "p-5 w-[270px] xs:w-[290px] sm:w-[320px] shrink-0 snap-center hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden group border-none text-white rounded-3xl",
                        style.bgClass
                      )}
                      style={style.background ? { backgroundColor: style.background } : {}}
                      onClick={() => setCurrentPage?.('accounts')}
                    >
                      {/* Glow & subtle overlay */}
                      <div className={cn("absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl opacity-30", style.glow)} />
                      <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                      <div className="relative z-10 flex flex-col justify-between h-full min-h-[140px]">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/15 backdrop-blur-md border border-white/20 text-white shadow-lg">
                              {account.type === 'bank' && <Landmark size={20} />}
                              {account.type === 'card' && <CreditCard size={20} />}
                              {account.type === 'wallet' && <Wallet size={20} />}
                              {account.type === 'cash' && <Banknote size={20} />}
                            </div>
                            <div className="drop-shadow-md rounded-lg overflow-hidden">
                              {getBankCardLogo(account.name, true, 'sm')}
                            </div>
                          </div>
                          {account.subType && (
                            <div className="scale-90 opacity-90">
                              <CardNetworkLogo network={account.subType} />
                            </div>
                          )}
                          {!account.isActive && (
                            <span className="text-[10px] font-bold text-white/60 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10">
                              INACTIVE
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight truncate">
                            {account.name}
                          </h4>
                          <div className="flex items-center justify-between pt-1">
                            <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
                              {formatCurrencyAmount(account.balance || 0, account.currency ?? currency)}
                            </p>
                            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest bg-white/15 px-2.5 py-0.5 rounded-lg backdrop-blur-sm">
                              {account.type}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCurrentPage?.('accounts')}>
                <EmptyWidget icon={Wallet} message="No accounts in this category - tap to manage" />
              </Card>
            )}
          </motion.div>
        )}

        {/* 5. Lower Dashboard Section 2: Recent Transactions (Reference Today's Meals Style) */}
        {visibleFeatures?.transactions !== false && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Recent Transactions" onViewAll={() => setCurrentPage?.('transactions')} />
            {recentTransactions.length > 0 ? (
              <Card data-testid="dashboard-card-3" className="divide-y divide-slate-100/90 !p-0 overflow-hidden bg-white rounded-[28px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
                {recentTransactions.map((transaction) => (
                  <div
                    data-testid={`dashboard-div-${transaction.id}`}
                    key={transaction.id}
                    className="p-4 sm:p-4.5 flex items-center justify-between hover:bg-slate-50/70 transition-all cursor-pointer group"
                    onClick={() => setCurrentPage?.('transactions')}
                  >
                    <div className="flex items-center gap-3 sm:gap-3.5">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-slate-50/80 border border-slate-100/90 group-hover:scale-105 transition-transform shrink-0">
                        {getCategoryCartoonIcon(transaction.category || 'Miscellaneous', 24)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm sm:text-[15px] leading-snug">
                          {transaction.description || transaction.category}
                        </p>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{transaction.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("font-black text-sm sm:text-base tracking-tight", transaction.type === 'income' ? "text-emerald-600" : "text-slate-900")}>
                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </p>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                        {formatLocalDate(transaction.date, 'en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <Card data-testid="dashboard-card-4" className="cursor-pointer hover:shadow-md transition-shadow rounded-[28px]" onClick={() => setCurrentPage?.('transactions')}>
                <EmptyWidget icon={CreditCard} message="No transactions - tap to view activity" />
              </Card>
            )}
          </motion.div>
        )}

        {/* 6. Lower Dashboard Section 3: Loans & EMI */}
        {visibleFeatures?.loans !== false && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Loans & EMI" onViewAll={() => setCurrentPage?.('loans')} />
            {activeLoans.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeLoans.map((loan) => {
                  const status = getLoanStatus(loan);
                  const statusConfig = {
                    overdue: { label: 'Overdue', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100', icon: AlertTriangle, dotColor: 'bg-red-500' },
                    upcoming: { label: 'Due Soon', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', icon: Clock, dotColor: 'bg-amber-500' },
                    active: { label: 'Active', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', icon: CheckCircle2, dotColor: 'bg-blue-500' },
                  }[status];
                  return (
                    <Card
                      data-testid={`dashboard-card-5-${loan.id}`}
                      key={loan.id}
                      className={cn("p-4 cursor-pointer hover:shadow-lg transition-all border", statusConfig.border)}
                      onClick={() => setCurrentPage?.('loans')}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", statusConfig.bg)}>
                          <Landmark size={18} className={statusConfig.text} />
                        </div>
                        <span className={cn("flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full", statusConfig.bg, statusConfig.text)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dotColor)} />
                          {statusConfig.label}
                        </span>
                      </div>
                      <h4 className="font-semibold text-gray-900 truncate text-sm mb-0.5">{loan.name}</h4>
                      <p className="text-xs text-gray-500 mb-3 capitalize">{loan.type === 'emi' ? 'EMI Loan' : loan.type === 'borrowed' ? 'Borrowed' : 'Lent'}</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs text-gray-500">
                          <span>Outstanding</span>
                          <span className="font-semibold text-gray-900">{formatCurrency(loan.outstandingBalance)}</span>
                        </div>
                        {loan.emiAmount && (
                          <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>EMI</span>
                            <span className="font-semibold text-gray-900">{formatCurrency(loan.emiAmount)}/mo</span>
                          </div>
                        )}
                        {loan.dueDate && (
                          <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>Next due</span>
                            <span className={cn("font-semibold", status === 'overdue' ? 'text-red-600' : 'text-gray-900')}>
                              {new Date(loan.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card data-testid="dashboard-card-6" className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCurrentPage?.('loans')}>
                <EmptyWidget icon={Landmark} message="No active loans - click to manage" />
              </Card>
            )}
          </motion.div>
        )}

        {/* 7. Lower Dashboard Section 4: Upcoming Events / Calendar */}
        {visibleFeatures?.calendar !== false && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Upcoming Events" onViewAll={() => setCurrentPage?.('calendar')} viewLabel="View Calendar" />
            {upcomingEvents.length > 0 ? (
              <Card data-testid="dashboard-card-7" className="divide-y divide-slate-100/90 cursor-pointer hover:shadow-md transition-shadow rounded-[28px] bg-white border border-slate-100/80 !p-0 overflow-hidden shadow-2xs" onClick={() => setCurrentPage?.('calendar')}>
                {upcomingEvents.map((event, i) => {
                  const timeBadge = {
                    today: { label: 'Today', cls: 'bg-red-50 text-red-600' },
                    week: { label: 'This Week', cls: 'bg-amber-50 text-amber-600' },
                    month: { label: 'This Month', cls: 'bg-purple-50 text-purple-600' },
                  }[event.timeCategory];
                  const typeIcon = event.type === 'emi'
                    ? <Landmark size={16} className="text-purple-600" />
                    : <AlertCircle size={16} className="text-orange-600" />;
                  const typeBg = event.type === 'emi' ? 'bg-purple-50' : 'bg-orange-50';
                  return (
                    <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50/70 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", typeBg)}>
                          {typeIcon}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{event.label}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", timeBadge.cls)}>{timeBadge.label}</span>
                            <span className="text-xs text-slate-400 font-medium">
                              {event.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                        </div>
                      </div>
                      {event.amount !== undefined && (
                        <p className="font-black text-sm text-slate-900">{formatCurrency(event.amount)}</p>
                      )}
                    </div>
                  );
                })}
              </Card>
            ) : (
              <Card data-testid="dashboard-card-8" className="cursor-pointer hover:shadow-md transition-shadow rounded-[28px] bg-white border border-slate-100/80 shadow-2xs" onClick={() => setCurrentPage?.('calendar')}>
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <Calendar size={36} className="mb-2 opacity-40" />
                  <p className="text-sm font-bold text-slate-600">No upcoming events this month</p>
                  <p className="text-xs text-slate-400 mt-1 font-medium">EMI due dates and bills appear here</p>
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {/* 8. Lower Dashboard Section 5: Borrow, Lend & Groups */}
        {(visibleFeatures?.groups !== false || visibleFeatures?.loans !== false) && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Borrow, Lend & Groups" onViewAll={() => setCurrentPage?.('groups')} />
            <Card data-testid="dashboard-card-9" className="cursor-pointer hover:shadow-xl transition-all rounded-[28px] bg-white border border-slate-100/80 shadow-2xs" onClick={() => setCurrentPage?.('groups')}>
              {(groupStats.borrowed > 0 || groupStats.lent > 0 || groupStats.pendingSettlements > 0 || groupStats.activeGroups > 0) ? (
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-red-50 rounded-2xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <HandCoins size={14} className="text-red-500" />
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">You Owe</span>
                      </div>
                      <p className="text-base font-bold text-gray-900">{formatCurrency(groupStats.borrowed)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Borrowed</p>
                    </div>

                    <div className="bg-green-50 rounded-2xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <BadgeDollarSign size={14} className="text-green-500" />
                        <span className="text-[10px] font-bold text-green-500 uppercase tracking-wide">Owed to You</span>
                      </div>
                      <p className="text-base font-bold text-gray-900">{formatCurrency(groupStats.lent)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Lent out</p>
                    </div>

                    <div className="bg-amber-50 rounded-2xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertCircle size={14} className="text-amber-500" />
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Pending</span>
                      </div>
                      <p className="text-base font-bold text-gray-900">{formatCurrency(groupStats.pendingSettlements)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Unsettled</p>
                    </div>

                    <div className="bg-blue-50 rounded-2xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Users size={14} className="text-blue-500" />
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Groups</span>
                      </div>
                      <p className="text-base font-bold text-gray-900">{groupStats.activeGroups}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Active</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-3 text-xs text-gray-400 gap-1">
                    <span>Tap to manage</span>
                    <ChevronRight size={12} />
                  </div>
                </div>
              ) : (
                <EmptyWidget icon={Users} message="No group expenses or borrow/lend records" />
              )}
            </Card>
          </motion.div>
        )}

        {/* 9. Lower Dashboard Section 6: Investments */}
        {visibleFeatures?.investments !== false && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Investments" onViewAll={() => setCurrentPage?.('investments')} />
            {investmentStats.count > 0 ? (
              <Card data-testid="dashboard-card-10" className="cursor-pointer hover:shadow-md transition-all rounded-[28px] bg-white border border-slate-100/80 shadow-2xs" onClick={() => setCurrentPage?.('investments')}>
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-purple-50 rounded-2xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Activity size={14} className="text-purple-600" />
                        <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">Invested</span>
                      </div>
                      <p className="text-base font-bold text-slate-900">{formatCurrency(investmentStats.totalInvested)}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-2xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <BarChart3 size={14} className="text-indigo-600" />
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide">Current Value</span>
                      </div>
                      <p className="text-base font-bold text-slate-900">{formatCurrency(investmentStats.currentValue)}</p>
                    </div>
                    <div className={cn("rounded-2xl p-3", investmentStats.totalReturns >= 0 ? "bg-emerald-50" : "bg-red-50")}>
                      <div className="flex items-center gap-1.5 mb-1">
                        {investmentStats.totalReturns >= 0
                          ? <TrendingUp size={14} className="text-emerald-600" />
                          : <TrendingDown size={14} className="text-red-500" />}
                        <span className={cn("text-[10px] font-bold uppercase tracking-wide", investmentStats.totalReturns >= 0 ? "text-emerald-700" : "text-red-700")}>Returns</span>
                      </div>
                      <p className={cn("text-base font-bold", investmentStats.totalReturns >= 0 ? "text-emerald-700" : "text-red-700")}>
                        {investmentStats.totalReturns >= 0 ? '+' : ''}{formatCurrency(investmentStats.totalReturns)}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <BarChart3 size={14} className="text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Holdings</span>
                      </div>
                      <p className="text-base font-bold text-slate-900">{investmentStats.count}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {openInvestments.slice(0, 3).map((inv) => {
                      const metrics = getDashboardInvestmentMetrics(inv);
                      return (
                        <div key={inv.id} className="flex items-center justify-between py-2.5">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{getInvestmentDisplayName(inv.assetName)}</p>
                            <p className="text-xs text-slate-400 capitalize">{inv.assetType} {metrics.assetCurrency}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(metrics.currentValue)}</p>
                            <p className={cn("text-xs font-semibold", metrics.profitLoss >= 0 ? "text-emerald-600" : "text-red-500")}>
                              {metrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.profitLoss)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-end mt-2 text-xs text-purple-600 font-bold gap-1">
                    <span>View all investments</span>
                    <ChevronRight size={12} />
                  </div>
                </div>
              </Card>
            ) : (
              <Card data-testid="dashboard-card-11" className="cursor-pointer hover:shadow-md transition-shadow rounded-[28px] bg-white border border-slate-100/80 shadow-2xs" onClick={() => setCurrentPage?.('investments')}>
                <EmptyWidget icon={BarChart3} message="No investments added yet - click to add" />
              </Card>
            )}
          </motion.div>
        )}

        {/* 10. Lower Dashboard Section 7: Goals Progress */}
        {visibleFeatures?.goals !== false && activeGoals.length > 0 && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Goals Progress" onViewAll={() => setCurrentPage?.('goals')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeGoals.map((goal) => {
                const progress = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
                return (
                  <Card data-testid={`dashboard-card-12-${goal.id}`} key={goal.id} className="p-4.5 cursor-pointer hover:shadow-lg transition-all rounded-[28px] bg-white border border-slate-100/80 shadow-2xs" onClick={() => setCurrentPage?.('goals')}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-slate-900 truncate text-sm">{goal.name}</h4>
                      <Target size={16} className="text-purple-500 flex-shrink-0" />
                    </div>
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-400 font-medium mb-1.5">
                        <span>{formatCurrency(goal.currentAmount)}</span>
                        <span>{formatCurrency(goal.targetAmount)}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-purple-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-xs font-bold text-purple-600">{progress.toFixed(0)}% Complete</p>
                  </Card>
                );
              })}
            </div>
          </motion.div>
        )}

      </div>
    </CenteredLayout>
  );
}
