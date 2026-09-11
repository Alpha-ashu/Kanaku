import React, { useState, useMemo, useEffect, useDeferredValue, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db, type DocumentRecord } from '@/lib/database';
import { deleteTransactionWithBackendSync, queueRecordUpsertSync } from '@/lib/auth-sync-integration';
import { applyAccountBalanceDeltas, buildTransactionAggregation, getTransactionAccountDeltas } from '@/lib/transactionAggregation';
import { Plus, TrendingUp, TrendingDown, Search, Camera, Edit2, Trash2, ArrowUpRight, ArrowDownLeft, Repeat2, Wallet, Receipt, Layers, Eye, X, ChevronLeft, ChevronRight, FileText, Paperclip, ArrowLeft } from 'lucide-react';
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
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { InfiniteScrollFooter } from '@/app/components/ui/InfiniteScrollFooter';
import { backendSyncService } from '@/lib/backend-sync-service';
import { AppDateStrip } from '@/app/components/ui/AppDateStrip';
import { TimeFilter, TimeFilterPeriod, filterByTimePeriod, getPeriodLabel } from '@/app/components/ui/TimeFilter';
import { formatLocalDate, parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import { backendService } from '@/lib/backend-api';
import type { TaxComponent } from '@/types/receipt.types';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { DocumentManagementService } from '@/services/documentManagementService';
import { calculateTaxSummary } from '@/lib/taxService';
import { useLiveQuery } from 'dexie-react-hooks';

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

export interface TransactionAttachmentRef {
  type: 'cloud' | 'local';
  id: string | number;
}

const getTransactionAttachment = (transaction: { attachment?: string; importMetadata?: Record<string, string> }): TransactionAttachmentRef | null => {
  if (transaction.attachment) {
    const raw = String(transaction.attachment).trim();
    const billMatch = raw.match(/^bill:(.+)$/);
    if (billMatch) {
      return { type: 'cloud', id: billMatch[1].trim() };
    }
    const docMatch = raw.match(/^document:(\d+)$/);
    if (docMatch) {
      const docId = Number.parseInt(docMatch[1], 10);
      if (Number.isFinite(docId)) return { type: 'local', id: docId };
    }
    // Direct UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
      return { type: 'cloud', id: raw };
    }
  }

  const metadataId = Number.parseInt(transaction.importMetadata?.['Document Id'] || '', 10);
  if (Number.isFinite(metadataId)) {
    return { type: 'local', id: metadataId };
  }

  return null;
};

const getDocumentIdFromTransaction = (transaction: { attachment?: string; importMetadata?: Record<string, string> }): string | number | null => {
  const ref = getTransactionAttachment(transaction);
  return ref ? ref.id : null;
};

export const Transactions: React.FC = () => {
 const { accounts, transactions, currency, setCurrentPage, refreshData } = useApp();
 const canAdd = useSubFeature('transactions', 'addTransaction');
 const canEdit = useSubFeature('transactions', 'editTransaction');
 const canDelete = useSubFeature('transactions', 'deleteTransaction');
 const canImport = useSubFeature('transactions', 'importStatement');
 const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
 const [searchQuery, setSearchQuery] = useState('');
 const [timePeriod, setTimePeriod] = useState<TimeFilterPeriod>('daily');
 const [showTransactionTypeModal, setShowTransactionTypeModal] = useState(false);
 const [showScanModal, setShowScanModal] = useState(false);
 const [deleteModalOpen, setDeleteModalOpen] = useState(false);
 const [transactionToDelete, setTransactionToDelete] = useState<{ id: number; description: string } | null>(null);
 const [isDeleting, setIsDeleting] = useState(false);
 const [previewDocument, setPreviewDocument] = useState<DocumentRecord | null>(null);
 const [previewUrl, setPreviewUrl] = useState('');
 const [selectedTransaction, setSelectedTransaction] = useState<(typeof transactions)[number] | null>(null);
 const [selectedDate, setSelectedDate] = useState<Date>(new Date());
 const [hasSyncedInitialDate, setHasSyncedInitialDate] = useState(false);
 const documentService = useMemo(() => new DocumentManagementService(), []);
 const localDocuments = useLiveQuery(() => db.documents.toArray(), []) || [];

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
  }, [hasSyncedInitialDate, transactions, filterReferenceDate]);

  useEffect(() => {
    documentService.migrateLegacyLocalAttachments().catch(() => {});
  }, [documentService]);

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

  const currentTxIndex = useMemo(() => {
    if (!selectedTransaction) return -1;
    return filteredTransactions.findIndex((t) => {
      if (selectedTransaction.id != null && t.id != null) {
        return t.id === selectedTransaction.id;
      }
      if (selectedTransaction.cloudId != null && t.cloudId != null) {
        return t.cloudId === selectedTransaction.cloudId;
      }
      return t === selectedTransaction;
    });
  }, [filteredTransactions, selectedTransaction]);

  const hasPrevTx = currentTxIndex > 0;
  const hasNextTx = currentTxIndex >= 0 && currentTxIndex < filteredTransactions.length - 1;

  const handlePrevTx = useCallback(() => {
    if (currentTxIndex > 0) {
      setSelectedTransaction(filteredTransactions[currentTxIndex - 1]);
    }
  }, [currentTxIndex, filteredTransactions]);

  const handleNextTx = useCallback(() => {
    if (currentTxIndex >= 0 && currentTxIndex < filteredTransactions.length - 1) {
      setSelectedTransaction(filteredTransactions[currentTxIndex + 1]);
    }
  }, [currentTxIndex, filteredTransactions]);

  useEffect(() => {
    if (!selectedTransaction) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevTx();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextTx();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedTransaction(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTransaction, handlePrevTx, handleNextTx]);

 const stats = useMemo(() => {
 const aggregation = buildTransactionAggregation(timeFilteredTransactions);
 return {
 expenses: aggregation.totalExpenses,
 income: aggregation.totalIncome,
 netFlow: aggregation.netFlow,
 };
 }, [timeFilteredTransactions]);

 const taxSummary = useMemo(() => {
 return calculateTaxSummary(transactions, localDocuments);
 }, [transactions, localDocuments]);

 const formatCurrency = (amount: number) => formatCurrencyAmount(amount, currency);

 const accountById = useMemo(() => {
 const map = new Map<number, (typeof accounts)[number]>();
 accounts.forEach((account) => {
 if (account.id != null) map.set(account.id, account);
 });
 return map;
 }, [accounts]);

 useEffect(() => {
 return () => {
 if (previewUrl) {
 URL.revokeObjectURL(previewUrl);
 }
 };
 }, [previewUrl]);

  const {
    visibleItems: visibleTransactions,
    hasMore: hasMoreTransactions,
    isLoadingMore,
    error: infiniteScrollError,
    retry: retryLoadMore,
    sentinelRef,
    totalCount,
  } = useInfiniteScroll({
    items: filteredTransactions,
    pageSize: 25,
    initialPageSize: 25,
    resetDeps: [normalizedSearch, filterType, timePeriod, selectedDate],
    getItemKey: (item) => item.id ?? item.cloudId ?? `${item.date}-${item.amount}-${item.description}`,
  });

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
    const attachmentRef = getTransactionAttachment(transaction);
    if (!attachmentRef) {
      toast.error('No bill is attached to this expense yet.');
      return;
    }

    try {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }

      if (attachmentRef.type === 'cloud') {
        const cleanBillId = String(attachmentRef.id);
        // 1. Check local Dexie cache first
        const cachedDoc = await db.documents.where('cloudId').equals(cleanBillId).first();
        if (cachedDoc?.fileData) {
          const nextPreviewUrl = URL.createObjectURL(cachedDoc.fileData);
          setPreviewDocument(cachedDoc);
          setPreviewUrl(nextPreviewUrl);
          return;
        }

        // 2. Fetch bill metadata and file URL from backend
        const bill = await backendService.getExpenseBill(cleanBillId);
        const resolvedUrl = bill?.downloadUrl || backendService.getBillFileUrl(cleanBillId);

        setPreviewDocument({
          fileName: bill?.fileName || 'Attached Bill',
          fileType: bill?.fileType || 'image/jpeg',
          uploadDate: bill?.uploadedAt ? new Date(bill.uploadedAt) : new Date(),
          processingStatus: 'completed',
          documentType: 'receipt',
          fileSize: bill?.fileSize || 0,
          cloudId: cleanBillId,
          downloadUrl: resolvedUrl,
          createdAt: new Date(),
        });
        setPreviewUrl(resolvedUrl);
        return;
      }

      // Legacy local document handling
      const documentId = Number(attachmentRef.id);
      const document = await documentService.getDocument(documentId);
      if (!document?.fileData) {
        if (document?.cloudId) {
          const resolvedUrl = document.downloadUrl || backendService.getBillFileUrl(document.cloudId);
          setPreviewDocument(document);
          setPreviewUrl(resolvedUrl);
          return;
        }
        toast.error('The attached bill is missing local preview data.');
        return;
      }

      const nextPreviewUrl = URL.createObjectURL(document.fileData);
      setPreviewDocument(document);
      setPreviewUrl(nextPreviewUrl);

      // Trigger background upload of local attachment to the cloud
      documentService.migrateLegacyLocalAttachments().catch(() => {});
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
    <CenteredLayout
      onRefresh={async () => {
        await backendSyncService.syncWithBackend();
        refreshData();
      }}
    >
 <div className="space-y-6 sm:space-y-8">
 
  <div className="flex items-center justify-between gap-3 w-full">
    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
      <button
        type="button"
        onClick={() => setCurrentPage('dashboard')}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
        aria-label="Go to dashboard"
        title="Go to dashboard"
        data-testid="transactions-go-back-button"
      >
        <ArrowLeft size={18} className="text-slate-700" />
      </button>
      <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none truncate">Transactions</h1>
    </div>
    <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
      {canImport && (
        <Button
          data-testid="transactions-scan-bill-button"
          variant="secondary"
          onClick={() => setShowScanModal(true)}
          className="shadow-2xs border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-800 h-9 sm:h-10 px-3.5 sm:px-4 rounded-full font-bold text-xs sm:text-sm"
        >
          <Camera size={16} className="mr-1.5" />
          <span>Scan Bill</span>
        </Button>
      )}
      {canAdd && (
        <Button
          data-testid="transactions-add-button"
          onClick={() => setShowTransactionTypeModal(true)}
          className="shadow-sm bg-slate-950 hover:bg-slate-800 text-white h-9 sm:h-10 px-4 sm:px-5 rounded-full font-bold text-xs sm:text-sm"
        >
          <Plus size={16} className="mr-1.5" />
          <span>Add Transaction</span>
        </Button>
      )}
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
      <TimeFilter value={timePeriod} onChange={setTimePeriod} testId="transactions-time-filter" />
    </div>
  </div>

  {/* Stats Board - Soft rounded reference style with pastel badges */}
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
    <Card data-testid="transactions-card" variant="default" className="p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden group">
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/50">
            Total Income
          </span>
          <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
            <ArrowDownLeft size={16} />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">{formatCurrency(stats.income)}</p>
      </div>
    </Card>

    <Card data-testid="transactions-card-2" variant="default" className="p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden group">
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/50">
            Total Expense
          </span>
          <div className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
            <ArrowUpRight size={16} />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight">{formatCurrency(stats.expenses)}</p>
      </div>
    </Card>

    <Card data-testid="transactions-card-3" variant="default" className="p-5 sm:p-6 bg-white dark:bg-card border border-slate-100 dark:border-border/60 rounded-[28px] sm:rounded-[32px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/50">
            Net Flow
          </span>
          <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
            <TrendingUp size={16} className={cn(stats.netFlow >= 0 ? "text-emerald-500" : "text-rose-500")} />
          </div>
        </div>
        <p className={cn(
          "text-2xl sm:text-3xl font-display font-bold tracking-tight",
          stats.netFlow >= 0 ? "text-slate-900 dark:text-white" : "text-rose-600"
        )}>
          {stats.netFlow > 0 ? '+' : ''}{formatCurrency(stats.netFlow)}
        </p>
      </div>
    </Card>
  </div>

  {/* Tax Summary Card */}
  <div className="rounded-[28px] border border-purple-100/70 bg-white/90 dark:bg-card p-5 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)]">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
          <Receipt size={18} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Tax Summary</h3>
          <p className="text-xs text-slate-500">Taxes recorded across verified receipts & transactions</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCurrentPage('receipt-scanner')}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-3.5 py-1.5 rounded-full transition-colors cursor-pointer self-start sm:self-auto"
      >
        <Camera size={13} />
        <span>Receipt Scanner</span>
        <ChevronRight size={13} />
      </button>
    </div>

    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="rounded-2xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40 p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Total Tax</span>
        <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white">{formatCurrency(taxSummary.totalTax)}</p>
      </div>
      <div className="rounded-2xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40 p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">This Week</span>
        <p className="text-sm sm:text-base font-black text-purple-700">{formatCurrency(taxSummary.weeklyTax)}</p>
      </div>
      <div className="rounded-2xl bg-slate-50/70 dark:bg-muted/40 border border-slate-100 dark:border-border/40 p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">This Month</span>
        <p className="text-sm sm:text-base font-black text-slate-900 dark:text-white">{formatCurrency(taxSummary.monthlyTax)}</p>
      </div>
    </div>
  </div>

  {/* Filters & Search */}
  <div className="flex flex-col gap-3 sm:gap-4">
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 sm:w-5 sm:h-5" />
      <input
        data-testid="transactions-search-input"
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search transactions..."
        className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-300 text-xs sm:text-sm text-slate-900"
      />
    </div>
    <div className="flex bg-slate-100/90 dark:bg-muted p-1.5 rounded-full border border-slate-200/60 shadow-inner w-full">
      {(['all', 'income', 'expense'] as const).map((type) => {
        const isActive = filterType === type;
        return (
          <button
            key={type}
            data-testid={`transactions-filter-${type}`}
            onClick={() => setFilterType(type)}
            className={cn(
              'flex-1 flex items-center justify-center py-2 px-3 rounded-full transition-all duration-150 font-semibold capitalize text-xs select-none',
              isActive
                ? 'bg-[#18181B] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            )}
          >
            <span>{type === 'all' ? 'All' : type === 'income' ? 'Income' : 'Expense'}</span>
          </button>
        );
      })}
    </div>
  </div>

  {/* Transaction List */}
  <Card data-testid="transactions-card-4" variant="glass" className="overflow-hidden !p-0 min-h-[400px] rounded-[28px] sm:rounded-[32px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] bg-white/95">

 {/* DESKTOP TABLE (lg+): all 4 columns */}
 <div className="hidden lg:block overflow-x-auto">
 <table data-testid="transactions-table" className="w-full">
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
  <RowComponent
    key={transaction.id}
    {...(animationProps ?? {})}
    onClick={() => setSelectedTransaction(transaction)}
    className="group hover:bg-slate-50/80 transition-colors cursor-pointer"
  >
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
  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
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
 <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
 <div className="flex justify-end items-center gap-1">
 {attachedDocumentId && (
 <Button data-testid={`transactions-view-bill-${transaction.id}`} variant="ghost" size="icon"
 className="h-8 w-8 text-orange-400 hover:text-orange-600 hover:bg-orange-50"
 onClick={() => handlePreviewBill(transaction)}
 title="View bill"
 >
 <Eye size={15} />
 </Button>
 )}
 <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 {canEdit && (
 <Button data-testid={`transactions-button-2-${transaction.id}`} variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-blue-600"
 onClick={() => { localStorage.setItem('editTransactionId', transaction.id?.toString() || ''); setCurrentPage('add-transaction'); }}>
 <Edit2 size={14} />
 </Button>
 )}
 {canDelete && (
 <Button data-testid={`transactions-button-3-${transaction.id}`} variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500"
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
 <button data-testid={`transactions-button-4-${transaction.id}`}
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
  {filteredTransactions.length > 0 && (
    <InfiniteScrollFooter
      hasMore={hasMoreTransactions}
      isLoadingMore={isLoadingMore}
      error={infiniteScrollError}
      onRetry={retryLoadMore}
      sentinelRef={sentinelRef}
      totalCount={totalCount}
      loadingText="Loading more transactions..."
      endOfListText="All transactions loaded"
    />
  )}
 </Card>

  {/* PROPER TRANSACTION DETAIL POPUP SCREEN */}
  {selectedTransaction && typeof document !== 'undefined' && createPortal(
    (() => {
      const tx = selectedTransaction;
      const account = accountById.get(tx.accountId);
      const displayType = tx.type === 'transfer' ? (tx.subcategory === 'Transfer In' ? 'income' : 'expense') : tx.type;
      const attachedDocumentId = getDocumentIdFromTransaction(tx);
      const attachedTaxAmount = parseMetadataNumber(tx.importMetadata?.['Tax Amount']);
      return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3.5 sm:p-6 overflow-y-auto">
          {/* Backdrop blur overlay */}
          <div
            data-testid="transactions-div"
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={() => setSelectedTransaction(null)}
          />

          {/* Proper Popup Modal Dialog */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 360 }}
            className="relative bg-white rounded-[28px] sm:rounded-[36px] overflow-hidden shadow-[0_25px_50px_-12px_rgba(15,23,42,0.25)] border border-slate-100 w-full max-w-lg max-h-[calc(100dvh-2.5rem)] flex flex-col z-[121] my-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-50 border border-slate-100/80 shadow-xs shrink-0">
                  {getCategoryCartoonIcon(tx.category || 'Miscellaneous', 26)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-slate-900 text-base sm:text-lg leading-tight truncate">
                    {tx.description || tx.category}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-xs text-slate-400 font-medium">
                      {formatLocalDate(tx.date, 'en-US')}
                    </p>
                    {attachedDocumentId && (
                      <button
                        type="button"
                        data-testid="transactions-header-view-bill"
                        onClick={() => { handlePreviewBill(tx); setSelectedTransaction(null); }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/70 text-[11px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                        title="View attached bill"
                      >
                        <Paperclip size={11} className="shrink-0" />
                        <span>Bill attached</span>
                        <Eye size={11} className="shrink-0 text-purple-600 ml-0.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Header navigation pill & close button */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="inline-flex items-center bg-slate-100/90 rounded-full p-1 border border-slate-200/60 shadow-xs">
                  <button
                    data-testid="transactions-header-prev-btn"
                    onClick={handlePrevTx}
                    disabled={!hasPrevTx}
                    className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
                    title="Previous transaction (Left Arrow)"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-[11px] font-bold text-slate-600 px-2 min-w-[44px] text-center select-none">
                    {currentTxIndex >= 0 ? `${currentTxIndex + 1}/${filteredTransactions.length}` : ''}
                  </span>
                  <button
                    data-testid="transactions-header-next-btn"
                    onClick={handleNextTx}
                    disabled={!hasNextTx}
                    className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
                    title="Next transaction (Right Arrow)"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>

                <button
                  data-testid="transactions-button-5"
                  onClick={() => setSelectedTransaction(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200/80 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-all active:scale-95 cursor-pointer ml-1"
                  title="Close (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-4 custom-scrollbar">
              {/* Amount hero card */}
              <div className="p-4 sm:p-5 rounded-[24px] bg-slate-50/90 border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</p>
                  <p className={cn('text-3xl sm:text-4xl font-black tracking-tight mt-0.5', displayType === 'income' ? 'text-emerald-600' : 'text-slate-900')}>
                    {displayType === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                </div>
                <span className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border shadow-xs',
                  displayType === 'income' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70' :
                  tx.type === 'transfer' ? 'bg-purple-50 text-purple-700 border-purple-200/70' : 'bg-rose-50 text-rose-700 border-rose-200/70'
                )}>
                  {displayType === 'income' ? 'Income' : tx.type === 'transfer' ? 'Transfer' : 'Expense'}
                </span>
              </div>

              {/* Detail fields card */}
              <div className="bg-white rounded-[24px] border border-slate-100 divide-y divide-slate-100/80 overflow-hidden shadow-xs">
                {[
                  { label: 'Category', value: tx.category },
                  { label: 'Account', value: account?.name || 'Account' },
                  { label: 'Date', value: formatLocalDate(tx.date, 'en-US') },
                  ...(attachedTaxAmount > 0 ? [{ label: 'Tax Amount', value: formatCurrency(attachedTaxAmount) }] : []),
                  ...(tx.notes ? [{ label: 'Notes', value: tx.notes }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                    <span className="text-sm font-bold text-slate-800 text-right max-w-[65%] truncate">{value}</span>
                  </div>
                ))}

                {/* Attached Bill Row with smaller bill icon and eye icon */}
                {attachedDocumentId && (
                  <div className="flex items-center justify-between px-4 py-3 bg-purple-50/30 hover:bg-purple-50/60 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-xl bg-purple-100/90 text-purple-700 flex items-center justify-center shrink-0 shadow-xs">
                        <Receipt size={14} />
                      </span>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Attached Bill</p>
                        <p className="text-xs font-bold text-purple-900 mt-0.5">Receipt document</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="transactions-view-attached-bill"
                      onClick={() => { handlePreviewBill(tx); setSelectedTransaction(null); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-purple-100 border border-purple-200/80 text-purple-700 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                      title="View attached bill"
                    >
                      <Receipt size={12} className="shrink-0" />
                      <span>View</span>
                      <Eye size={12} className="shrink-0 text-purple-600" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer with Previous / Next navigation and Action buttons */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/60 flex flex-col gap-3 shrink-0">
              {/* Previous & Next Transaction buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  data-testid="transactions-prev-button"
                  onClick={handlePrevTx}
                  disabled={!hasPrevTx}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-white border border-slate-200/90 shadow-xs hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm disabled:opacity-35 disabled:pointer-events-none transition-all active:scale-[0.98] cursor-pointer"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <button
                  data-testid="transactions-next-button"
                  onClick={handleNextTx}
                  disabled={!hasNextTx}
                  className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-white border border-slate-200/90 shadow-xs hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm disabled:opacity-35 disabled:pointer-events-none transition-all active:scale-[0.98] cursor-pointer"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>

              {/* Edit & Delete Action buttons */}
              <div className="flex items-center gap-2.5">
                {canEdit && (
                  <button
                    data-testid="transactions-edit"
                    onClick={() => {
                      localStorage.setItem('editTransactionId', tx.id?.toString() || '');
                      setCurrentPage('add-transaction');
                      setSelectedTransaction(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Edit2 size={15} /> Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    data-testid="transactions-delete"
                    onClick={() => {
                      handleDeleteTransaction(tx.id!, tx.description);
                      setSelectedTransaction(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-full bg-rose-50 hover:bg-rose-100/90 border border-rose-200/70 text-rose-600 font-bold text-xs sm:text-sm shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      );
    })(),
    document.body
  )}

  {/* Transaction Type Modal */}
  {showTransactionTypeModal && typeof document !== 'undefined' && createPortal(
    <div className="fixed inset-0 flex items-center justify-center z-[120] p-4">
      <div data-testid="transactions-div-2" 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
        onClick={() => setShowTransactionTypeModal(false)} 
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative bg-white/95 backdrop-blur-2xl rounded-[32px] p-6 sm:p-8 w-full max-w-md shadow-2xl border border-white/50 z-10 max-h-[calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-y-auto"
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
                  localStorage.setItem('quickFormType', opt.type);
                  setCurrentPage('add-transaction');
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

        <Button data-testid="transactions-cancel"
          variant="ghost"
          onClick={() => setShowTransactionTypeModal(false)}
          className="w-full mt-6 py-6 rounded-2xl font-bold text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </Button>
      </motion.div>
    </div>,
    document.body
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

  {previewDocument && previewUrl && typeof document !== 'undefined' && createPortal(
  <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
  <div className="w-full max-w-4xl rounded-[28px] bg-transparent backdrop-blur-3xl shadow-2xl border border-white/20 overflow-hidden">
  <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
  <div className="min-w-0">
  <h3 className="text-lg font-bold text-gray-900">Attached Bill</h3>
  <p className="text-sm text-gray-500 truncate">{previewDocument.fileName}</p>
  </div>
  <Button data-testid="transactions-button-6"
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
  </div>,
  document.body
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

