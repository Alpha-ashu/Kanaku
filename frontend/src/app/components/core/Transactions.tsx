import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db, type DocumentRecord } from '@/lib/database';
import { deleteTransactionWithBackendSync, queueRecordUpsertSync } from '@/lib/auth-sync-integration';
import { applyAccountBalanceDeltas, buildTransactionAggregation, getTransactionAccountDeltas } from '@/lib/transactionAggregation';
import { Plus, TrendingUp, TrendingDown, Search, Camera, Edit2, Trash2, ArrowUpRight, ArrowDownLeft, Repeat2, Wallet, Receipt, Layers, Eye, X, ChevronRight, FileText, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { ReceiptScanner } from '@/app/components/transactions/ReceiptScanner';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getSubcategoriesForCategory } from '@/lib/expenseCategories';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';

import { TimeFilter, TimeFilterPeriod, filterByTimePeriod, getPeriodLabel } from '@/app/components/ui/TimeFilter';
import { formatLocalDate, parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import type { TaxComponent } from '@/types/receipt.types';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { DocumentManagementService } from '@/services/documentManagementService';

const CATEGORIES = {
 expense: Object.values(EXPENSE_CATEGORIES).map(cat => cat.name),
 income: Object.values(INCOME_CATEGORIES).map(cat => cat.name),
};

const parseMetadataNumber = (value?: string) => {
 if (!value) return 0;
 const parsed = Number.parseFloat(value);
 return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const parseTaxBreakdown = (value?: string): TaxComponent[] => {
 if (!value) return [];

 try {
 const parsed = JSON.parse(value);
 if (!Array.isArray(parsed)) return [];

 return parsed
 .filter((item): item is TaxComponent => !!item && typeof item === 'object')
 .map((item) => ({
 name: typeof item.name === 'string' ? item.name : 'Tax',
 rate: typeof item.rate === 'number' ? item.rate : undefined,
 amount: typeof item.amount === 'number' ? item.amount : 0,
 }))
 .filter((item) => item.amount > 0);
 } catch {
 return [];
 }
};

const getDocumentIdFromTransaction = (transaction: { attachment?: string; importMetadata?: Record<string, string> }) => {
 const attachmentMatch = transaction.attachment?.match(/^document:(\d+)$/);
 if (attachmentMatch) {
 const documentId = Number.parseInt(attachmentMatch[1], 10);
 if (Number.isFinite(documentId)) return documentId;
 }

 const metadataId = Number.parseInt(transaction.importMetadata?.['Document Id'] || '', 10);
 return Number.isFinite(metadataId) ? metadataId : null;
};

export const Transactions: React.FC = () => {
 const { accounts, transactions, currency, setCurrentPage, refreshData } = useApp();
 const canAdd = useSubFeature('transactions', 'addTransaction');
 const canEdit = useSubFeature('transactions', 'editTransaction');
 const canDelete = useSubFeature('transactions', 'deleteTransaction');
 const canImport = useSubFeature('transactions', 'importStatement');
 const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
 const [searchQuery, setSearchQuery] = useState('');
 const [timePeriod, setTimePeriod] = useState<TimeFilterPeriod>('monthly');
 const [showTransactionTypeModal, setShowTransactionTypeModal] = useState(false);
 const [showScanModal, setShowScanModal] = useState(false);
 const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [transactionToDelete, setTransactionToDelete] = useState<{ id: number; description: string } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [visibleCount, setVisibleCount] = useState(200);
 const [previewDocument, setPreviewDocument] = useState<DocumentRecord | null>(null);
 const [previewUrl, setPreviewUrl] = useState('');
 const [selectedTransaction, setSelectedTransaction] = useState<(typeof transactions)[number] | null>(null);
 const [selectedDate, setSelectedDate] = useState<Date>(new Date());
 const [hasSyncedInitialDate, setHasSyncedInitialDate] = useState(false);
 const documentService = useMemo(() => new DocumentManagementService(), []);

 const deferredSearch = useDeferredValue(searchQuery);
 const normalizedSearch = useMemo(() => deferredSearch.trim().toLowerCase(), [deferredSearch]);

 const filterReferenceDate = useMemo(() => {
 if (transactions.length === 0) return new Date();
 return transactions.reduce((latest, transaction) => {
 const txDate = new Date(transaction.date);
 if (Number.isNaN(txDate.getTime())) return latest;
 return txDate > latest ? txDate : latest;
 }, new Date(transactions[0].date));
 }, [transactions]);

 useEffect(() => {
 if (!hasSyncedInitialDate && transactions.length > 0) {
 setSelectedDate(filterReferenceDate);
 setHasSyncedInitialDate(true);
 }
 }, [filterReferenceDate, hasSyncedInitialDate, transactions.length]);

 const timeFilteredTransactions = useMemo(
 () => filterByTimePeriod(transactions, timePeriod, selectedDate),
 [transactions, timePeriod, selectedDate]
 );

 const filteredTransactions = useMemo(() => {
 const hasSearch = normalizedSearch.length > 0;
 return timeFilteredTransactions.filter((transaction) => {
 if (filterType !== 'all' && transaction.type !== filterType) return false;
 if (!hasSearch) return true;
 const description = transaction.description?.toLowerCase() ?? '';
 const category = transaction.category?.toLowerCase() ?? '';
 return description.includes(normalizedSearch) || category.includes(normalizedSearch);
 });
 }, [timeFilteredTransactions, filterType, normalizedSearch]);

 const stats = useMemo(() => {
 const aggregation = buildTransactionAggregation(timeFilteredTransactions);
 return {
 expenses: aggregation.totalExpenses,
 income: aggregation.totalIncome,
 netFlow: aggregation.netFlow,
 };
 }, [timeFilteredTransactions]);

 const taxStats = useMemo(() => {
 let totalTax = 0;
 let billCount = 0;
 const byCategory: Record<string, number> = {};
 const byType: Record<string, number> = {};

 for (const tx of timeFilteredTransactions) {
 if (tx.type !== 'expense') continue;

 const tax = parseMetadataNumber(tx.importMetadata?.['Tax Amount']);
 const taxBreakdown = parseTaxBreakdown(tx.importMetadata?.['Tax Breakdown']);
 const documentId = getDocumentIdFromTransaction(tx);

 if (documentId) {
 billCount += 1;
 }

 if (tax > 0) {
 totalTax += tax;
 const category = tx.category || 'Other';
 byCategory[category] = (byCategory[category] ?? 0) + tax;
 }

 for (const component of taxBreakdown) {
 byType[component.name] = (byType[component.name] ?? 0) + component.amount;
 }
 }

 const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4);
 const topTaxTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 4);

 return {
 totalTax,
 billCount,
 topCategories,
 topTaxTypes,
 hasTaxData: totalTax > 0 || billCount > 0,
 };
 }, [timeFilteredTransactions]);

 const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

 const accountById = useMemo(() => {
 const map = new Map<number, (typeof accounts)[number]>();
 accounts.forEach((account) => {
 if (account.id != null) map.set(account.id, account);
 });
 return map;
 }, [accounts]);

 useEffect(() => {
 setVisibleCount(200);
 }, [filterType, timePeriod, normalizedSearch]);

 useEffect(() => {
 return () => {
 if (previewUrl) {
 URL.revokeObjectURL(previewUrl);
 }
 };
 }, [previewUrl]);

 const scrollRef = React.useRef<HTMLDivElement>(null);

 const dateRange = useMemo(() => {
 const dates: Date[] = [];
 const baseDate = filterReferenceDate;
 
 if (timePeriod === 'daily' || timePeriod === 'weekly') {
 // 30 days range
 for (let i = -15; i <= 15; i++) {
 const d = new Date(baseDate);
 d.setDate(baseDate.getDate() + i);
 dates.push(d);
 }
 } else if (timePeriod === 'monthly') {
 // 12 months range
 for (let i = -6; i <= 6; i++) {
 const d = new Date(baseDate);
 d.setMonth(baseDate.getMonth() + i);
 dates.push(d);
 }
 } else if (timePeriod === 'yearly') {
 // 5 years range
 for (let i = -2; i <= 2; i++) {
 const d = new Date(baseDate);
 d.setFullYear(baseDate.getFullYear() + i);
 dates.push(d);
 }
 }
 return dates;
 }, [timePeriod, filterReferenceDate]);

 useEffect(() => {
    let timeoutId: any;
    if (scrollRef.current) {
      timeoutId = setTimeout(() => {
        if (scrollRef.current) {
          const activeElement = scrollRef.current.querySelector('[data-selected="true"]');
          if (activeElement) {
            activeElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        }
      }, 50);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [selectedDate, timePeriod, dateRange]);

 const visibleTransactions = useMemo(() => filteredTransactions.slice(0, visibleCount), [filteredTransactions, visibleCount]);

 const hasMoreTransactions = filteredTransactions.length > visibleTransactions.length;
 const shouldAnimateRows = visibleTransactions.length <= 60;
 const RowComponent: React.ElementType = shouldAnimateRows ? motion.tr : 'tr';

 const handleDeleteTransaction = (id: number, description: string) => {
 setTransactionToDelete({ id, description });
 setDeleteModalOpen(true);
 };

 const closePreview = () => {
 if (previewUrl) {
 URL.revokeObjectURL(previewUrl);
 }
 setPreviewUrl('');
 setPreviewDocument(null);
 };

 const handlePreviewBill = async (transaction: (typeof transactions)[number]) => {
 const documentId = getDocumentIdFromTransaction(transaction);
 if (!documentId) {
 toast.error('No bill is attached to this expense yet.');
 return;
 }

 try {
 const document = await documentService.getDocument(documentId);
 if (!document?.fileData) {
 toast.error('The attached bill is missing local preview data.');
 return;
 }

 if (previewUrl) {
 URL.revokeObjectURL(previewUrl);
 }

 const nextPreviewUrl = URL.createObjectURL(document.fileData);
 setPreviewDocument(document);
 setPreviewUrl(nextPreviewUrl);
 } catch (error) {
 console.error('Failed to preview bill:', error);
 toast.error('Failed to open the attached bill.');
 }
 };

 const confirmDeleteTransaction = async () => {
 if (!transactionToDelete) return;
 setIsDeleting(true);
 try {
 // 1. Fetch transaction details to revert account balance
 const tx = await db.transactions.get(transactionToDelete.id);
 if (tx) {
 const now = new Date();
 const reverseDeltas = new Map(
 Array.from(getTransactionAccountDeltas(tx).entries()).map(([accountId, delta]) => [accountId, -delta]),
 );

 // 2. Delete the transaction first so a backend failure cannot leave balance-only changes behind.
 await deleteTransactionWithBackendSync(transactionToDelete.id);
 await applyAccountBalanceDeltas(reverseDeltas, now);
 for (const accountId of reverseDeltas.keys()) {
 queueRecordUpsertSync('accounts', accountId);
 }

 // 3. Clean up linked group expenses if any
 if (tx.groupExpenseId) {
 await db.groupExpenses.delete(tx.groupExpenseId);
 }
 }
 
 toast.success('Transaction deleted and balance reverted');
 setDeleteModalOpen(false);
 setTransactionToDelete(null);
 refreshData();
 } catch (error) {
 console.error('Error deleting transaction:', error);
 toast.error('Failed to delete transaction');
 } finally {
 setIsDeleting(false);
 }
 };

 const [isDesktop, setIsDesktop] = React.useState(false);

 React.useEffect(() => {
 const mediaQuery = window.matchMedia('(min-width: 1024px)');
 setIsDesktop(mediaQuery.matches);
 const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
 if (mediaQuery.addEventListener) {
 mediaQuery.addEventListener('change', handler);
 return () => mediaQuery.removeEventListener('change', handler);
 } else {
 mediaQuery.addListener(handler);
 return () => mediaQuery.removeListener(handler);
 }
 }, []);

 return (
 <CenteredLayout>
 <div className="space-y-6 sm:space-y-8">
 
 <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
 <div className="flex items-center gap-4">
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Transactions</h1>
 </div>
 <div className="flex items-center gap-3">
 {canImport && (
 <Button
 data-testid="transactions-scan-bill-button"
 variant="secondary"
 onClick={() => setShowScanModal(true)}
 className="shadow-sm border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 h-12 px-5 rounded-2xl font-bold"
 >
 <Camera size={18} className="mr-2" />
 Scan Bill
 </Button>
 )}
 {canAdd && (
 <Button
 data-testid="transactions-add-button"
 onClick={() => setShowTransactionTypeModal(true)}
 className="shadow-lg bg-gray-900 hover:bg-gray-800 text-white h-12 px-5 rounded-2xl font-bold"
 >
 <Plus size={18} className="mr-2" />
 Add Transaction
 </Button>
 )}
 </div>
 </div>

  {/* Scrollable Date Selector */}
  <div className="max-w-2xl mx-auto w-full bg-white/95 backdrop-blur-2xl rounded-2xl p-1.5 sm:p-2.5 shadow-[0_8px_25px_rgba(0,0,0,0.02)] border border-white/40 overflow-hidden relative group">
    
    <div 
      ref={scrollRef} 
      className={cn(
        "flex items-center overflow-x-auto gap-1.5 sm:gap-2.5 scrollbar-hide snap-x px-3 py-1 w-full",
        dateRange.length <= 5 ? "justify-center" : "justify-start"
      )}
    >
      {dateRange.length === 0 && (
        <p className="text-slate-400 text-center py-4 font-black uppercase tracking-widest text-[8px] sm:text-[10px] w-full">Loading...</p>
      )}
      {dateRange.map((date, idx) => {
        let isSelected = false;
        let label = '';
        let subLabel = '';
        let isWeekend = false;

        if (timePeriod === 'daily' || timePeriod === 'weekly') {
          isSelected = toLocalDateKey(date) === toLocalDateKey(selectedDate);
          const dayNameRaw = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
          subLabel = dayNameRaw === 'WED' ? 'WEN' : dayNameRaw;
          label = date.getDate().toString();
          isWeekend = date.getDay() === 0 || date.getDay() === 6;
        } else if (timePeriod === 'monthly') {
          isSelected = date.getMonth() === selectedDate.getMonth() && date.getFullYear() === selectedDate.getFullYear();
          label = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
          subLabel = date.getFullYear().toString();
        } else if (timePeriod === 'yearly') {
          isSelected = date.getFullYear() === selectedDate.getFullYear();
          label = date.getFullYear().toString();
          subLabel = 'YEAR';
        }

        return (
          <button
            key={idx}
            data-selected={isSelected}
            onClick={() => setSelectedDate(date)}
            className={cn(
              'flex flex-col items-center justify-center min-w-[38px] sm:min-w-[56px] h-[48px] sm:h-[64px] rounded-lg sm:rounded-2xl transition-all duration-500 snap-center relative shrink-0',
              isSelected
                ? 'bg-slate-900 text-white shadow-md scale-105 z-10'
                : 'bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600'
            )}
          >
            <span className={cn(
              'text-[7px] sm:text-[9px] font-bold tracking-wider mb-0.5',
              isSelected ? 'text-pink-400' : isWeekend ? 'text-rose-500' : 'text-slate-400'
            )}>
              {subLabel}
            </span>
            <span className="text-xs sm:text-base font-black tracking-tight">
              {label}
            </span>
            {isSelected && (
              <div className="absolute -bottom-0.5 w-1 h-1 bg-pink-500 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  </div>

 {/* Filter Bar */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
 <TimeFilter value={timePeriod} onChange={setTimePeriod} />
 </div>

 {/* Stats Board */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
 <Card variant="mesh-green" className="p-4 sm:p-6 relative overflow-hidden group">
 <div className="relative z-10">
 <div className="flex items-center gap-2 mb-2 sm:mb-3 text-white/80">
 <div className="p-1 sm:p-1.5 bg-white/20 rounded-lg backdrop-blur-md">
 <ArrowDownLeft size={14} className="sm:w-4 sm:h-4" />
 </div>
 <span className="font-semibold text-xs sm:text-sm">Total Income</span>
 </div>
 <p className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">{formatCurrency(stats.income)}</p>
 </div>
 <div className="absolute -bottom-4 -right-4 w-24 h-24 sm:w-32 sm:h-32 bg-white/20 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
 </Card>

 <Card variant="mesh-pink" className="p-4 sm:p-6 relative overflow-hidden group">
 <div className="relative z-10">
 <div className="flex items-center gap-2 mb-2 sm:mb-3 text-white/80">
 <div className="p-1 sm:p-1.5 bg-white/20 rounded-lg backdrop-blur-md">
 <ArrowUpRight size={14} className="sm:w-4 sm:h-4" />
 </div>
 <span className="font-semibold text-xs sm:text-sm">Total Expense</span>
 </div>
 <p className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">{formatCurrency(stats.expenses)}</p>
 </div>
 <div className="absolute -bottom-4 -right-4 w-24 h-24 sm:w-32 sm:h-32 bg-white/20 rounded-full blur-2xl group-hover:scale-110 transition-transform" />
 </Card>

 <Card variant="default" className="p-4 sm:p-6 bg-transparent border-white/60 relative overflow-hidden">
 <div className="relative z-10">
 <div className="flex items-center gap-2 mb-2 sm:mb-3 text-gray-500">
 <div className="p-1 sm:p-1.5 bg-gray-100 rounded-lg">
 <TrendingUp size={14} className={cn("sm:w-4 sm:h-4", stats.netFlow >= 0 ?"text-emerald-500" :"text-red-500")} />
 </div>
 <span className="font-semibold text-xs sm:text-sm">Net Flow</span>
 </div>
 <p className={cn(
"text-2xl sm:text-3xl font-display font-bold tracking-tight",
 stats.netFlow >= 0 ?"text-emerald-600" :"text-red-600"
 )}>
 {stats.netFlow > 0 ? '+' : ''}{formatCurrency(stats.netFlow)}
 </p>
 </div>
 </Card>
 </div>

 {/* Tax Summary Card */}
 {taxStats.hasTaxData ? (
 <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-4 sm:p-6">
 <div className="flex items-center gap-2 mb-4">
 <div className="p-2 bg-orange-100 rounded-xl">
 <Layers size={16} className="text-orange-600" />
 </div>
 <div>
 <h3 className="text-sm font-bold text-orange-900">Tax Tracker</h3>
 <p className="text-xs text-orange-600">Taxes paid from scanned bills ({getPeriodLabel(timePeriod)})</p>
 </div>
 <div className="ml-auto text-right">
 <p className="text-xl font-bold text-orange-800">{formatCurrency(taxStats.totalTax)}</p>
 <p className="text-xs text-orange-500">{taxStats.billCount} bill{taxStats.billCount === 1 ? '' : 's'} attached</p>
 </div>
 </div>
 {taxStats.topCategories.length > 0 && (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {taxStats.topCategories.map(([cat, amt]) => (
 <div key={cat} className="rounded-xl bg-white/60 border border-orange-100 px-3 py-2">
 <p className="text-xs font-semibold text-orange-700 truncate">{cat}</p>
 <p className="text-sm font-bold text-orange-900">{formatCurrency(amt)}</p>
 </div>
 ))}
 </div>
 )}
 {taxStats.topTaxTypes.length > 0 && (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
 {taxStats.topTaxTypes.map(([name, amt]) => (
 <div key={name} className="rounded-xl bg-white/60 border border-orange-100 px-3 py-2">
 <p className="text-xs font-semibold text-orange-700 truncate">{name}</p>
 <p className="text-sm font-bold text-orange-900">{formatCurrency(amt)}</p>
 </div>
 ))}
 </div>
 )}
 <p className="text-xs text-orange-500 mt-3">
 Taxes are tracked from structured receipt metadata, including GST, VAT, and other components.
 </p>
 </div>
 ) : (
 <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
 <div className="p-2.5 bg-orange-100 rounded-xl shrink-0">
 <Receipt size={18} className="text-orange-500" />
 </div>
 <div className="flex-1 min-w-0">
 <h3 className="text-sm font-bold text-orange-800">Tax Tracker</h3>
 <p className="text-xs text-orange-600 mt-0.5">
 Scan bills to automatically track GST, VAT, and other taxes paid per category.
 </p>
 </div>
 <button
 data-testid="transactions-tax-scan-bill-button"
 onClick={() => setShowScanModal(true)}
 className="shrink-0 flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600 transition-colors"
 >
 <Camera size={13} /> Scan Bill
 </button>
 </div>
 )}

 {/* Filters & Search */}
 <div className="flex flex-col gap-3 sm:gap-4">
 <div className="relative">
 <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
 <input
 data-testid="transactions-search-input"
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search transactions..."
 className="w-full pl-9 sm:pl-11 pr-3 sm:pr-4 py-2 sm:py-3 bg-white/80 backdrop-blur-md border border-white/40 shadow-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 text-xs sm:text-sm"
 />
 </div>
 <div className="flex bg-gray-100/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/40 shadow-sm w-full">
 {(['all', 'income', 'expense'] as const).map((type) => (
 <button
 key={type}
 data-testid={`transactions-filter-${type}`}
 onClick={() => setFilterType(type)}
 className={cn(
"relative flex-1 flex items-center justify-center py-2 sm:py-2.5 rounded-xl transition-all duration-300 font-bold capitalize text-[10px] sm:text-xs",
 filterType === type
 ?"text-white shadow-md"
 :"text-slate-500 hover:text-slate-700"
 )}
 >
 {filterType === type && (
 <motion.div 
 layoutId="activeFilterPill"
 className="absolute inset-0 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl z-0"
 transition={{ type:"spring", bounce: 0.2, duration: 0.6 }}
 />
 )}
 <span className="relative z-10">{type}</span>
 </button>
 ))}
 </div>
 </div>

 {/* Transaction List */}
 <Card variant="glass" className="overflow-hidden !p-0 min-h-[400px]">

 {/* DESKTOP TABLE (lg+): all 4 columns */}
 <div className="hidden lg:block overflow-x-auto">
 <table className="w-full">
 <thead className="bg-white/50 border-b border-gray-100">
 <tr>
 <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Details</th>
 <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Category</th>
 <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Account</th>
 <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
 <th className="w-24 px-4 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-50">
 {visibleTransactions.map((transaction, i) => {
 const account = accountById.get(transaction.accountId);
 const displayType = transaction.type === 'transfer'
 ? (transaction.subcategory === 'Transfer In' ? 'income' : 'expense')
 : transaction.type;
 const attachedDocumentId = getDocumentIdFromTransaction(transaction);
 const attachedTaxAmount = parseMetadataNumber(transaction.importMetadata?.['Tax Amount']);
 const animationProps = shouldAnimateRows ? {
 initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 },
 transition: { delay: Math.min(i, 12) * 0.02 },
 } : undefined;
 return (
 <RowComponent key={transaction.id} {...(animationProps ?? {})} className="group hover:bg-gray-50/80 transition-colors">
 {/* Details */}
 <td className="px-6 py-4 pl-8">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm border border-white/50 bg-white/40 shrink-0">
 {getCategoryCartoonIcon(transaction.category || 'Miscellaneous', 22)}
 </div>
 <div className="min-w-0">
 <p className="font-bold text-gray-900 text-sm truncate max-w-[200px]">{transaction.description || transaction.category}</p>
 <p className="text-xs text-gray-400 font-medium">{formatLocalDate(transaction.date, 'en-US')}</p>
 {attachedDocumentId && (
 <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-500 mt-0.5">
 <Paperclip size={9} /> Bill attached
 </span>
 )}
 </div>
 </div>
 </td>
 {/* Category */}
 <td className="px-6 py-4">
 <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
 {transaction.category}
 </span>
 </td>
 {/* Account */}
 <td className="px-6 py-4 text-sm font-medium text-gray-500">{account?.name}</td>
 {/* Amount */}
 <td className="px-6 py-4 text-right">
 <span className={cn('font-bold text-sm', displayType === 'income' ? 'text-emerald-600' : 'text-gray-900')}>
 {displayType === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
 </span>
 </td>
 {/* Actions always visible Eye when bill attached, edit/delete on hover */}
 <td className="px-4 py-4 text-right">
 <div className="flex justify-end items-center gap-1">
 {attachedDocumentId && (
 <Button variant="ghost" size="icon"
 className="h-8 w-8 text-orange-400 hover:text-orange-600 hover:bg-orange-50"
 onClick={() => handlePreviewBill(transaction)}
 title="View bill"
 >
 <Eye size={15} />
 </Button>
 )}
 <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 {canEdit && (
 <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600"
 onClick={() => { localStorage.setItem('editTransactionId', transaction.id?.toString() || ''); setCurrentPage('add-transaction'); }}>
 <Edit2 size={14} />
 </Button>
 )}
 {canDelete && (
 <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500"
 onClick={() => handleDeleteTransaction(transaction.id!, transaction.description)}>
 <Trash2 size={14} />
 </Button>
 )}
 </div>
 </div>
 </td>
 </RowComponent>
 );
 })}
 </tbody>
 </table>
 </div>

 {/* MOBILE LIST (< lg): Details + Amount only, tap to open detail sheet */}
 <div className="lg:hidden divide-y divide-gray-50">
 {visibleTransactions.map((transaction, i) => {
 const account = accountById.get(transaction.accountId);
 const displayType = transaction.type === 'transfer'
 ? (transaction.subcategory === 'Transfer In' ? 'income' : 'expense')
 : transaction.type;
 const attachedDocumentId = getDocumentIdFromTransaction(transaction);
 return (
 <button
 key={transaction.id}
 onClick={() => setSelectedTransaction(transaction)}
 className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/80 active:bg-gray-100 transition-colors text-left"
 >
 <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm border border-white/50 bg-white/40 shrink-0">
 {getCategoryCartoonIcon(transaction.category || 'Miscellaneous', 22)}
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-bold text-gray-900 text-sm truncate">{transaction.description || transaction.category}</p>
 <div className="flex items-center gap-2 mt-0.5">
 <p className="text-xs text-gray-400 font-medium">{formatLocalDate(transaction.date, 'en-US')}</p>
 {attachedDocumentId && (
 <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-orange-400">
 <Paperclip size={9} /> Bill
 </span>
 )}
 </div>
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <span className={cn('font-bold text-sm', displayType === 'income' ? 'text-emerald-600' : 'text-gray-900')}>
 {displayType === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
 </span>
 <ChevronRight size={14} className="text-gray-300" />
 </div>
 </button>
 );
 })}
 </div>

 {filteredTransactions.length === 0 && (
 <div className="py-20 flex flex-col items-center text-center">
 <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4">
 <Search className="text-gray-300" size={32} />
 </div>
 <h3 className="text-lg font-bold text-gray-900">No transactions found</h3>
 <p className="text-gray-500 text-sm max-w-xs mt-1">Try adjusting your filters or search query to find what you're looking for.</p>
 </div>
 )}
 {hasMoreTransactions && (
 <div className="flex items-center justify-center py-4">
 <Button variant="secondary" onClick={() => setVisibleCount((c) => c + 200)} className="text-xs h-9 px-4">
 Load more
 </Button>
 </div>
 )}
 </Card>

 {/* MOBILE TRANSACTION DETAIL SHEET */}
 {selectedTransaction && (() => {
 const tx = selectedTransaction;
 const account = accountById.get(tx.accountId);
 const displayType = tx.type === 'transfer' ? (tx.subcategory === 'Transfer In' ? 'income' : 'expense') : tx.type;
 const attachedDocumentId = getDocumentIdFromTransaction(tx);
 const attachedTaxAmount = parseMetadataNumber(tx.importMetadata?.['Tax Amount']);
 return (
 <div className="fixed inset-0 z-[61] lg:hidden flex flex-col justify-end">
 <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedTransaction(null)} />
 <motion.div
 initial={{ y: '100%' }}
 animate={{ y: 0 }}
 exit={{ y: '100%' }}
 transition={{ type: 'spring', stiffness: 400, damping: 40 }}
 className="relative bg-white rounded-t-[32px] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
 >
 {/* Sheet handle */}
 <div className="flex justify-center pt-3 pb-1 shrink-0">
 <div className="w-10 h-1 rounded-full bg-gray-200" />
 </div>

 {/* Sheet header */}
 <div className="flex items-start justify-between gap-3 px-6 pt-4 pb-4 border-b border-gray-100 shrink-0">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white border border-gray-100">
 {getCategoryCartoonIcon(tx.category || 'Miscellaneous', 26)}
 </div>
 <div>
 <p className="font-black text-gray-900 text-base leading-tight">{tx.description || tx.category}</p>
 <p className="text-xs text-gray-400 font-medium mt-0.5">{formatLocalDate(tx.date, 'en-US')}</p>
 </div>
 </div>
 <button onClick={() => setSelectedTransaction(null)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400">
 <X size={18} />
 </button>
 </div>

 {/* Sheet body */}
 <div className="overflow-y-auto flex-1">
 {/* Amount hero */}
 <div className="px-6 py-5 flex items-center justify-between bg-white/60">
 <div>
 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</p>
 <p className={cn('text-3xl font-black tracking-tight mt-0.5', displayType === 'income' ? 'text-emerald-600' : 'text-gray-900')}>
 {displayType === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
 </p>
 </div>
 <span className={cn(
 'px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide',
 displayType === 'income' ? 'bg-emerald-100 text-emerald-700' :
 tx.type === 'transfer' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
 )}>
 {displayType === 'income' ? ' Income' : tx.type === 'transfer' ? ' Transfer' : ' Expense'}
 </span>
 </div>

 {/* Detail rows */}
 <div className="px-6 py-4 space-y-3">
 {[
 { label: 'Category', value: tx.category },
 { label: 'Account', value: account?.name || '' },
 { label: 'Date', value: formatLocalDate(tx.date, 'en-US') },
 ...(attachedTaxAmount > 0 ? [{ label: 'Tax Amount', value: formatCurrency(attachedTaxAmount) }] : []),
 ...(tx.notes ? [{ label: 'Notes', value: tx.notes }] : []),
 ].map(({ label, value }) => (
 <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-50">
 <span className="text-xs font-black text-gray-400 uppercase tracking-widest">{label}</span>
 <span className="text-sm font-bold text-gray-800 text-right max-w-[60%] truncate">{value}</span>
 </div>
 ))}
 </div>

 {/* View Bill button always visible when bill attached */}
 {attachedDocumentId && (
 <div className="px-6 pb-2">
 <button
 onClick={() => { handlePreviewBill(tx); setSelectedTransaction(null); }}
 className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-orange-50 border border-orange-100 text-orange-600 font-black text-sm hover:bg-orange-100 active:scale-[0.98] transition-all"
 >
 <Eye size={16} /> View Attached Bill
 </button>
 </div>
 )}

 {/* Action buttons */}
 <div className="px-6 pb-8 pt-3 grid grid-cols-2 gap-3">
 {canEdit && (
 <button
 onClick={() => { localStorage.setItem('editTransactionId', tx.id?.toString() || ''); setCurrentPage('add-transaction'); setSelectedTransaction(null); }}
 className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 font-black text-sm hover:bg-blue-100 active:scale-[0.98] transition-all"
 >
 <Edit2 size={15} /> Edit
 </button>
 )}
 {canDelete && (
 <button
 onClick={() => { handleDeleteTransaction(tx.id!, tx.description); setSelectedTransaction(null); }}
 className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 font-black text-sm hover:bg-rose-100 active:scale-[0.98] transition-all"
 >
 <Trash2 size={15} /> Delete
 </button>
 )}
 </div>
 </div>
 </motion.div>
 </div>
 );
 })()}

  {/* Transaction Type Modal */}
  {showTransactionTypeModal && (
    <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
        onClick={() => setShowTransactionTypeModal(false)} 
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative bg-white/95 backdrop-blur-2xl rounded-[32px] p-6 sm:p-8 w-full max-w-md shadow-2xl border border-white/50 z-10 max-h-[calc(100vh-2rem)] overflow-y-auto"
      >
        <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-1">New Transaction</h3>
        <p className="text-slate-500 font-medium mb-8">What kind of transaction is this?</p>

        <div className="space-y-3">
            {[
              { type: 'expense', label: 'Expense', desc: 'Money spent', color: 'bg-rose-50 text-rose-700 hover:bg-rose-100', icon: ArrowDownLeft },
              { type: 'income', label: 'Income', desc: 'Money received', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', icon: ArrowUpRight },
              { type: 'transfer', label: 'Transfer', desc: 'Move between accounts', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100', icon: Repeat2 },
            ].map((opt) => (
              <button
                key={opt.type}
                data-testid={`transaction-modal-type-${opt.type}-button`}
                onClick={() => {
                  setShowTransactionTypeModal(false);
                  if (opt.type === 'transfer') {
                    // Always open the Transfer page
                    setCurrentPage('transfer');
                  } else {
                    localStorage.setItem('quickFormType', opt.type);
                    setCurrentPage('add-transaction');
                  }
                }}
                className={cn(
                  "w-full p-4 flex items-center gap-4 rounded-2xl transition-all border border-transparent hover:scale-[1.02] active:scale-[0.98]",
                  opt.color
                )}
              >
              <div className="w-12 h-12 bg-white/80 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                <opt.icon size={22} />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg leading-tight">{opt.label}</p>
                <p className="text-sm opacity-80 font-medium leading-tight">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          className="w-full mt-6 rounded-xl hover:bg-slate-100 text-slate-500 font-bold"
          onClick={() => setShowTransactionTypeModal(false)}
        >
          Cancel
        </Button>
      </motion.div>
    </div>
  )}

 <DeleteConfirmModal
 isOpen={deleteModalOpen}
 title="Delete Transaction"
 message="This transaction will be permanently deleted. This action cannot be undone."
 itemName={transactionToDelete?.description}
 isLoading={isDeleting}
 onConfirm={confirmDeleteTransaction}
 onCancel={() => {
 setDeleteModalOpen(false);
 setTransactionToDelete(null);
 }}
 />

 {previewDocument && previewUrl && (
 <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
 <div className="w-full max-w-4xl rounded-[28px] bg-transparent backdrop-blur-3xl shadow-2xl border border-white/20 overflow-hidden">
 <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
 <div className="min-w-0">
 <h3 className="text-lg font-bold text-gray-900">Attached Bill</h3>
 <p className="text-sm text-gray-500 truncate">{previewDocument.fileName}</p>
 </div>
 <Button
 variant="ghost"
 size="icon"
 className="h-9 w-9 shrink-0 text-gray-500 hover:text-gray-900"
 onClick={closePreview}
 >
 <X size={16} />
 </Button>
 </div>

 <div className="bg-white p-3 sm:p-4">
 <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white min-h-[60vh]">
 {previewDocument.fileType === 'application/pdf' ? (
 <iframe
 src={previewUrl}
 title={previewDocument.fileName}
 className="h-[70vh] w-full"
 />
 ) : (
 <img
 src={previewUrl}
 alt={previewDocument.fileName}
 className="max-h-[70vh] w-full object-contain bg-white"
 />
 )}
 </div>
 </div>
 </div>
 </div>
 )}

 <ReceiptScanner
 isOpen={showScanModal}
 onClose={() => setShowScanModal(false)}
 onTransactionCreated={() => setShowScanModal(false)}
 />
 </div>
 </CenteredLayout>
 );
};

