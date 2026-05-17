import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { backendService } from '@/lib/backend-api';
import {
 queueTransactionDeleteSync,
 queueTransactionInsertSync,
 queueTransactionUpdateSync,
} from '@/lib/auth-sync-integration';
import { db } from '@/lib/database';
import { TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatNativeMoney, getCurrencySymbol, normalizeCurrencyCode } from '@/lib/currencyUtils';
import {
 fetchCurrencyConversionRate,
 getInvestmentDisplayName,
 inferInvestmentAssetCurrency,
} from '@/lib/investmentUtils';

export const EditInvestment: React.FC = () => {
 const { accounts, investments, currency, setCurrentPage, refreshData } = useApp();
 const activeAccounts = accounts.filter((account) => account.isActive);
 const [formData, setFormData] = useState({
 assetType: 'stock' as 'stock' | 'crypto' | 'forex' | 'gold' | 'silver' | 'other',
 assetName: '',
 quantity: 0,
 buyPrice: 0,
 currentPrice: 0,
 purchaseDate: new Date().toISOString().split('T')[0],
 fundingAccountId: activeAccounts[0]?.id || 0,
 purchaseFees: 0,
 });
 const [selectedId, setSelectedId] = useState<number | null>(null);
 const [assetCurrencyCode, setAssetCurrencyCode] = useState(() => normalizeCurrencyCode(currency));
 const selectedInvestment = selectedId != null
 ? investments.find((investment) => investment.id === selectedId) ?? null
 : null;
 const hasTrackedPurchaseCashflow = Boolean(
 selectedInvestment?.fundingAccountId ||
 selectedInvestment?.purchaseTransactionId ||
 selectedInvestment?.purchaseFeeTransactionId,
 );

 // Get the investment to edit from localStorage or context
 useEffect(() => {
 const editingId = localStorage.getItem('editingInvestmentId');
 if (editingId) {
 const id = parseInt(editingId);
 setSelectedId(id);
 const investment = investments.find(i => i.id === id);
 if (investment) {
 setAssetCurrencyCode(inferInvestmentAssetCurrency(investment));
 setFormData({
 assetType: investment.assetType,
 assetName: investment.assetName,
 quantity: investment.quantity,
 buyPrice: investment.buyPrice,
 currentPrice: investment.currentPrice,
 purchaseDate: new Date(investment.purchaseDate).toISOString().split('T')[0],
 fundingAccountId: investment.fundingAccountId ?? activeAccounts[0]?.id ?? 0,
 purchaseFees: investment.purchaseFees ?? 0,
 });
 }
 }
 }, [activeAccounts, investments]);

 useEffect(() => {
 if (formData.fundingAccountId || !activeAccounts.length) {
 return;
 }

 setFormData((prev) => ({
 ...prev,
 fundingAccountId: activeAccounts[0]?.id || 0,
 }));
 }, [activeAccounts, formData.fundingAccountId]);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();

 if (!selectedId || !selectedInvestment) {
 toast.error('No investment selected');
 return;
 }

 if (hasTrackedPurchaseCashflow && !formData.fundingAccountId) {
 toast.error('Select a payment account for this purchase');
 return;
 }

 const selectedFundingAccount = hasTrackedPurchaseCashflow
 ? activeAccounts.find((account) => account.id === formData.fundingAccountId)
 : null;

 if (hasTrackedPurchaseCashflow && !selectedFundingAccount?.id) {
 toast.error('Selected payment account is unavailable');
 return;
 }

 const totalInvestedNative = formData.quantity * formData.buyPrice;
 const currentValueNative = formData.quantity * formData.currentPrice;
 const buyFxRate = await fetchCurrencyConversionRate(assetCurrencyCode, currency);
 const currentFxRate = await fetchCurrencyConversionRate(assetCurrencyCode, currency);
 const assetCostInBaseCurrency = totalInvestedNative * buyFxRate;
 const totalInvested = assetCostInBaseCurrency + (hasTrackedPurchaseCashflow ? formData.purchaseFees : 0);
 const currentValue = currentValueNative * currentFxRate;
 const profitLoss = currentValue - totalInvested;

 try {
 const transactionDate = new Date(formData.purchaseDate);
 const now = new Date();

 if (!hasTrackedPurchaseCashflow) {
 await backendService.updateInvestment(selectedInvestment.cloudId ?? String(selectedId), {
 assetType: formData.assetType,
 assetName: formData.assetName,
 quantity: formData.quantity,
 buyPrice: formData.buyPrice,
 currentPrice: formData.currentPrice,
 totalInvested,
 currentValue,
 profitLoss,
 purchaseDate: transactionDate,
 lastUpdated: now,
 updatedAt: now,
 assetCurrency: assetCurrencyCode,
 baseCurrency: currency,
 buyFxRate,
 lastKnownFxRate: currentFxRate,
 totalInvestedNative,
 currentValueNative,
 valuationVersion: 2,
 localId: selectedId,
 cloudId: selectedInvestment.cloudId,
 });

 toast.success('Investment updated successfully');
 localStorage.removeItem('editingInvestmentId');
 refreshData();
 setCurrentPage('investments');
 return;
 }

 const investmentLabel = getInvestmentDisplayName(formData.assetName);
 const purchaseTransaction = {
 type: 'expense' as const,
 amount: assetCostInBaseCurrency,
 accountId: selectedFundingAccount!.id as number,
 category: 'Investment Purchase',
 subcategory: formData.assetType,
 description: `Bought ${investmentLabel}`,
 merchant: selectedInvestment.broker,
 date: transactionDate,
 tags: ['investment', 'purchase'],
 };
 const feeTransaction = formData.purchaseFees > 0 ? {
 type: 'expense' as const,
 amount: formData.purchaseFees,
 accountId: selectedFundingAccount!.id as number,
 category: 'Investment Fees',
 subcategory: formData.assetType,
 description: `Purchase fees for ${investmentLabel}`,
 merchant: selectedInvestment.broker,
 date: transactionDate,
 tags: ['investment', 'fee'],
 } : null;

 let purchaseTransactionId = selectedInvestment.purchaseTransactionId;
 let purchaseFeeTransactionId = selectedInvestment.purchaseFeeTransactionId;
 let shouldInsertPurchaseTransaction = false;
 let purchaseFeeTransactionSyncAction: 'insert' | 'update' | 'delete' | null = null;
 let deletedFeeTransactionId: number | undefined;

 await db.transaction('rw', db.accounts, db.transactions, db.investments, async () => {
 const latestInvestment = await db.investments.get(selectedId);
 if (!latestInvestment?.id) {
 throw new Error('Investment no longer exists');
 }

 const previousFundingAccount = latestInvestment.fundingAccountId
 ? await db.accounts.get(latestInvestment.fundingAccountId)
 : undefined;
 const nextFundingAccount = await db.accounts.get(selectedFundingAccount!.id);
 if (!nextFundingAccount?.id) {
 throw new Error('Selected payment account is unavailable');
 }

 const previousPurchaseTransaction = latestInvestment.purchaseTransactionId
 ? await db.transactions.get(latestInvestment.purchaseTransactionId)
 : undefined;
 const previousFeeTransaction = latestInvestment.purchaseFeeTransactionId
 ? await db.transactions.get(latestInvestment.purchaseFeeTransactionId)
 : undefined;
 const previousAssetCost = Number(
 previousPurchaseTransaction?.amount ??
 Math.max((latestInvestment.totalInvested ?? 0) - (latestInvestment.purchaseFees ?? 0), 0),
 );
 const previousFeeCost = Number(previousFeeTransaction?.amount ?? latestInvestment.purchaseFees ?? 0);
 const previousTotalPurchaseCost = previousAssetCost + previousFeeCost;

 if (previousFundingAccount?.id === nextFundingAccount.id) {
 const nextBalance = nextFundingAccount.balance - (totalInvested - previousTotalPurchaseCost);
 if (nextBalance < 0) {
 throw new Error('INSUFFICIENT_FUNDS');
 }

 await db.accounts.update(nextFundingAccount.id, {
 balance: nextBalance,
 updatedAt: now,
 });
 } else {
 if (nextFundingAccount.balance < totalInvested) {
 throw new Error('INSUFFICIENT_FUNDS');
 }

 if (previousFundingAccount?.id) {
 await db.accounts.update(previousFundingAccount.id, {
 balance: previousFundingAccount.balance + previousTotalPurchaseCost,
 updatedAt: now,
 });
 }

 await db.accounts.update(nextFundingAccount.id, {
 balance: nextFundingAccount.balance - totalInvested,
 updatedAt: now,
 });
 }

 if (previousPurchaseTransaction?.id) {
 await db.transactions.update(previousPurchaseTransaction.id, {
 ...purchaseTransaction,
 updatedAt: now,
 });
 purchaseTransactionId = previousPurchaseTransaction.id;
 } else {
 purchaseTransactionId = await db.transactions.add({
 ...purchaseTransaction,
 createdAt: now,
 updatedAt: now,
 });
 shouldInsertPurchaseTransaction = true;
 }

 if (feeTransaction) {
 if (previousFeeTransaction?.id) {
 await db.transactions.update(previousFeeTransaction.id, {
 ...feeTransaction,
 updatedAt: now,
 });
 purchaseFeeTransactionId = previousFeeTransaction.id;
 purchaseFeeTransactionSyncAction = 'update';
 } else {
 purchaseFeeTransactionId = await db.transactions.add({
 ...feeTransaction,
 createdAt: now,
 updatedAt: now,
 });
 purchaseFeeTransactionSyncAction = 'insert';
 }
 } else if (previousFeeTransaction?.id) {
 deletedFeeTransactionId = previousFeeTransaction.id;
 purchaseFeeTransactionId = undefined;
 purchaseFeeTransactionSyncAction = 'delete';
 await db.transactions.delete(previousFeeTransaction.id);
 }

 await db.investments.update(selectedId, {
 assetType: formData.assetType,
 assetName: formData.assetName,
 quantity: formData.quantity,
 buyPrice: formData.buyPrice,
 currentPrice: formData.currentPrice,
 totalInvested,
 currentValue,
 profitLoss,
 purchaseDate: transactionDate,
 lastUpdated: now,
 assetCurrency: assetCurrencyCode,
 baseCurrency: currency,
 buyFxRate,
 lastKnownFxRate: currentFxRate,
 totalInvestedNative,
 currentValueNative,
 valuationVersion: 2,
 fundingAccountId: selectedFundingAccount!.id,
 purchaseFees: formData.purchaseFees,
 purchaseTransactionId,
 purchaseFeeTransactionId,
 updatedAt: now,
 });
 });

 if (purchaseTransactionId) {
 if (shouldInsertPurchaseTransaction) {
 queueTransactionInsertSync(purchaseTransactionId, purchaseTransaction);
 } else {
 queueTransactionUpdateSync(purchaseTransactionId, purchaseTransaction);
 }
 }

 if (purchaseFeeTransactionId && feeTransaction) {
 if (purchaseFeeTransactionSyncAction === 'insert') {
 queueTransactionInsertSync(purchaseFeeTransactionId, feeTransaction);
 } else if (purchaseFeeTransactionSyncAction === 'update') {
 queueTransactionUpdateSync(purchaseFeeTransactionId, feeTransaction);
 }
 }

 if (purchaseFeeTransactionSyncAction === 'delete' && deletedFeeTransactionId) {
 queueTransactionDeleteSync(deletedFeeTransactionId);
 }

 await backendService.updateInvestment(selectedInvestment.cloudId ?? String(selectedId), {
 assetType: formData.assetType,
 assetName: formData.assetName,
 quantity: formData.quantity,
 buyPrice: formData.buyPrice,
 currentPrice: formData.currentPrice,
 totalInvested,
 currentValue,
 profitLoss,
 purchaseDate: transactionDate,
 lastUpdated: now,
 updatedAt: now,
 assetCurrency: assetCurrencyCode,
 baseCurrency: currency,
 buyFxRate,
 lastKnownFxRate: currentFxRate,
 totalInvestedNative,
 currentValueNative,
 valuationVersion: 2,
 fundingAccountId: selectedFundingAccount!.id,
 purchaseFees: formData.purchaseFees,
 localId: selectedId,
 cloudId: selectedInvestment.cloudId,
 });

 toast.success('Investment updated successfully');
 localStorage.removeItem('editingInvestmentId');
 refreshData();
 setCurrentPage('investments');
 } catch (error) {
 if (error instanceof Error && error.message === 'INSUFFICIENT_FUNDS') {
 toast.error('Selected account does not have enough balance for this update');
 return;
 }

 toast.error('Failed to update investment');
 console.error(error);
 }
 };

 return (
 <CenteredLayout>
 <div className="max-w-2xl lg:max-w-4xl mx-auto">
 <PageHeader
 title="Edit Investment"
 subtitle="Update your investment details"
 icon={<TrendingUp size={20} className="sm:w-6 sm:h-6" />}
 showBack
 backTo="investments"
 onBack={() => localStorage.removeItem('editingInvestmentId')}
 />

 <div className="bg-white rounded-xl border border-gray-200 p-8">
 <form onSubmit={handleSubmit} className="space-y-6">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Asset Type</label>
 <select
 value={formData.assetType}
 onChange={(e) => setFormData({ ...formData, assetType: e.target.value as any })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 aria-label="Asset Type"
 title="Asset Type"
 >
 <option value="stock">Stock</option>
 <option value="crypto">Cryptocurrency</option>
 <option value="forex">Forex</option>
 <option value="gold">Gold</option>
 <option value="silver">Silver</option>
 <option value="other">Other</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Asset Name</label>
 <input
 type="text"
 value={formData.assetName}
 onChange={(e) => setFormData({ ...formData, assetName: e.target.value })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 placeholder="e.g., AAPL, Bitcoin, Gold Bar"
 required
 aria-label="Asset Name"
 title="Asset Name"
 />
 </div>

 <div className="grid grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
 <input
 type="number"
 step="0.01"
 value={formData.quantity || ''}
 onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 required
 aria-label="Quantity"
 title="Quantity"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Buy Price</label>
 <input
 type="number"
 step="0.01"
 value={formData.buyPrice || ''}
 onChange={(e) => setFormData({ ...formData, buyPrice: parseFloat(e.target.value) || 0 })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 required
 aria-label="Buy Price"
 title="Buy Price"
 />
 <p className="mt-1 text-xs text-gray-400">Entered in {assetCurrencyCode}</p>
 </div>
 </div>

 {hasTrackedPurchaseCashflow ? (
 <div className="grid grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Payment Account</label>
 <select
 value={formData.fundingAccountId || ''}
 onChange={(e) => setFormData({ ...formData, fundingAccountId: parseInt(e.target.value, 10) || 0 })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 required
 title="Payment Account"
 >
 <option value="">Select an account</option>
 {activeAccounts.map((account) => (
 <option key={account.id} value={account.id}>
 {account.name} ({formatNativeMoney(account.balance, currency)})
 </option>
 ))}
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Buy-side Fees</label>
 <input
 type="number"
 step="0.01"
 min="0"
 value={formData.purchaseFees || ''}
 onChange={(e) => setFormData({ ...formData, purchaseFees: parseFloat(e.target.value) || 0 })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 title="Buy-side Fees"
 />
 <p className="mt-1 text-xs text-gray-400">Entered in {currency}</p>
 </div>
 </div>
 ) : (
 <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
 <p className="text-sm font-medium text-amber-900">Legacy holding</p>
 <p className="mt-1 text-sm text-amber-800">
 This investment was created before account-linked purchase tracking. Editing it will update valuation only and will not deduct money from any account.
 </p>
 </div>
 )}

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Current Price</label>
 <input
 type="number"
 step="0.01"
 value={formData.currentPrice || ''}
 onChange={(e) => setFormData({ ...formData, currentPrice: parseFloat(e.target.value) || 0 })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 required
 aria-label="Current Price"
 title="Current Price"
 />
 <p className="mt-1 text-xs text-gray-400">Entered in {assetCurrencyCode}</p>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Date</label>
 <input
 type="date"
 value={formData.purchaseDate}
 onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
 className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
 required
 aria-label="Purchase Date"
 title="Purchase Date"
 placeholder="Purchase Date"
 />
 </div>

 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
 <p className="text-sm text-blue-700">
 Total Investment: <span className="font-semibold">{formatNativeMoney(formData.quantity * formData.buyPrice, assetCurrencyCode)}</span>
 </p>
 {hasTrackedPurchaseCashflow && formData.purchaseFees > 0 && (
 <p className="text-sm text-blue-700 mt-2">
 Buy-side Fees: <span className="font-semibold">{formatNativeMoney(formData.purchaseFees, currency)}</span>
 </p>
 )}
 {hasTrackedPurchaseCashflow && !!formData.fundingAccountId && (
 <p className="text-sm text-blue-700 mt-2">
 Payment Account: <span className="font-semibold">{activeAccounts.find((account) => account.id === formData.fundingAccountId)?.name || 'Selected account'}</span>
 </p>
 )}
 <p className="text-sm text-blue-700 mt-2">
 Current Value: <span className="font-semibold">{formatNativeMoney(formData.quantity * formData.currentPrice, assetCurrencyCode)}</span>
 </p>
 <p className={`text-sm mt-2 font-semibold ${(formData.quantity * formData.currentPrice) - (formData.quantity * formData.buyPrice) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
 Profit/Loss: {((formData.quantity * formData.currentPrice) - (formData.quantity * formData.buyPrice)) >= 0 ? '+' : '-'}
 {formatNativeMoney(Math.abs((formData.quantity * formData.currentPrice) - (formData.quantity * formData.buyPrice)), assetCurrencyCode)}
 </p>
 {assetCurrencyCode !== normalizeCurrencyCode(currency) && (
 <p className="text-xs text-blue-600 mt-2">
 Portfolio totals will be recalculated in {getCurrencySymbol(currency)} when you save.
 </p>
 )}
 </div>

 <div className="flex gap-3 pt-4">
 <button
 type="button"
 onClick={() => {
 localStorage.removeItem('editingInvestmentId');
 setCurrentPage('investments');
 }}
 className="flex-1 px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
 aria-label="Cancel"
 title="Cancel"
 >
 Cancel
 </button>
 <button
 type="submit"
 className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
 aria-label="Update Investment"
 title="Update Investment"
 >
 Update Investment
 </button>
 </div>
 </form>
 </div>
 </div>
 </CenteredLayout>
 );
};

