import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { PageHeader } from '@/app/components/ui/PageHeader';
import {
 TrendingUp, CreditCard, Wallet, Banknote, Smartphone,
 ArrowUpRight, ArrowDownLeft, Target, TrendingDown,
 AlertCircle, Calendar, Users, BarChart3, ChevronRight,
 Clock, CheckCircle2, AlertTriangle, BadgeDollarSign,
 HandCoins, Activity, Landmark
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
import {
 getInvestmentDisplayName,
 getInvestmentMetrics,
 getRequiredInvestmentQuoteSymbols,
 isClosedInvestment,
} from '@/lib/investmentUtils';
import { AIInsightsCard } from '@/app/components/shared/AIInsightsCard';
import { CardNetworkLogo, getBankCardLogo } from '@/app/components/ui/AccountLogos';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';

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

export function Dashboard({ setCurrentPage }: DashboardProps) {
 const { accounts, transactions, goals, loans, investments, groupExpenses, currency } = useApp();

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
 () => investments.filter((investment) => !isClosedInvestment(investment)),
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
 const income = aggregation.totalIncome;
 const expense = aggregation.totalExpenses;

 const totalBalance = accounts.filter(a => a.isActive).reduce((sum, a) => sum + a.balance, 0);
 const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

 return {
 totalBalance,
 monthlyIncome: income,
 monthlyExpense: expense,
 savingsRate,
 };
 }, [accounts, timeFilteredTransactions]);

 const recentTransactions = useMemo(() => filteredTransactions.slice(0, 5), [filteredTransactions]);

 const activeGoals = useMemo(() => goals.filter(g => g.currentAmount < g.targetAmount).slice(0, 3), [goals]);

 //"EUR"EUR Loans & EMI computed data"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR
 const now = new Date();
 const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

 const activeLoans = useMemo(() =>
 loans.filter(l => l.status === 'active' || l.status === 'overdue').slice(0, 3),
 [loans]);

 const getLoanStatus = (loan: typeof loans[0]) => {
 if (loan.status === 'overdue') return 'overdue';
 if (loan.dueDate && new Date(loan.dueDate) <= sevenDaysFromNow) return 'upcoming';
 return 'active';
 };

 //"EUR"EUR Calendar / Upcoming Events"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR
 const upcomingEvents = useMemo(() => {
 const events: { label: string; date: Date; type: 'emi' | 'bill' | 'transaction'; amount?: number; timeCategory: 'today' | 'week' | 'month' }[] = [];
 const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

 // EMI due dates from loans
 loans.filter(l => l.status === 'active' && l.dueDate).forEach(loan => {
 const dueDate = new Date(loan.dueDate!);
 if (dueDate >= now && dueDate <= endOfMonth) {
 const isToday = dueDate.toDateString() === now.toDateString();
 const isThisWeek = dueDate <= sevenDaysFromNow;
 events.push({
 label: `${loan.name} EMI`,
 date: dueDate,
 type: 'emi',
 amount: loan.emiAmount,
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

 //"EUR"EUR Group Expenses / Borrow / Lend"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR
 const groupStats = useMemo(() => {
 const borrowed = loans.filter(l => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + l.outstandingBalance, 0);
 const lent = loans.filter(l => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + l.outstandingBalance, 0);
 const pendingSettlements = groupExpenses.reduce((s, g) => {
 const unpaid = g.members.filter(m => !m.paid).reduce((ms, m) => ms + m.share, 0);
 return s + unpaid;
 }, 0);
 return { borrowed, lent, pendingSettlements, activeGroups: groupExpenses.length };
 }, [loans, groupExpenses]);

 //"EUR"EUR Investments"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR"EUR
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
 [currency, investmentQuotes],
 );

 const investmentStats = useMemo(() => {
 const totalInvested = openInvestments.reduce((sum, investment) => sum + getDashboardInvestmentMetrics(investment).totalInvested, 0);
 const currentValue = openInvestments.reduce((sum, investment) => sum + getDashboardInvestmentMetrics(investment).currentValue, 0);
 const totalReturns = currentValue - totalInvested;
 const returnsPercent = totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;
 return { totalInvested, currentValue, totalReturns, returnsPercent, count: openInvestments.length };
 }, [getDashboardInvestmentMetrics, openInvestments]);

 const totalNetWorth = stats.totalBalance + investmentStats.currentValue + groupStats.lent - groupStats.borrowed;
 const stockSetupHint = getStockDataSetupHint();

 const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency, {
 minimumFractionDigits: 0,
 maximumFractionDigits: 0,
 });

 const getProgressWidthClass = (value: number) => {
 const progressValue = Math.max(0, Math.min(100, value));
 const bucket = Math.round(progressValue / 10) * 10;

 switch (bucket) {
 case 0: return 'w-0';
 case 10: return 'w-[10%]';
 case 20: return 'w-[20%]';
 case 30: return 'w-[30%]';
 case 40: return 'w-[40%]';
 case 50: return 'w-1/2';
 case 60: return 'w-[60%]';
 case 70: return 'w-[70%]';
 case 80: return 'w-[80%]';
 case 90: return 'w-[90%]';
 default: return 'w-full';
 }
 };

 const tabs = [
 { id: 'all', label: 'All Assets', icon: TrendingUp },
 { id: 'bank', label: 'Banks', icon: Landmark },
 { id: 'card', label: 'Cards', icon: CreditCard },
 { id: 'wallet', label: 'Digital', icon: Wallet },
 { id: 'cash', label: 'Cash', icon: Banknote },
 ];

 // Reusable section header
 const SectionHeader = ({ title, onViewAll, viewLabel = 'View All' }: { title: string; onViewAll: () => void; viewLabel?: string }) => (
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
 <Button data-testid={`dashboard-view-all-${title.toLowerCase().replace(/\s+/g, '-')}`} variant="outline" size="sm" onClick={onViewAll} className="rounded-full text-xs gap-1">
 {viewLabel} <ChevronRight size={12} />
 </Button>
 </div>
 );

 const EmptyWidget = ({ icon: Icon, message }: { icon: React.ElementType; message: string }) => (
 <div className="flex flex-col items-center justify-center py-8 text-gray-400">
 <Icon size={36} className="mb-2 opacity-40" />
 <p className="text-sm font-medium">{message}</p>
 </div>
 );

 const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };

 return (
 <CenteredLayout>
 <div className="w-full">

 {/* Header */}
 <div className="pb-4 lg:pb-6">
 <PageHeader
 title="DashBoard"
 subtitle={`Hello! Here's what's happening with your money ${(timePeriod as string) === 'all' ? 'overall' : 'this ' + timePeriod.replace('ly', '')}`}
 icon={<Activity size={24} />}
  >
  <div className="flex flex-row flex-wrap items-center gap-4">
    <TimeFilter testId="dashboard-time-filter" value={timePeriod} onChange={setTimePeriod} />
  </div>
  </PageHeader>
 </div>

 {stockSetupHint && (
 <div className="mb-4">
 <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
 <AlertTriangle size={16} className="mt-0.5 shrink-0" />
 <p className="text-sm font-medium">{stockSetupHint}</p>
 </div>
 </div>
 )}

  {/* AI Insights Card */}
  {showAiSummary && (
  <div className="mb-6">
  <AIInsightsCard compact />
  </div>
  )}

 {/*"EUR"EUR 1. Financial Health Hero"EUR"EUR */}
 <div className="flex justify-center mb-6 lg:mb-8">
 <Card data-testid="dashboard-networth-card" variant="mesh-pink" className="w-full max-w-md lg:max-w-lg p-6 lg:p-8 relative overflow-hidden">
 <div className="relative z-10">
 <p className="text-white/80 font-medium mb-1 text-sm text-center">Total Net Worth</p>
 <h2 className="text-3xl lg:text-4xl font-display font-bold text-white tracking-tight mb-6 text-center">
 {formatCurrency(totalNetWorth)}
 </h2>
 <div className="grid grid-cols-2 gap-3 lg:gap-4">
 <div className="bg-white/20 backdrop-blur-md rounded-2xl p-3">
 <div className="flex items-center gap-2 mb-1 opacity-80">
 <TrendingUp size={14} className="text-white" />
 <span className="text-xs font-bold text-white">Income</span>
 </div>
 <p className="text-white font-bold text-sm lg:text-base">{formatCurrency(stats.monthlyIncome)}</p>
 </div>
 <div className="bg-white/20 backdrop-blur-md rounded-2xl p-3">
 <div className="flex items-center gap-2 mb-1 opacity-80">
 <TrendingDown size={14} className="text-white" />
 <span className="text-xs font-bold text-white">Expense</span>
 </div>
 <p className="text-white font-bold text-sm lg:text-base">{formatCurrency(stats.monthlyExpense)}</p>
 </div>
 </div>
  {(stats.monthlyIncome > 0 || groupStats.borrowed > 0) && (
    <div className={cn(
      "mt-4 grid gap-3",
      stats.monthlyIncome > 0 && groupStats.borrowed > 0 ? "grid-cols-2" : "grid-cols-1"
    )}>
      {stats.monthlyIncome > 0 && (
        <div className="bg-white/20 backdrop-blur-md rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <Target size={14} className="text-white" />
            <span className="text-xs font-bold text-white">Savings Rate</span>
          </div>
          <p className="text-white font-bold text-sm lg:text-base">{stats.savingsRate.toFixed(1)}%</p>
        </div>
      )}
      {groupStats.borrowed > 0 && (
        <div className="bg-white/20 backdrop-blur-md rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <AlertTriangle size={14} className="text-white" />
            <span className="text-xs font-bold text-white">Total Outstanding Debt</span>
          </div>
          <p className="text-white font-bold text-sm lg:text-base">{formatCurrency(groupStats.borrowed)}</p>
        </div>
      )}
    </div>
  )}
 </div>

 </Card>
 </div>

 {/* Asset Type Tabs */}
 <div className="w-full mb-6">
 <div className="flex w-full bg-gray-100/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/40 shadow-sm">
 {tabs.map((tab) => {
 const Icon = tab.icon;
 const isActive = activeTab === tab.id;
 
 // Smart label logic for responsive design
 const getLabel = (label: string) => {
 if (label === 'All Assets') return isActive ? 'All Assets' : 'All';
 return label;
 };

 return (
 <button
 key={tab.id}
 data-testid={`dashboard-tab-${tab.id}`}
 onClick={() => setActiveTab(tab.id as typeof activeTab)}
 className={cn(
 'relative flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 py-2 sm:py-2.5 rounded-xl transition-all duration-300 font-bold',
 isActive 
 ? 'text-white shadow-md' 
 : 'bg-transparent text-slate-500 hover:text-slate-700'
 )}
 >
 {isActive && (
 <motion.div 
 layoutId="activeTabPill"
 className="absolute inset-0 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl z-0"
 transition={{ type:"spring", bounce: 0.2, duration: 0.6 }}
 />
 )}
 <span className="relative z-10 flex items-center justify-center gap-2">
 <Icon 
 size={14} 
 className={cn(
"transition-all duration-300",
 isActive ?"text-white scale-110" :"text-slate-400"
 )} 
 />
 <AnimatePresence mode="wait">
 {isActive && (
 <motion.span
 initial={{ width: 0, opacity: 0 }}
 animate={{ width: 'auto', opacity: 1 }}
 exit={{ width: 0, opacity: 0 }}
 className="overflow-hidden whitespace-nowrap"
 >
 <span className="text-[10px] sm:text-xs font-bold ml-1">
 {tab.label}
 </span>
 </motion.span>
 )}
 </AnimatePresence>
 
 {/* Keep labels visible on desktop even if not active for better UX */}
 {!isActive && (
 <span className="hidden sm:inline text-xs text-slate-500 ml-1">
 {tab.label}
 </span>
 )}
 </span>
 </button>
 );
 })}
 </div>
 </div>

 {/*"EUR"EUR 2. Accounts"EUR"EUR */}
 <motion.div {...fadeUp} className="mb-6 lg:mb-8">
 <SectionHeader title="Accounts" onViewAll={() => setCurrentPage?.('accounts')} />
 <AnimatePresence mode="wait">
 {filteredAccounts.length > 0 ? (
 <motion.div key={activeTab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}
 className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide scroll-smooth touch-scroll"
 >
 {filteredAccounts.map((account) => (
 <Card data-testid={`dashboard-card-${account.id}`} key={account.id} 
 className={cn(
"p-5 w-[260px] xs:w-[280px] sm:w-[320px] shrink-0 snap-center hover:shadow-xl transition-all cursor-pointer relative overflow-hidden group border-none",
 getCardStyle(account).bgClass
 )} 
 style={getCardStyle(account).background ? { backgroundColor: getCardStyle(account).background } : {}}
 onClick={() => setCurrentPage?.('accounts')}
 >
 {/* Glass Glow effect */}
 <div className={cn("absolute -top-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-20", getCardStyle(account).glow)} />
 <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
 
 <div className="relative z-10">
 <div className="flex items-center justify-between mb-8">
 <div className="flex items-center gap-2.5">
 <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-lg">
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
 <span className="text-[10px] font-bold text-white/50 bg-white/5 px-2 py-0.5 rounded-full backdrop-blur-sm border border-white/10">
 INACTIVE
 </span>
 )}
 </div>
 
 <div className="space-y-1">
 <h4 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight truncate">
 {account.name}
 </h4>
 <div className="flex items-center gap-2">
 <p className="text-sm font-medium text-white/70">
 {formatCurrency(account.balance)}
 </p>
 <span className="w-1 h-1 rounded-full bg-white/20" />
 <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
 {account.type}
 </p>
 </div>
 </div>

 <div className="mt-6 flex items-center justify-between">
 <div className="flex -space-x-1">
 {[1, 2, 3].map(i => (
 <div key={i} className="w-1 h-4 bg-white/10 rounded-full" />
 ))}
 </div>
 <div className="text-[10px] font-medium text-white/40 tracking-wider uppercase">
 {account.currency}
 </div>
 </div>
 </div>
 </Card>
 ))}
 </motion.div>
 ) : (
 <Card data-testid="dashboard-card-2" className="p-8 text-center cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCurrentPage?.('add-account')}>
 <EmptyWidget icon={Wallet} message="No accounts yet - tap to add your first" />
 </Card>
 )}
 </AnimatePresence>
 </motion.div>

 {/* 3. Recent Transactions */}
 {showRecentActivity && (
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
 <p className={cn("font-semibold text-sm", transaction.type === 'income' ?"text-green-600" :"text-red-600")}>
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

 {/* 4. Loans & EMI */}
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
 const StatusIcon = statusConfig.icon;
 return (
 <Card data-testid={`dashboard-card-5-${loan.id}`} key={loan.id}
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

 {/* 5. Calendar / Upcoming Events */}
 <motion.div {...fadeUp} className="mb-6 lg:mb-8">
 <SectionHeader title="Upcoming Events" onViewAll={() => setCurrentPage?.('calendar')} viewLabel="View Calendar" />
 {upcomingEvents.length > 0 ? (
 <Card data-testid="dashboard-card-7" className="divide-y divide-gray-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCurrentPage?.('calendar')}>
 {upcomingEvents.map((event, i) => {
 const timeBadge = {
 today: { label: 'Today', cls: 'bg-red-100 text-red-600' },
 week: { label: 'This Week', cls: 'bg-amber-100 text-amber-600' },
 month: { label: 'This Month', cls: 'bg-blue-100 text-blue-600' },
 }[event.timeCategory];
 const typeIcon = event.type === 'emi'
 ? <Landmark size={16} className="text-purple-600" />
 : <AlertCircle size={16} className="text-orange-600" />;
 const typeBg = event.type === 'emi' ? 'bg-purple-50' : 'bg-orange-50';
 return (
 <div key={i} className="p-4 flex items-center justify-between hover:bg-transparent transition-colors">
 <div className="flex items-center gap-3">
 <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", typeBg)}>
 {typeIcon}
 </div>
 <div>
 <p className="font-medium text-gray-900 text-sm">{event.label}</p>
 <div className="flex items-center gap-2 mt-0.5">
 <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", timeBadge.cls)}>{timeBadge.label}</span>
 <span className="text-xs text-gray-500">
 {event.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
 </span>
 </div>
 </div>
 </div>
 {event.amount !== undefined && (
 <p className="font-semibold text-sm text-gray-900">{formatCurrency(event.amount)}</p>
 )}
 </div>
 );
 })}
 </Card>
 ) : (
 <Card data-testid="dashboard-card-8" className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCurrentPage?.('calendar')}>
 <div className="flex flex-col items-center justify-center py-8 text-gray-400">
 <Calendar size={36} className="mb-2 opacity-40" />
 <p className="text-sm font-medium">No upcoming events this month</p>
 <p className="text-xs text-gray-400 mt-1">EMI due dates and bills appear here</p>
 </div>
 </Card>
 )}
 </motion.div>

 {/* 6. Borrow, Lend & Groups */}
 <motion.div {...fadeUp} className="mb-6 lg:mb-8">
 <SectionHeader title="Borrow, Lend & Groups" onViewAll={() => setCurrentPage?.('groups')} />
 <Card data-testid="dashboard-card-9" variant="glass" className="cursor-pointer hover:shadow-xl transition-all border-white/20" onClick={() => setCurrentPage?.('groups')}>
 {(groupStats.borrowed > 0 || groupStats.lent > 0 || groupStats.pendingSettlements > 0 || groupStats.activeGroups > 0) ? (
 <div className="p-4">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 {/* You Owe */}
 <div className="bg-red-50 rounded-2xl p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <HandCoins size={14} className="text-red-500" />
 <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">You Owe</span>
 </div>
 <p className="text-base font-bold text-gray-900">{formatCurrency(groupStats.borrowed)}</p>
 <p className="text-[10px] text-gray-400 mt-0.5">Borrowed</p>
 </div>

 {/* Others Owe */}
 <div className="bg-green-50 rounded-2xl p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <BadgeDollarSign size={14} className="text-green-500" />
 <span className="text-[10px] font-bold text-green-500 uppercase tracking-wide">Owed to You</span>
 </div>
 <p className="text-base font-bold text-gray-900">{formatCurrency(groupStats.lent)}</p>
 <p className="text-[10px] text-gray-400 mt-0.5">Lent out</p>
 </div>

 {/* Pending Settlements */}
 <div className="bg-amber-50 rounded-2xl p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <AlertCircle size={14} className="text-amber-500" />
 <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">Pending</span>
 </div>
 <p className="text-base font-bold text-gray-900">{formatCurrency(groupStats.pendingSettlements)}</p>
 <p className="text-[10px] text-gray-400 mt-0.5">Unsettled</p>
 </div>

 {/* Active Groups */}
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

 {/* 7. Investments */}
 <motion.div {...fadeUp} className="mb-6 lg:mb-8">
 <SectionHeader title="Investments" onViewAll={() => setCurrentPage?.('investments')} />
 {investmentStats.count > 0 ? (
 <Card data-testid="dashboard-card-10" className="cursor-pointer hover:shadow-md transition-all" onClick={() => setCurrentPage?.('investments')}>
 <div className="p-4">
 {/* Top summary row */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
 <div className="bg-indigo-50 rounded-2xl p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <Activity size={14} className="text-indigo-500" />
 <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">Invested</span>
 </div>
 <p className="text-base font-bold text-gray-900">{formatCurrency(investmentStats.totalInvested)}</p>
 </div>
 <div className="bg-purple-50 rounded-2xl p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <BarChart3 size={14} className="text-purple-500" />
 <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wide">Current Value</span>
 </div>
 <p className="text-base font-bold text-gray-900">{formatCurrency(investmentStats.currentValue)}</p>
 </div>
 <div className={cn("rounded-2xl p-3", investmentStats.totalReturns >= 0 ?"bg-green-50" :"bg-red-50")}>
 <div className="flex items-center gap-1.5 mb-1">
 {investmentStats.totalReturns >= 0
 ? <TrendingUp size={14} className="text-green-500" />
 : <TrendingDown size={14} className="text-red-500" />}
 <span className={cn("text-[10px] font-bold uppercase tracking-wide", investmentStats.totalReturns >= 0 ?"text-green-500" :"text-red-500")}>Returns</span>
 </div>
 <p className={cn("text-base font-bold", investmentStats.totalReturns >= 0 ?"text-green-700" :"text-red-700")}>
 {investmentStats.totalReturns >= 0 ? '+' : ''}{formatCurrency(investmentStats.totalReturns)}
 </p>
 </div>
 <div className="bg-transparent rounded-2xl p-3">
 <div className="flex items-center gap-1.5 mb-1">
 <BarChart3 size={14} className="text-gray-500" />
 <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Holdings</span>
 </div>
 <p className="text-base font-bold text-gray-900">{investmentStats.count}</p>
 </div>
 </div>
 {/* Individual investments */}
 <div className="divide-y divide-gray-100">
 {openInvestments.slice(0, 3).map((inv) => {
 const metrics = getDashboardInvestmentMetrics(inv);
 return (
 <div key={inv.id} className="flex items-center justify-between py-2.5">
 <div>
 <p className="text-sm font-semibold text-gray-900">{getInvestmentDisplayName(inv.assetName)}</p>
 <p className="text-xs text-gray-400 capitalize">{inv.assetType} {metrics.assetCurrency}</p>
 </div>
 <div className="text-right">
 <p className="text-sm font-bold text-gray-900">{formatCurrency(metrics.currentValue)}</p>
 <p className={cn("text-xs font-semibold", metrics.profitLoss >= 0 ?"text-green-600" :"text-red-500")}>
 {metrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.profitLoss)}
 </p>
 </div>
 </div>
 );
 })}
 </div>
 <div className="flex items-center justify-end mt-2 text-xs text-gray-400 gap-1">
 <span>View all investments</span>
 <ChevronRight size={12} />
 </div>
 </div>
 </Card>
 ) : (
 <Card data-testid="dashboard-card-11" className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCurrentPage?.('investments')}>
 <EmptyWidget icon={BarChart3} message="No investments added yet - click to add" />
 </Card>
 )}
 </motion.div>

 {/*"EUR"EUR 8. Goals Progress"EUR"EUR */}
 {activeGoals.length > 0 && (
 <motion.div {...fadeUp} className="mb-6 lg:mb-8">
 <SectionHeader title="Goals Progress" onViewAll={() => setCurrentPage?.('goals')} />
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
 {activeGoals.map((goal) => {
 const progress = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
 return (
 <Card data-testid={`dashboard-card-12-${goal.id}`} key={goal.id} className="p-4 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setCurrentPage?.('goals')}>
 <div className="flex items-center justify-between mb-3">
 <h4 className="font-medium text-gray-900 truncate text-sm">{goal.name}</h4>
 <Target size={16} className="text-pink-400 flex-shrink-0" />
 </div>
 <div className="mb-3">
 <div className="flex justify-between text-xs text-gray-500 mb-1.5">
 <span>{formatCurrency(goal.currentAmount)}</span>
 <span>{formatCurrency(goal.targetAmount)}</span>
 </div>
 <div className="w-full bg-gray-100 rounded-full h-2">
 <div className={cn(
 'bg-gradient-to-r from-pink-500 to-rose-500 h-2 rounded-full transition-all duration-500',
 getProgressWidthClass(progress)
 )} />
 </div>
 </div>
 <p className="text-xs font-semibold text-pink-600">{progress.toFixed(0)}% Complete</p>
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


