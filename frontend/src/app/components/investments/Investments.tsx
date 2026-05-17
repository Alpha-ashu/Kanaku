import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { queueTransactionDeleteSync } from '@/lib/auth-sync-integration';
import { Plus, TrendingUp, TrendingDown, Edit2, Trash2, BarChart3, Activity, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { LiveMarket } from '@/app/components/investments/LiveMarket';
import { LiveMarketTicker } from '@/app/components/investments/LiveMarketTicker';
import { fetchMultipleQuotes, StockQuote } from '@/lib/stockApi';
import { formatCurrencyAmount, formatNativeMoney } from '@/lib/currencyUtils';
import { CloseInvestmentModal } from '@/app/components/investments/CloseInvestmentModal';
import {
 getInvestmentDisplayName,
 getInvestmentMetrics,
 getRequiredInvestmentQuoteSymbols,
 isClosedInvestment,
} from '@/lib/investmentUtils';

const COLORS = ['#000000', '#666666', '#999999', '#CCCCCC', '#E5E5E5', '#F0F0F0'];

type Tab = 'portfolio' | 'market';

export const Investments: React.FC = () => {
 const { investments, currency, setCurrentPage, refreshData } = useApp();
 const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [investmentToDelete, setInvestmentToDelete] = useState<{ id: number; name: string } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [activeTab, setActiveTab] = useState<Tab>('portfolio');
 const [liveQuotes, setLiveQuotes] = useState<Record<string, StockQuote | null>>({});
 const [updatingPrices, setUpdatingPrices] = useState(false);
 const [closingInvestment, setClosingInvestment] = useState<(typeof investments)[number] | null>(null);
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
 const totalInvested = openInvestments.reduce((sum, investment) => sum + getMetrics(investment).totalInvested, 0);
 const currentValue = openInvestments.reduce((sum, investment) => sum + getMetrics(investment).currentValue, 0);
 const profitLoss = currentValue - totalInvested;
 const profitLossPercent = totalInvested > 0 ? (profitLoss / totalInvested) * 100 : 0;

 const assetAllocation = openInvestments.reduce((acc: any, investment) => {
 const metrics = getMetrics(investment);
 if (!acc[investment.assetType]) acc[investment.assetType] = 0;
 acc[investment.assetType] += metrics.currentValue;
 return acc;
 }, {});

 const chartData = Object.entries(assetAllocation).map(([name, value]) => ({
 name: name.charAt(0).toUpperCase() + name.slice(1),
 value,
 }));

 return { totalInvested, currentValue, profitLoss, profitLossPercent, chartData };
 }, [getMetrics, openInvestments]);

 const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

 const handleDeleteInvestment = (investmentId: number, investmentName: string) => {
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

 return (
 <CenteredLayout>
 <div className="space-y-6 sm:space-y-8">
 {/* Header */}
 <PageHeader
 title="Investments"
 subtitle="Track your investment portfolio"
 icon={<BarChart3 size={20} className="sm:w-6 sm:h-6" />}
 >
 <Button
 onClick={() => setCurrentPage('add-investment')}
 className="shadow-lg bg-gray-900 hover:bg-gray-800 text-white h-12 px-6 rounded-2xl font-bold flex items-center gap-2"
 >
 <Plus size={18} />
 <span>Add Investment</span>
 </Button>
 </PageHeader>

 {/* Live Market Ticker */}
 <div className="-mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8">
 <LiveMarketTicker />
 </div>

 {/* Tab switcher */}
 <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit">
 {([
 { id: 'portfolio', label: 'My Portfolio', icon: BarChart3 },
 { id: 'market', label: 'Live Market', icon: Activity },
 ] as const).map(({ id, label, icon: Icon }) => (
 <button
 key={id}
 onClick={() => setActiveTab(id)}
 className={cn(
 'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200',
 activeTab === id
 ? 'bg-white text-gray-900 shadow-sm'
 : 'text-gray-500 hover:text-gray-700'
 )}
 >
 <Icon size={15} />
 {label}
 </button>
 ))}
 </div>

 {/* LIVE MARKET TAB */}
 {activeTab === 'market' && (
 <motion.div
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 className="w-full"
 >
 {/* LiveMarket panel - grows with viewport, min capped so it's usable on short screens */}
 <div className="min-h-[480px] h-auto lg:h-[calc(100svh-22rem)] lg:max-h-[820px]">
 <LiveMarket />
 </div>
 </motion.div>
 )}

 {/* MY PORTFOLIO TAB */}
 {activeTab === 'portfolio' && (
 <motion.div
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 className="space-y-6 sm:space-y-8"
 >
 {/* Stats */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
 <Card variant="glass" className="p-4 sm:p-6 relative overflow-hidden">
 <div className="relative z-10">
 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black rounded-2xl flex items-center justify-center mb-2 sm:mb-4 shadow-sm">
 <TrendingUp className="text-white" size={18} />
 </div>
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Total Invested</p>
 <h3 className="text-xl sm:text-2xl font-display font-bold text-gray-900 tracking-tight">
 {formatCurrency(portfolioStats.totalInvested)}
 </h3>
 </div>
 </Card>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
 <Card variant="glass" className="p-4 sm:p-6 relative overflow-hidden">
 <div className="relative z-10">
 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black rounded-2xl flex items-center justify-center mb-2 sm:mb-4 shadow-sm">
 <BarChart3 className="text-white" size={18} />
 </div>
 <p className="text-gray-500 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Current Value</p>
 <h3 className="text-xl sm:text-2xl font-display font-bold text-gray-900 tracking-tight">
 {formatCurrency(portfolioStats.currentValue)}
 </h3>
 </div>
 </Card>
 </motion.div>

 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
 <Card variant={portfolioStats.profitLoss >= 0 ? 'mesh-green' : 'mesh-red'} className="p-4 sm:p-6 relative overflow-hidden">
 <div className="relative z-10">
 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-2 sm:mb-4">
 {portfolioStats.profitLoss >= 0
 ? <TrendingUp className="text-white" size={18} />
 : <TrendingDown className="text-white" size={18} />}
 </div>
 <p className="text-white/80 font-medium mb-0.5 sm:mb-1 text-xs sm:text-sm uppercase tracking-wide">Profit / Loss</p>
 <h3 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
 {portfolioStats.profitLoss >= 0 ? '+' : ''}{formatCurrency(portfolioStats.profitLoss)}
 </h3>
 <p className="text-white/80 text-xs sm:text-sm mt-0.5 sm:mt-1">
 {portfolioStats.profitLoss >= 0 ? '+' : ''}{portfolioStats.profitLossPercent.toFixed(2)}%
 </p>
 </div>
 <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
 </Card>
 </motion.div>
 </div>

 {/* Charts */}
 {openInvestments.length > 0 && (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Asset Allocation</h3>
 <ResponsiveContainer width="100%" height={250}>
 <PieChart>
 <Pie
 data={portfolioStats.chartData}
 cx="50%"
 cy="50%"
 labelLine={false}
 label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
 outerRadius={80}
 fill="#8884d8"
 dataKey="value"
 >
 {portfolioStats.chartData.map((_, index) => (
 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
 ))}
 </Pie>
 <Tooltip formatter={(value) => formatCurrency(Number(value))} />
 </PieChart>
 </ResponsiveContainer>
 </Card>

 <Card variant="glass" className="p-6">
 <h3 className="text-lg font-display font-bold text-gray-900 mb-4">Top Performers</h3>
 <div className="space-y-3">
 {[...openInvestments]
 .sort((a, b) => getMetrics(b).percentChange - getMetrics(a).percentChange)
 .slice(0, 5)
 .map(inv => {
 const metrics = getMetrics(inv);
 return (
 <div key={inv.id} className="flex items-center justify-between p-3 bg-white rounded-lg hover:bg-gray-100 transition-colors">
 <div>
 <p className="font-display font-bold text-gray-900 text-sm">{getInvestmentDisplayName(inv.assetName)}</p>
 <p className="text-xs text-gray-500 capitalize mt-0.5">{inv.assetType} {metrics.assetCurrency}</p>
 </div>
 <div className="text-right">
 <p className={`font-bold text-sm ${metrics.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {metrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.profitLoss)}
 </p>
 <p className={`text-xs ${metrics.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 {metrics.percentChange >= 0 ? '+' : ''}{metrics.percentChange.toFixed(2)}%
 </p>
 </div>
 </div>
 );
 })}
 </div>
 </Card>
 </div>
 )}

 
 {openInvestments.length > 0 && (
 <Card variant="glass" className="overflow-hidden hidden sm:block">
 <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
 <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
 Portfolio Holdings
 {Object.keys(liveQuotes).length > 0 && (
 <span className="ml-2 text-emerald-600 font-normal"> Live</span>
 )}
 </p>
 <button
 onClick={() => fetchLivePrices(true)}
 disabled={updatingPrices}
 className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
 >
 <RefreshCw size={12} className={cn(updatingPrices && 'animate-spin')} />
 Update Prices
 </button>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-white/50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asset</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
 <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
 <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Buy Price</th>
 <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Current</th>
 <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
 <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">P/L</th>
 <th className="px-6 py-3" />
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-200">
 {openInvestments.map(inv => {
 const metrics = getMetrics(inv);
 return (
 <tr key={inv.id} className="hover:bg-gray-50">
 <td className="px-6 py-4 whitespace-nowrap">
 <div className="font-medium text-gray-900">{getInvestmentDisplayName(inv.assetName)}</div>
 <div className="text-sm text-gray-500">{new Date(inv.purchaseDate).toLocaleDateString()}</div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700 capitalize">{inv.assetType}</span>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{inv.quantity}</td>
 <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
 <div>{formatNativeMoney(metrics.nativeBuyPrice, metrics.assetCurrency)}</div>
 {metrics.assetCurrency !== currency && (
 <div className="text-xs text-gray-400">{formatCurrency(metrics.convertedBuyPrice)}</div>
 )}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
 <div className={cn(metrics.isLive && 'text-emerald-700 font-semibold')}>
 {formatNativeMoney(metrics.nativeCurrentPrice, metrics.assetCurrency)}
 {metrics.isLive && <span className="ml-1 text-[10px] text-emerald-500"></span>}
 </div>
 {metrics.assetCurrency !== currency && (
 <div className="text-xs text-gray-400">{formatCurrency(metrics.convertedCurrentPrice)}</div>
 )}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">{formatCurrency(metrics.currentValue)}</td>
 <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold ${metrics.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
 <div className="flex items-center justify-end gap-1">
 {metrics.profitLoss >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
 {metrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.profitLoss)}
 </div>
 <div className="text-xs">
 {metrics.percentChange >= 0 ? '+' : ''}{metrics.percentChange.toFixed(2)}%
 </div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-center">
 <div className="flex gap-2 justify-center">
 <button
 onClick={() => { localStorage.setItem('editingInvestmentId', inv.id!.toString()); setCurrentPage('edit-investment'); }}
 className="text-gray-600 hover:text-gray-900 transition-colors p-1.5 hover:bg-gray-100 rounded-lg"
 title="Edit"
 >
 <Edit2 size={16} />
 </button>
 <button
 onClick={() => setClosingInvestment(inv)}
 className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold hover:bg-gray-900 transition-colors"
 title="Complete Order"
 >
 Complete Order
 </button>
 <button
 onClick={() => handleDeleteInvestment(inv.id!, inv.assetName)}
 className="text-red-600 hover:text-red-900 transition-colors p-1.5 hover:bg-red-100 rounded-lg"
 title="Delete"
 >
 <Trash2 size={16} />
 </button>
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </Card>
 )}

 
 {openInvestments.length > 0 && (
 <div className="sm:hidden space-y-3">
 {openInvestments.map(inv => {
 const metrics = getMetrics(inv);
 const isProfit = metrics.profitLoss >= 0;
 return (
 <Card key={inv.id} variant="glass" className="p-4">
 {/* Row 1: name + actions */}
 <div className="flex items-start justify-between gap-2 mb-3">
 <div className="min-w-0">
 <p className="font-display font-bold text-gray-900 text-base truncate">{getInvestmentDisplayName(inv.assetName)}</p>
 <div className="flex items-center gap-2 mt-0.5">
 <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 capitalize">{inv.assetType}</span>
 <span className="text-xs text-gray-400">{new Date(inv.purchaseDate).toLocaleDateString()}</span>
 </div>
 </div>
 <div className="flex gap-1.5 shrink-0">
 <button
 onClick={() => { localStorage.setItem('editingInvestmentId', inv.id!.toString()); setCurrentPage('edit-investment'); }}
 className="text-gray-500 hover:text-gray-900 transition-colors p-2 hover:bg-gray-100 rounded-xl"
 title="Edit"
 >
 <Edit2 size={15} />
 </button>
 <button
 onClick={() => handleDeleteInvestment(inv.id!, inv.assetName)}
 className="text-red-500 hover:text-red-700 transition-colors p-2 hover:bg-red-50 rounded-xl"
 title="Delete"
 >
 <Trash2 size={15} />
 </button>
 </div>
 </div>

 {/* Row 2: key numbers grid */}
 <div className="grid grid-cols-2 gap-2">
 <div className="bg-white rounded-xl p-3">
 <p className="text-xs text-gray-400 mb-0.5">Qty</p>
 <p className="text-sm font-bold text-gray-900">{inv.quantity}</p>
 </div>
 <div className="bg-white rounded-xl p-3">
 <p className="text-xs text-gray-400 mb-0.5">Buy Price</p>
 <p className="text-sm font-bold text-gray-900">{formatNativeMoney(metrics.nativeBuyPrice, metrics.assetCurrency)}</p>
 </div>
 <div className="bg-white rounded-xl p-3">
 <p className="text-xs text-gray-400 mb-0.5">Current Price {metrics.isLive && <span className="text-emerald-500"></span>}</p>
 <p className={cn("text-sm font-bold", metrics.isLive ?"text-emerald-700" :"text-gray-900")}>
 {formatNativeMoney(metrics.nativeCurrentPrice, metrics.assetCurrency)}
 </p>
 </div>
 <div className="bg-white rounded-xl p-3">
 <p className="text-xs text-gray-400 mb-0.5">Total Value</p>
 <p className="text-sm font-bold text-gray-900">{formatCurrency(metrics.currentValue)}</p>
 </div>
 </div>

 {/* Row 3: P/L badge */}
 <div className={`mt-3 flex items-center gap-1.5 px-3 py-2 rounded-xl ${isProfit ? 'bg-green-50' : 'bg-red-50'}`}>
 {isProfit ? <TrendingUp size={15} className="text-green-600" /> : <TrendingDown size={15} className="text-red-600" />}
 <span className={`text-sm font-bold ${isProfit ? 'text-green-700' : 'text-red-700'}`}>
 {isProfit ? '+' : ''}{formatCurrency(metrics.profitLoss)}
 </span>
 <span className={`text-xs font-medium ml-auto ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
 {metrics.percentChange >= 0 ? '+' : ''}{metrics.percentChange.toFixed(2)}%
 </span>
 </div>

 <button
 onClick={() => setClosingInvestment(inv)}
 className="mt-3 w-full rounded-xl bg-black text-white py-2.5 text-sm font-semibold hover:bg-gray-900 transition-colors"
 >
 Complete Order
 </button>
 </Card>
 );
 })}
 </div>
 )}

 {openInvestments.length === 0 && completedInvestments.length > 0 && (
 <Card variant="glass" className="p-8 text-center">
 <h3 className="text-xl font-display font-bold text-gray-900">No open holdings</h3>
 <p className="text-gray-500 mt-2">All your tracked positions are completed. Add a new investment to start another order.</p>
 </Card>
 )}

 {completedInvestments.length > 0 && (
 <Card variant="glass" className="p-6">
 <div className="flex items-center justify-between gap-3 mb-4">
 <div>
 <h3 className="text-lg font-display font-bold text-gray-900">Completed Orders</h3>
 <p className="text-sm text-gray-500">Closed positions with realized returns and fees</p>
 </div>
 <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
 {completedInvestments.length} closed
 </span>
 </div>

 <div className="space-y-3">
 {completedInvestments.map((investment) => {
 const metrics = getMetrics(investment);
 return (
 <div key={investment.id} className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <p className="font-display font-bold text-gray-900 truncate">{getInvestmentDisplayName(investment.assetName)}</p>
 <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">Closed</span>
 </div>
 <p className="text-xs text-gray-500 mt-1">
 Sold at {formatNativeMoney(investment.closePrice || metrics.nativeCurrentPrice, metrics.assetCurrency)}
 {investment.closedAt ? ` on ${new Date(investment.closedAt).toLocaleDateString()}` : ''}
 </p>
 {!!investment.closeNotes && (
 <p className="text-xs text-gray-400 mt-1">{investment.closeNotes}</p>
 )}
 </div>
 <div className="sm:text-right">
 <p className="text-sm font-semibold text-gray-500">Net Proceeds</p>
 <p className="text-base font-bold text-gray-900">{formatCurrency(metrics.netSaleValue ?? 0)}</p>
 <p className={`text-sm font-semibold ${metrics.profitLoss >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
 {metrics.profitLoss >= 0 ? '+' : ''}{formatCurrency(metrics.profitLoss)}
 </p>
 </div>
 </div>
 );
 })}
 </div>
 </Card>
 )}

 {/* Empty state */}
 {investments.length === 0 && (
 <Card variant="glass" className="p-12 text-center border-2 border-dashed border-gray-300">
 <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
 <div className="w-20 h-20 bg-black rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
 <BarChart3 className="text-white" size={32} />
 </div>
 <h3 className="text-2xl font-display font-bold text-gray-900 mb-2">No investments yet</h3>
 <p className="text-gray-500 mb-6 max-w-md mx-auto">Start tracking your investment portfolio today</p>
 <Button
 onClick={() => setCurrentPage('add-investment')}
 className="rounded-full h-11 px-6 shadow-lg bg-black text-white hover:bg-gray-900 transition-transform active:scale-95"
 >
 <Plus size={18} className="mr-2" />
 Add Your First Investment
 </Button>
 </motion.div>
 </Card>
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

