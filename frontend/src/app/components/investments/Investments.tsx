import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { queueTransactionDeleteSync } from '@/lib/auth-sync-integration';
import { Plus, TrendingUp, Edit2, Trash2, BarChart3, Activity, RefreshCw, Gem, Coins, Bitcoin, Globe, House, Briefcase, ChartPie } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { Button } from '@/app/components/ui/button';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { backendSyncService } from '@/lib/backend-sync-service';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LiveMarket } from '@/app/components/investments/LiveMarket';
import { LiveMarketTicker } from '@/app/components/investments/LiveMarketTicker';
import { WealthVaultDashboard } from '@/app/components/investments/WealthVaultDashboard';
import { fetchMultipleQuotes, StockQuote } from '@/lib/stockApi';
import { formatCurrencyAmount, formatNativeMoney } from '@/lib/currencyUtils';
import { CloseInvestmentModal } from '@/app/components/investments/CloseInvestmentModal';
import {
 getInvestmentDisplayName,
 getInvestmentMetrics,
 getRequiredInvestmentQuoteSymbols,
 isClosedInvestment,
} from '@/lib/investmentUtils';

type Tab = 'portfolio' | 'market' | 'vault';

const ASSET_STYLE: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  gold: { label: 'Gold', color: '#F59E0B', icon: Coins },
  silver: { label: 'Silver', color: '#94A3B8', icon: Coins },
  platinum: { label: 'Platinum', color: '#64748B', icon: Coins },
  bronze: { label: 'Bronze', color: '#B45309', icon: Coins },
  stock: { label: 'Stocks', color: '#10B981', icon: TrendingUp },
  crypto: { label: 'Crypto', color: '#F97316', icon: Bitcoin },
  forex: { label: 'Forex', color: '#0EA5E9', icon: Globe },
  real_estate: { label: 'Real estate', color: '#8B5CF6', icon: House },
  business: { label: 'Business', color: '#EC4899', icon: Briefcase },
  other: { label: 'Other', color: '#6366F1', icon: ChartPie },
};

type InvestmentRecord = ReturnType<typeof useApp>['investments'][number];

/**
 * Capital deployed over time: cumulative amount invested by purchase date, ending at today's
 * value. Built only from recorded purchases — no price history is invented.
 */
const PortfolioGrowthLine: React.FC<{
  investments: InvestmentRecord[];
  getMetrics: (investment: InvestmentRecord) => { totalInvested: number };
  currentValue: number;
}> = ({ investments, getMetrics, currentValue }) => {
  const gradientId = `portfolio-growth-${React.useId().replace(/:/g, '')}`;
  const dated = investments
    .map((investment) => ({ time: new Date(investment.purchaseDate).getTime(), amount: Number(getMetrics(investment).totalInvested) || 0 }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  if (dated.length === 0) return null;

  let running = 0;
  const values = dated.map((point) => (running += point.amount));
  values.push(currentValue);
  if (values.length < 2) return null;

  const width = 300;
  const height = 56;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 4 - ((value - min) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const firstPurchase = new Date(dated[0].time).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-14 w-full" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`M0,${height} L${points.join(' L')} L${width},${height} Z`} fill={`url(#${gradientId})`} />
        <polyline points={points.join(' ')} fill="none" stroke="#c4b5fd" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-[10px] sm:text-[11px] font-medium text-white/50">Invested since {firstPurchase} → today&apos;s value</p>
    </div>
  );
};

export const Investments: React.FC = () => {
 const { investments, currency, setCurrentPage, refreshData } = useApp();
 const canAdd = useSubFeature('investments', 'addInvestment');
 const canEdit = canAdd; // edit follows addInvestment permission
 const canDelete = canAdd; // delete follows addInvestment permission
 const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [investmentToDelete, setInvestmentToDelete] = useState<{ id: number; name: string } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [activeTab, setActiveTab] = useState<Tab>('portfolio');
 const [liveQuotes, setLiveQuotes] = useState<Record<string, StockQuote | null>>({});
 const [updatingPrices, setUpdatingPrices] = useState(false);
 const [closingInvestment, setClosingInvestment] = useState<(typeof investments)[number] | null>(null);
 const [expandedHoldingId, setExpandedHoldingId] = useState<number | null>(null);
 const priceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
 const priceFetchInFlight = useRef(false);

 const openInvestments = useMemo(
 () => investments.filter((investment) => !isClosedInvestment(investment)),
 [investments],
 );

 const completedInvestments = useMemo(
 () => investments.filter((investment) => isClosedInvestment(investment)),
 [investments],
 );

 const portfolioSymbols = useMemo(
 () => getRequiredInvestmentQuoteSymbols(openInvestments, currency),
 [openInvestments, currency],
 );

 const fetchLivePrices = useCallback(async (isManual = false) => {
 if (!portfolioSymbols.length || !navigator.onLine) return;
 if (priceFetchInFlight.current) return;

 priceFetchInFlight.current = true;
 if (isManual) setUpdatingPrices(true);

 try {
 const quotes = await fetchMultipleQuotes(portfolioSymbols);
 setLiveQuotes(quotes);
 } catch (error) {
 console.error('Failed to update live investment prices:', error);
 } finally {
 priceFetchInFlight.current = false;
 setUpdatingPrices(false);
 }
 }, [portfolioSymbols]);

 // Auto-fetch live prices every 10s when on portfolio tab
 useEffect(() => {
 if (activeTab !== 'portfolio' || !portfolioSymbols.length) return;
 fetchLivePrices();
 priceTimer.current = setInterval(() => fetchLivePrices(), 10_000);
 return () => { if (priceTimer.current) clearInterval(priceTimer.current); };
 }, [activeTab, fetchLivePrices, portfolioSymbols]);

 const getMetrics = useCallback(
 (investment: typeof investments[number]) => getInvestmentMetrics(investment, currency, liveQuotes),
 [currency, liveQuotes],
 );

  const portfolioStats = useMemo(() => {
    try {
      const totalInvested = openInvestments.reduce((sum, investment) => {
        const m = getMetrics(investment);
        return sum + Number(m?.totalInvested || 0);
      }, 0);
      const currentValue = openInvestments.reduce((sum, investment) => {
        const m = getMetrics(investment);
        return sum + Number(m?.currentValue || 0);
      }, 0);
      const profitLoss = currentValue - totalInvested;
      const profitLossPercent = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;

      const assetAllocation = openInvestments.reduce((acc: any, investment) => {
        if (!investment) return acc;
        const metrics = getMetrics(investment);
        const typeKey = investment.assetType || 'other';
        if (!acc[typeKey]) acc[typeKey] = 0;
        acc[typeKey] += Number(metrics?.currentValue || 0);
        return acc;
      }, {});

      const chartData = Object.entries(assetAllocation).map(([name, value]) => ({
        name: (name || 'Asset').charAt(0).toUpperCase() + (name || 'Asset').slice(1),
        value: Number(value) || 0,
      }));

      return { totalInvested, currentValue, profitLoss, profitLossPercent, chartData };
    } catch (e) {
      console.error('[Investments] Error computing portfolio stats:', e);
      return { totalInvested: 0, currentValue: 0, profitLoss: 0, profitLossPercent: 0, chartData: [] };
    }
  }, [getMetrics, openInvestments]);

  const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

  const handleDeleteInvestment = async (investmentId: number, investmentName: string) => {
    // Check if linked to an active loan
    if (db.investmentLinks) {
      const linked = await db.investmentLinks
        .where('investmentId')
        .equals(String(investmentId))
        .toArray();
      const hasLoanLink = linked.some(l => l.linkedModule === 'loans');
      if (hasLoanLink) {
        toast.warning(`Cannot delete '${investmentName}' because it is linked to an active loan. Please settle or close the loan first.`);
        return;
      }
    }
    setInvestmentToDelete({ id: investmentId, name: investmentName });
    setDeleteModalOpen(true);
  };

 const confirmDeleteInvestment = async () => {
 if (!investmentToDelete) return;
 setIsDeleting(true);
 try {
 const deletedTransactionIds: number[] = [];
 const now = new Date();

 await db.transaction('rw', db.accounts, db.transactions, db.investments, async () => {
 const investment = await db.investments.get(investmentToDelete.id);
 if (!investment?.id) {
 return;
 }

 const linkedTransactionIds = [
 investment.purchaseTransactionId,
 investment.purchaseFeeTransactionId,
 investment.saleTransactionId,
 investment.saleFeeTransactionId,
 ].filter((transactionId): transactionId is number => Number.isFinite(transactionId));

 for (const transactionId of linkedTransactionIds) {
 const transaction = await db.transactions.get(transactionId);
 if (!transaction?.id) {
 continue;
 }

 const account = await db.accounts.get(transaction.accountId);
 if (account?.id) {
 const balanceDelta = transaction.type === 'expense'
 ? transaction.amount
 : transaction.type === 'income'
 ? -transaction.amount
 : 0;

 if (balanceDelta !== 0) {
 await db.accounts.update(account.id, {
 balance: account.balance + balanceDelta,
 updatedAt: now,
 });
 }
 }

 await db.transactions.delete(transaction.id);
 deletedTransactionIds.push(transaction.id);
 }

 await db.investments.delete(investment.id);
 });

 deletedTransactionIds.forEach((transactionId) => {
 queueTransactionDeleteSync(transactionId);
 });

 try {
 const investment = await db.investments.get(investmentToDelete.id);
 await backendService.deleteInvestment(investment?.cloudId ?? String(investmentToDelete.id));
 } catch (syncError) {
 console.error('Failed to sync investment deletion to backend:', syncError);
 }

 refreshData();
 toast.success('Investment deleted successfully');
 setDeleteModalOpen(false);
 setInvestmentToDelete(null);
 } catch (error) {
 console.error('Failed to delete investment:', error);
 toast.error('Failed to delete investment');
 } finally {
 setIsDeleting(false);
 }
 };

  const cardClass =
    'bg-white border border-slate-100 rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.10)]';
  const isProfit = portfolioStats.profitLoss >= 0;
  const allocationTotal = portfolioStats.chartData.reduce((sum, item) => sum + item.value, 0);
  const allocation = [...portfolioStats.chartData]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((item) => ({
      ...item,
      pct: allocationTotal > 0 ? (item.value / allocationTotal) * 100 : 0,
      color: ASSET_STYLE[item.name.toLowerCase()]?.color ?? ASSET_STYLE.other.color,
    }));
  const holdings = [...openInvestments].sort((a, b) => getMetrics(b).currentValue - getMetrics(a).currentValue);

  return (
    <CenteredLayout
      onRefresh={async () => {
        await backendSyncService.syncWithBackend();
        refreshData();
        await fetchLivePrices(true);
      }}
    >
      <div className="space-y-5 sm:space-y-6 investments-container portfolio-container" aria-label="Investments Portfolio">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-slate-400 truncate">Portfolio</p>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-tight truncate">Investments</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeTab === 'portfolio' && openInvestments.length > 0 && (
              <button
                type="button"
                onClick={() => fetchLivePrices(true)}
                disabled={updatingPrices}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white border border-slate-100 text-slate-700 flex items-center justify-center shadow-[0_6px_18px_-6px_rgba(15,23,42,0.18)] active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                data-testid="investments-refresh-prices-button"
                aria-label="Update prices"
                title="Update prices"
              >
                <RefreshCw size={18} className={cn(updatingPrices && 'animate-spin')} />
              </button>
            )}
            {canAdd && (
              <button
                type="button"
                onClick={() => setCurrentPage('add-investment')}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#18181B] hover:bg-black text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(15,23,42,0.45)] active:scale-95 transition-all cursor-pointer"
                data-testid="investments-add-button"
                aria-label="Add investment"
                title="Add investment"
              >
                <Plus size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full py-0.5">
          {([
            { id: 'portfolio', label: 'My Portfolio', icon: BarChart3 },
            { id: 'market', label: 'Live Market', icon: Activity },
            { id: 'vault', label: 'Wealth Vault', icon: Gem },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-pressed={activeTab === id}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer active:scale-95',
                activeTab === id
                  ? 'bg-[#18181B] text-white shadow-[0_6px_16px_-6px_rgba(15,23,42,0.5)]'
                  : 'bg-white text-slate-500 border border-slate-100 shadow-xs hover:text-slate-900'
              )}
              data-testid={`investments-tab-${id}-button`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* LIVE MARKET TAB */}
        {activeTab === 'market' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-4">
            <div className="w-full overflow-hidden rounded-2xl">
              <LiveMarketTicker />
            </div>
            <div className="min-h-[480px] h-auto lg:h-[calc(100svh-22rem)] lg:max-h-[820px]">
              <LiveMarket />
            </div>
          </motion.div>
        )}

        {/* WEALTH VAULT TAB */}
        {activeTab === 'vault' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full">
            <WealthVaultDashboard />
          </motion.div>
        )}

        {/* MY PORTFOLIO TAB */}
        {activeTab === 'portfolio' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-5">
            {investments.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                {/* Portfolio value */}
                <div
                  data-testid="investments-card-2"
                  className="relative overflow-hidden rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-[#18181B] via-[#1e1b4b] to-[#4c1d95] p-5 sm:p-6 text-white shadow-[0_18px_40px_-18px_rgba(76,29,149,0.6)]"
                >
                  <span className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl" />
                  <p className="relative text-xs sm:text-sm font-semibold text-white/60">Current value</p>
                  <p className="relative text-3xl sm:text-4xl font-black tracking-tight truncate">{formatCurrency(portfolioStats.currentValue)}</p>
                  <p className={cn('relative mt-1 text-xs sm:text-sm font-bold', isProfit ? 'text-emerald-300' : 'text-rose-300')}>
                    {isProfit ? '+' : ''}{formatCurrency(portfolioStats.profitLoss)} ({isProfit ? '+' : ''}{portfolioStats.profitLossPercent.toFixed(1)}%) all time
                  </p>
                  <div data-testid="investments-card" className="relative mt-3 flex items-center gap-4 text-[11px] sm:text-xs font-semibold text-white/60">
                    <span>Total invested <span className="text-white">{formatCurrency(portfolioStats.totalInvested)}</span></span>
                    <span>{openInvestments.length} {openInvestments.length === 1 ? 'holding' : 'holdings'}</span>
                  </div>
                  <PortfolioGrowthLine investments={openInvestments} getMetrics={getMetrics} currentValue={portfolioStats.currentValue} />
                </div>

                {/* Allocation */}
                {allocation.length > 0 && (
                  <div data-testid="investments-card-4" className={cn(cardClass, 'p-5 sm:p-6 flex flex-col justify-center')}>
                    <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-400">Asset allocation</p>
                    <div className="mt-3 flex h-3 gap-1 overflow-hidden rounded-full">
                      {allocation.map((item) => (
                        <span key={item.name} className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.color }} title={`${item.name} ${item.pct.toFixed(0)}%`} />
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
                      {allocation.map((item) => (
                        <div key={item.name} className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="font-medium text-slate-500 truncate">{ASSET_STYLE[item.name.toLowerCase()]?.label ?? item.name}</span>
                          <span className="ml-auto font-bold text-slate-900">{item.pct.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Holdings */}
            {holdings.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Holdings
                    {Object.keys(liveQuotes).length > 0 && <span className="ml-2 normal-case tracking-normal text-emerald-600">● Live prices</span>}
                  </p>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-400">Tap for details</span>
                </div>
                <div data-testid="investments-card-6" className={cn(cardClass, 'px-4 sm:px-5 divide-y divide-slate-100')}>
                  {holdings.map((inv) => {
                    const metrics = getMetrics(inv);
                    const gain = metrics.profitLoss >= 0;
                    const style = ASSET_STYLE[inv.assetType] ?? ASSET_STYLE.other;
                    const Icon = style.icon;
                    const expanded = expandedHoldingId === inv.id;
                    return (
                      <div key={inv.id} data-testid={`investments-card-7-${inv.id}`} className="py-3 sm:py-3.5">
                        <button
                          type="button"
                          onClick={() => setExpandedHoldingId(expanded ? null : inv.id ?? null)}
                          aria-expanded={expanded}
                          className="w-full flex items-center gap-3 sm:gap-4 text-left cursor-pointer"
                        >
                          <span className="w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] flex items-center justify-center shrink-0" style={{ backgroundColor: `${style.color}1F`, color: style.color }}>
                            <Icon size={20} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm sm:text-base font-bold text-slate-900 truncate">{getInvestmentDisplayName(inv.assetName)}</span>
                            <span className="block text-xs sm:text-sm font-medium text-slate-400 truncate">
                              {style.label} · Qty {inv.quantity}
                              {metrics.isLive ? ' · live' : ''}
                            </span>
                          </span>
                          <span className="text-right shrink-0">
                            <span className="block text-sm sm:text-base font-extrabold text-slate-900">{formatCurrency(metrics.currentValue)}</span>
                            <span className={cn('block text-xs font-bold', gain ? 'text-emerald-600' : 'text-rose-600')}>
                              {metrics.percentChange >= 0 ? '+' : ''}{metrics.percentChange.toFixed(1)}%
                            </span>
                          </span>
                        </button>

                        {expanded && (
                          <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 p-3.5">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                              <div>
                                <p className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Buy price</p>
                                <p className="font-bold text-slate-900 mt-0.5">{formatNativeMoney(metrics.nativeBuyPrice, metrics.assetCurrency)}</p>
                              </div>
                              <div>
                                <p className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Current price</p>
                                <p className={cn('font-bold mt-0.5', metrics.isLive ? 'text-emerald-700' : 'text-slate-900')}>
                                  {formatNativeMoney(metrics.nativeCurrentPrice, metrics.assetCurrency)}
                                </p>
                              </div>
                              <div>
                                <p className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Invested</p>
                                <p className="font-bold text-slate-900 mt-0.5">{formatCurrency(metrics.totalInvested)}</p>
                              </div>
                              <div>
                                <p className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Profit / loss</p>
                                <p className={cn('font-bold mt-0.5', gain ? 'text-emerald-600' : 'text-rose-600')}>
                                  {gain ? '+' : ''}{formatCurrency(metrics.profitLoss)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setClosingInvestment(inv)}
                                className="flex-1 h-9 rounded-full bg-[#18181B] hover:bg-black text-white text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                data-testid={`investments-complete-order-button-${inv.id}`}
                              >
                                Complete Order
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => { localStorage.setItem('editingInvestmentId', inv.id!.toString()); setCurrentPage('edit-investment'); }}
                                  className="w-9 h-9 rounded-full bg-white border border-slate-200/70 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Edit"
                                  aria-label={`Edit ${getInvestmentDisplayName(inv.assetName)}`}
                                  data-testid={`investments-edit-button-${inv.id}`}
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteInvestment(inv.id!, inv.assetName)}
                                  className="w-9 h-9 rounded-full bg-white border border-slate-200/70 text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Delete"
                                  aria-label={`Delete ${getInvestmentDisplayName(inv.assetName)}`}
                                  data-testid={`investments-delete-button-${inv.id}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {openInvestments.length === 0 && completedInvestments.length > 0 && (
              <div data-testid="investments-card-8" className={cn(cardClass, 'p-8 text-center')}>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">No open holdings</h3>
                <p className="text-sm text-slate-500 mt-1">All your tracked positions are completed. Add a new investment to start another order.</p>
              </div>
            )}

            {completedInvestments.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-400">Completed orders</p>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-400">{completedInvestments.length} closed</span>
                </div>
                <div data-testid="investments-card-9" className={cn(cardClass, 'px-4 sm:px-5 divide-y divide-slate-100')}>
                  {completedInvestments.map((investment) => {
                    const metrics = getMetrics(investment);
                    const style = ASSET_STYLE[investment.assetType] ?? ASSET_STYLE.other;
                    const Icon = style.icon;
                    return (
                      <div key={investment.id} className="flex items-center gap-3 sm:gap-4 py-3 sm:py-3.5">
                        <span className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 bg-slate-100 text-slate-500">
                          <Icon size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm sm:text-base font-bold text-slate-900 truncate">{getInvestmentDisplayName(investment.assetName)}</p>
                          <p className="text-xs sm:text-sm font-medium text-slate-400 truncate">
                            Sold at {formatNativeMoney(investment.closePrice || metrics.nativeCurrentPrice, metrics.assetCurrency)}
                            {investment.closedAt ? ` · ${new Date(investment.closedAt).toLocaleDateString()}` : ''}
                          </p>
                          {!!investment.closeNotes && <p className="text-xs text-slate-400 truncate">{investment.closeNotes}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm sm:text-base font-extrabold text-slate-900">{formatCurrency(metrics.netSaleValue ?? 0)}</p>
                          <p className={cn('text-xs font-bold', metrics.profitLoss >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            {metrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.profitLoss)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {investments.length === 0 && (
              <div data-testid="investments-card-10" className={cn(cardClass, 'p-10 sm:p-12 text-center')}>
                <div className="w-16 h-16 bg-[#18181B] rounded-[20px] flex items-center justify-center mx-auto mb-5 shadow-lg">
                  <BarChart3 className="text-white" size={28} />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">No investments yet</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">Start tracking your portfolio — stocks, mutual funds, gold and more — in one place.</p>
                {canAdd && (
                  <Button
                    onClick={() => setCurrentPage('add-investment')}
                    className="rounded-full h-11 px-6 shadow-lg bg-[#18181B] text-white hover:bg-black transition-transform active:scale-95"
                    data-testid="investments-empty-state-add-button"
                  >
                    <Plus size={18} className="mr-2" />
                    Add Your First Investment
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )}

        <DeleteConfirmModal
          isOpen={deleteModalOpen}
          title="Delete Investment"
          message="This investment record will be deleted, linked investment cashflows will be reversed, and related order transactions will be removed."
          itemName={investmentToDelete?.name}
          isLoading={isDeleting}
          onConfirm={confirmDeleteInvestment}
          onCancel={() => { setDeleteModalOpen(false); setInvestmentToDelete(null); }}
        />

        <CloseInvestmentModal
          investment={closingInvestment}
          quotes={liveQuotes}
          isOpen={Boolean(closingInvestment)}
          onClose={() => setClosingInvestment(null)}
          onCompleted={() => setClosingInvestment(null)}
        />
      </div>
    </CenteredLayout>
  );
};

