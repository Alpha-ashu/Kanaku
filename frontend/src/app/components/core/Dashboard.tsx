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
  const [timePeriod, setTimePeriod] = useState<TimeFilterPeriod>('monthly');
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
    filterByTimePeriod(transactions, timePeriod, filterReferenceDate),
    [transactions, timePeriod, filterReferenceDate],
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
      <h3 className="font-bold text-gray-900 text-base">{title}</h3>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
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
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Dashboard"
          subtitle="Here's what's happening with your money today."
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage?.('add-transaction')}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              Add Transaction
            </button>
          </div>
        </PageHeader>

        {/* 1. Hero Net Worth Card */}
        <motion.div {...fadeUp}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card variant="glass" className="p-5 relative overflow-hidden bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white border-indigo-800/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Total Net Worth</span>
                <Sparkles size={18} className="text-indigo-400" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3">
                {formatCurrency(totalNetWorth)}
              </h2>
              <div className="flex items-center justify-between text-xs text-indigo-200/80 pt-3 border-t border-white/10">
                <span>Total Assets: {formatCurrency(stats.totalBalance + investmentStats.currentValue)}</span>
                <span>Active Accounts: {accounts.length}</span>
              </div>
            </Card>

            <Card variant="glass" className="p-5 bg-white/60 dark:bg-slate-900/60 border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Total Income</span>
                <TrendingUp size={18} className="text-emerald-500" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                {formatCurrency(stats.monthlyIncome)}
              </h3>
              <p className="text-xs text-slate-500">From all income streams this period</p>
            </Card>

            <Card variant="glass" className="p-5 bg-white/60 dark:bg-slate-900/60 border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-600">Total Expenses</span>
                <TrendingDown size={18} className="text-rose-500" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                {formatCurrency(stats.monthlyExpense)}
              </h3>
              <p className="text-xs text-slate-500">Total spending across all categories</p>
            </Card>
          </div>
        </motion.div>

        {/* Tax Summary Overview Card */}
        <motion.div {...fadeUp}>
          <Card variant="glass" className="p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 flex items-center justify-center font-bold">
                  <Receipt size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Tax Summary</h4>
                  <p className="text-xs text-slate-500">Calculated from transactions & receipt scans</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:gap-6 text-center sm:text-right">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Total Tax</p>
                  <p className="text-sm sm:text-base font-black text-amber-600">{formatCurrency(taxSummary.totalTax)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">This Month</p>
                  <p className="text-sm sm:text-base font-black text-slate-700 dark:text-slate-200">{formatCurrency(taxSummary.monthlyTax)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">This Week</p>
                  <p className="text-sm sm:text-base font-black text-slate-700 dark:text-slate-200">{formatCurrency(taxSummary.weeklyTax)}</p>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* 2. Accounts Section */}
        {visibleFeatures?.accounts !== false && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Accounts & Wallets" onViewAll={() => setCurrentPage?.('accounts')} />
            {accounts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.slice(0, 6).map((acc) => (
                  <Card
                    key={acc.id}
                    variant="glass"
                    className="p-4 cursor-pointer hover:shadow-lg transition-all"
                    onClick={() => setCurrentPage?.('accounts')}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{acc.type}</span>
                      <Wallet size={16} className="text-indigo-500" />
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-base mb-1 truncate">{acc.name}</h4>
                    <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{formatCurrencyAmount(acc.balance || 0, acc.currency ?? currency)}</p>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCurrentPage?.('accounts')}>
                <EmptyWidget icon={Wallet} message="No accounts added yet - tap to add" />
              </Card>
            )}
          </motion.div>
        )}

        {/* 3. Recent Transactions */}
        {visibleFeatures?.transactions !== false && (
          <motion.div {...fadeUp} className="mb-6 lg:mb-8">
            <SectionHeader title="Recent Transactions" onViewAll={() => setCurrentPage?.('transactions')} />
            {recentTransactions.length > 0 ? (
              <Card data-testid="dashboard-card-3" variant="glass" className="divide-y divide-white/10 no-padding overflow-hidden border-white/20">
                {recentTransactions.map((transaction) => (
                  <div data-testid={`dashboard-div-${transaction.id}`} key={transaction.id} className="p-4 flex items-center justify-between hover:bg-transparent transition-colors cursor-pointer" onClick={() => setCurrentPage?.('transactions')}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/40 shadow-sm border border-slate-100">
                        {getCategoryCartoonIcon(transaction.category || 'Miscellaneous', 24)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{transaction.description || transaction.category}</p>
                        <p className="text-xs text-gray-500">{transaction.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn("font-semibold text-sm", transaction.type === 'income' ? "text-green-600" : "text-red-600")}>
                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </p>
                      <p className="text-xs text-gray-500">{formatLocalDate(transaction.date, 'en-IN', { day: 'numeric', month: 'short' })}</p>
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <Card data-testid="dashboard-card-4" className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCurrentPage?.('add-transaction')}>
                <EmptyWidget icon={CreditCard} message="No transactions - tap to add your first" />
              </Card>
            )}
          </motion.div>
        )}

      </div>
    </CenteredLayout>
  );
}
