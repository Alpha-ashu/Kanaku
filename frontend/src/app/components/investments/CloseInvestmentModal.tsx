import React, { useEffect, useMemo, useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { Investment, db } from '@/lib/database';
import { Button } from '@/app/components/ui/button';
import { backendService } from '@/lib/backend-api';
import { saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';
import { formatCurrencyAmount, formatNativeMoney, getConversionRateFromQuotes } from '@/lib/currencyUtils';
import { fetchCurrencyConversionRate, getInvestmentDisplayName, getInvestmentMetrics } from '@/lib/investmentUtils';
import { StockQuote } from '@/lib/stockApi';

interface CloseInvestmentModalProps {
 investment: Investment | null;
 quotes: Record<string, StockQuote | null>;
 isOpen: boolean;
 onClose: () => void;
 onCompleted: () => void;
}

export const CloseInvestmentModal: React.FC<CloseInvestmentModalProps> = ({
 investment,
 quotes,
 isOpen,
 onClose,
 onCompleted,
}) => {
 const { accounts, currency, refreshData } = useApp();
 const activeAccounts = useMemo(
 () => accounts.filter((account) => account.isActive),
 [accounts],
 );
 const metrics = useMemo(
 () => investment ? getInvestmentMetrics(investment, currency, quotes) : null,
 [currency, investment, quotes],
 );
 const [settlementAccountId, setSettlementAccountId] = useState<number>(0);
 const [sellPrice, setSellPrice] = useState('');
 const [closingFees, setClosingFees] = useState('');
 const [closeDate, setCloseDate] = useState(() => new Date().toISOString().split('T')[0]);
 const [closeNotes, setCloseNotes] = useState('');
 const [submitting, setSubmitting] = useState(false);

 useEffect(() => {
 if (!investment || !isOpen) {
 return;
 }

 setSettlementAccountId(activeAccounts[0]?.id ?? 0);
 setSellPrice(metrics?.nativeCurrentPrice ? metrics.nativeCurrentPrice.toFixed(2) : String(investment.currentPrice || ''));
 setClosingFees('');
 setCloseDate(new Date().toISOString().split('T')[0]);
 setCloseNotes('');
 }, [activeAccounts, investment, isOpen, metrics?.nativeCurrentPrice]);

 if (!investment || !metrics || !isOpen) {
 return null;
 }

 const price = parseFloat(sellPrice) || 0;
 const fees = parseFloat(closingFees) || 0;
 const previewFxRate = getConversionRateFromQuotes(metrics.assetCurrency, currency, quotes);
 const grossProceeds = price * investment.quantity * previewFxRate;
 const netProceeds = grossProceeds - fees;
 const realizedProfit = netProceeds - metrics.totalInvested;

 const handleSubmit = async (event: React.FormEvent) => {
 event.preventDefault();

 if (!investment.id) {
 toast.error('This holding is missing an ID and cannot be closed');
 return;
 }

 if (!settlementAccountId) {
 toast.error('Choose an account to receive the sale proceeds');
 return;
 }

 if (price <= 0) {
 toast.error('Sell price must be greater than 0');
 return;
 }

 const settlementAccount = activeAccounts.find((account) => account.id === settlementAccountId);
 if (!settlementAccount?.id) {
 toast.error('Selected account is unavailable');
 return;
 }

 setSubmitting(true);

 try {
 const closeFxRate = await fetchCurrencyConversionRate(metrics.assetCurrency, currency);
 const grossSaleValue = price * investment.quantity * closeFxRate;
 const netSaleValue = grossSaleValue - fees;
 const realizedProfitLoss = netSaleValue - metrics.totalInvested;
 const closeDateValue = new Date(closeDate);
 const now = new Date();
 const displayName = getInvestmentDisplayName(investment.assetName);

 const saleTransaction = {
 type: 'income' as const,
 amount: grossSaleValue,
 accountId: settlementAccount.id,
 category: 'Investment Sale',
 subcategory: investment.assetType,
 description: `Sold ${displayName}`,
 merchant: investment.broker,
 date: closeDateValue,
 tags: ['investment', 'sale'],
 };

 const feeTransaction = fees > 0 ? {
 type: 'expense' as const,
 amount: fees,
 accountId: settlementAccount.id,
 category: 'Investment Fees',
 subcategory: investment.assetType,
 description: `Closing fees for ${displayName}`,
 merchant: investment.broker,
 date: closeDateValue,
 tags: ['investment', 'fee'],
 } : null;

 const investmentUpdates = {
 currentPrice: price,
 currentValue: 0,
 profitLoss: realizedProfitLoss,
 positionStatus: 'closed' as const,
 closedAt: closeDateValue,
 closePrice: price,
 closeFxRate,
 grossSaleValue,
 netSaleValue,
 closingFees: fees,
 realizedProfitLoss,
 settlementAccountId: settlementAccount.id,
 closeNotes,
 lastKnownFxRate: closeFxRate,
 lastUpdated: now,
 updatedAt: now,
 };

 const savedSaleTransaction = await saveTransactionWithBackendSync({
 ...saleTransaction,
 createdAt: now,
 updatedAt: now,
 });
 const savedFeeTransaction = feeTransaction
 ? await saveTransactionWithBackendSync({
 ...feeTransaction,
 createdAt: now,
 updatedAt: now,
 })
 : null;

 const saleTransactionId = savedSaleTransaction.id;
 const feeTransactionId = savedFeeTransaction?.id;

 await db.transaction('rw', db.accounts, db.investments, async () => {
 await db.accounts.update(settlementAccount.id!, {
 balance: settlementAccount.balance + netSaleValue,
 updatedAt: now,
 });

 await db.investments.update(investment.id, {
 ...investmentUpdates,
 saleTransactionId,
 saleFeeTransactionId: feeTransactionId,
 });
 });

 try {
 await backendService.updateInvestment(investment.cloudId ?? String(investment.id), {
 ...investmentUpdates,
 localId: investment.id,
 cloudId: investment.cloudId,
 });
 } catch (error) {
 console.error('Failed to sync closed investment to backend:', error);
 }

 refreshData();
 toast.success('Order completed and proceeds added to your account');
 onCompleted();
 } catch (error) {
 console.error('Failed to close investment:', error);
 toast.error('Failed to complete this order');
 } finally {
 setSubmitting(false);
 }
 };

 return (
 <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
 <div className="w-full max-w-lg rounded-[28px] bg-white border border-white/50 shadow-2xl overflow-hidden">
 <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100">
 <div>
 <p className="text-xs font-bold uppercase tracking-[0.24em] text-gray-400">Complete Order</p>
 <h3 className="mt-1 text-2xl font-display font-bold text-gray-900">{getInvestmentDisplayName(investment.assetName)}</h3>
 <p className="mt-1 text-sm text-gray-500">
 Close this holding and move the proceeds into one of your accounts.
 </p>
 </div>
 <button data-testid="close-investment-modal-close-modal"
 type="button"
 onClick={onClose}
 className="w-10 h-10 rounded-2xl bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center shrink-0"
 aria-label="Close modal"
 >
 <X size={18} className="text-gray-700" />
 </button>
 </div>

 <form data-testid="close-investment-modal-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3">
 <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Quantity</p>
 <p className="mt-1 text-lg font-bold text-gray-900">{investment.quantity}</p>
 </div>
 <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3">
 <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Invested</p>
 <p className="mt-1 text-lg font-bold text-gray-900">{formatCurrencyAmount(metrics.totalInvested, currency)}</p>
 </div>
 </div>

 <div>
 <label className="block text-sm font-semibold text-gray-900 mb-2">Settlement Account</label>
 <div className="relative">
 <Wallet size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
 <select data-testid="close-investment-modal-select"
 value={settlementAccountId}
 onChange={(event) => setSettlementAccountId(parseInt(event.target.value, 10))}
 className="w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10"
 required
 >
 <option data-testid="close-investment-modal-select-account" value="">Select account</option>
 {activeAccounts.map((account) => (
 <option data-testid={`close-investment-modal-option-${account.id}`} key={account.id} value={account.id}>
 {account.name} ({formatCurrencyAmount(account.balance, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
 </option>
 ))}
 </select>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-semibold text-gray-900 mb-2">Sell Price Per Unit</label>
 <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
 <span className="text-gray-600 font-medium">{metrics.assetCurrencySymbol}</span>
 <input data-testid="close-investment-modal-input"
 type="number"
 step="0.01"
 value={sellPrice}
 onChange={(event) => setSellPrice(event.target.value)}
 className="w-full bg-transparent focus:outline-none"
 required
 />
 </div>
 <p className="mt-1 text-xs text-gray-400">
 Current live price: {formatNativeMoney(metrics.nativeCurrentPrice, metrics.assetCurrency)}
 </p>
 </div>

 <div>
 <label className="block text-sm font-semibold text-gray-900 mb-2">Closing Fees</label>
 <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
 <span className="text-gray-600 font-medium">{currency}</span>
 <input data-testid="close-investment-modal-0-00"
 type="number"
 step="0.01"
 min="0"
 value={closingFees}
 onChange={(event) => setClosingFees(event.target.value)}
 className="w-full bg-transparent focus:outline-none"
 placeholder="0.00"
 />
 </div>
 <p className="mt-1 text-xs text-gray-400">Brokerage, platform, taxes, or other exit fees</p>
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-semibold text-gray-900 mb-2">Close Date</label>
 <input data-testid="close-investment-modal-input-2"
 type="date"
 value={closeDate}
 onChange={(event) => setCloseDate(event.target.value)}
 className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10"
 required
 />
 </div>

 <div>
 <label className="block text-sm font-semibold text-gray-900 mb-2">Notes</label>
 <input data-testid="close-investment-modal-optional-exit-note"
 type="text"
 value={closeNotes}
 onChange={(event) => setCloseNotes(event.target.value)}
 className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-black/10"
 placeholder="Optional exit note"
 />
 </div>
 </div>

 <div className="rounded-3xl bg-white border border-gray-200 p-4 space-y-3">
 <div className="flex items-center justify-between text-sm">
 <span className="text-gray-500">Gross proceeds</span>
 <span className="font-bold text-gray-900">{formatCurrencyAmount(grossProceeds, currency)}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-gray-500">Fees</span>
 <span className="font-bold text-gray-900">{formatCurrencyAmount(fees, currency)}</span>
 </div>
 <div className="flex items-center justify-between text-sm">
 <span className="text-gray-500">Net proceeds</span>
 <span className="font-bold text-gray-900">{formatCurrencyAmount(netProceeds, currency)}</span>
 </div>
 <div className="h-px bg-gray-200" />
 <div className="flex items-center justify-between">
 <span className="text-sm font-semibold text-gray-700">Realized P/L</span>
 <span className={`text-lg font-bold ${realizedProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
 {realizedProfit >= 0 ? '+' : ''}{formatCurrencyAmount(realizedProfit, currency)}
 </span>
 </div>
 </div>

 <div className="flex gap-3 pt-1">
 <Button data-testid="close-investment-modal-cancel"
 type="button"
 variant="secondary"
 onClick={onClose}
 className="flex-1 rounded-2xl h-11"
 >
 Cancel
 </Button>
 <Button data-testid="close-investment-modal-button"
 type="submit"
 disabled={submitting}
 className="flex-1 rounded-2xl h-11 bg-black text-white hover:bg-gray-900"
 >
 {submitting ? 'Completing...' : 'Complete Order'}
 </Button>
 </div>
 </form>
 </div>
 </div>
 );
};
