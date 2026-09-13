import React, { useState, useMemo, useEffect, useDeferredValue, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db, type DocumentRecord } from '@/lib/database';
import { deleteTransactionWithBackendSync, queueRecordUpsertSync } from '@/lib/auth-sync-integration';
import { applyAccountBalanceDeltas, buildTransactionAggregation, getTransactionAccountDeltas } from '@/lib/transactionAggregation';
import {
  Plus, TrendingUp, TrendingDown, Search, Camera, Edit2, Trash2,
  ArrowUpRight, ArrowDownLeft, Repeat2, Wallet, Receipt, Eye,
  X, ChevronLeft, ChevronRight, FileText, Paperclip, ArrowLeft,
  Building2, CreditCard, Banknote, Tag, Clock, Users, HandCoins,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { ReceiptScanner } from '@/app/components/transactions/ReceiptScanner';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { InfiniteScrollFooter } from '@/app/components/ui/InfiniteScrollFooter';
import { backendSyncService } from '@/lib/backend-sync-service';
import { AppDateStrip } from '@/app/components/ui/AppDateStrip';
import { TimeFilter, TimeFilterPeriod, filterByTimePeriod } from '@/app/components/ui/TimeFilter';
import { coerceDate, formatLocalDate } from '@/lib/dateUtils';
import { backendService } from '@/lib/backend-api';
import type { TaxComponent } from '@/types/receipt.types';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { DocumentManagementService } from '@/services/documentManagementService';
import { calculateTaxSummary } from '@/lib/taxService';
import { useLiveQuery } from 'dexie-react-hooks';

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

const formatTransactionTime = (dateVal?: Date | string | null): string => {
  const d = coerceDate(dateVal);
  if (!d) return '';
  const hours = d.getHours();
  const minutes = d.getMinutes();
  if (hours === 0 && minutes === 0) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const formatFullDateTime = (dateVal?: Date | string | null): string => {
  const d = coerceDate(dateVal);
  if (!d) return '';
  const dateStr = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = formatTransactionTime(d);
  return timeStr ? `${dateStr} • ${timeStr}` : dateStr;
};

export const Transactions: React.FC = () => {
  const { accounts, transactions, currency, setCurrentPage, refreshData } = useApp();
  const canAdd = useSubFeature('transactions', 'addTransaction');
  const canEdit = useSubFeature('transactions', 'editTransaction');
  const canDelete = useSubFeature('transactions', 'deleteTransaction');
  const canImport = useSubFeature('transactions', 'importStatement');

  // Filters & State
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income' | 'transfer'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [onlyWithReceipts, setOnlyWithReceipts] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
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

  // Available categories in current time period for quick filter dropdown
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    timeFilteredTransactions.forEach((tx) => {
      if (tx.category) set.add(tx.category);
    });
    return Array.from(set).sort();
  }, [timeFilteredTransactions]);

  // Counts by type
  const counts = useMemo(() => {
    let expense = 0;
    let income = 0;
    let transfer = 0;
    let withReceipt = 0;
    timeFilteredTransactions.forEach((t) => {
      if (t.type === 'income') income++;
      else if (t.type === 'expense') expense++;
      else if (t.type === 'transfer') transfer++;
      if (getDocumentIdFromTransaction(t)) withReceipt++;
    });
    return { all: timeFilteredTransactions.length, expense, income, transfer, withReceipt };
  }, [timeFilteredTransactions]);

  const filteredTransactions = useMemo(() => {
    const hasSearch = normalizedSearch.length > 0;
    return timeFilteredTransactions
      .filter((transaction) => {
        if (filterType !== 'all' && transaction.type !== filterType) return false;
        if (selectedCategory !== 'all' && transaction.category !== selectedCategory) return false;
        if (onlyWithReceipts && !getDocumentIdFromTransaction(transaction)) return false;
        if (!hasSearch) return true;
        const description = transaction.description?.toLowerCase() ?? '';
        const category = transaction.category?.toLowerCase() ?? '';
        const merchant = transaction.merchant?.toLowerCase() ?? '';
        const subcategory = transaction.subcategory?.toLowerCase() ?? '';
        const tags = Array.isArray(transaction.tags) ? transaction.tags.join(' ').toLowerCase() : '';
        const groupName = transaction.groupName?.toLowerCase() ?? '';
        const notes = transaction.notes?.toLowerCase() ?? '';
        return (
          description.includes(normalizedSearch) ||
          category.includes(normalizedSearch) ||
          merchant.includes(normalizedSearch) ||
          subcategory.includes(normalizedSearch) ||
          tags.includes(normalizedSearch) ||
          groupName.includes(normalizedSearch) ||
          notes.includes(normalizedSearch)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'highest') return (b.amount || 0) - (a.amount || 0);
        if (sortBy === 'lowest') return (a.amount || 0) - (b.amount || 0);
        if (sortBy === 'oldest') {
          const dateA = coerceDate(a.date)?.getTime() ?? 0;
          const dateB = coerceDate(b.date)?.getTime() ?? 0;
          return dateA - dateB;
        }
        // Default: newest first
        const dateA = coerceDate(a.date)?.getTime() ?? 0;
        const dateB = coerceDate(b.date)?.getTime() ?? 0;
        return dateB - dateA;
      });
  }, [timeFilteredTransactions, filterType, selectedCategory, onlyWithReceipts, sortBy, normalizedSearch]);

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

  const getAccountInfo = useCallback((accountId?: number) => {
    if (accountId == null) return { name: 'Unassigned', type: 'wallet', Icon: Wallet };
    const acc = accountById.get(accountId);
    if (!acc) return { name: 'Account', type: 'wallet', Icon: Wallet };
    switch (acc.type) {
      case 'bank': return { name: acc.name, type: 'Bank', Icon: Building2 };
      case 'card': return { name: acc.name, type: 'Card', Icon: CreditCard };
      case 'cash': return { name: acc.name, type: 'Cash', Icon: Banknote };
      case 'wallet': return { name: acc.name, type: 'Wallet', Icon: Wallet };
      default: return { name: acc.name, type: 'Account', Icon: Wallet };
    }
  }, [accountById]);

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
    resetDeps: [normalizedSearch, filterType, selectedCategory, onlyWithReceipts, sortBy, timePeriod, selectedDate],
    getItemKey: (item) => item.id ?? item.cloudId ?? `${item.date}-${item.amount}-${item.description}`,
  });

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
        const cachedDoc = await db.documents.where('cloudId').equals(cleanBillId).first();
        if (cachedDoc?.fileData) {
          const nextPreviewUrl = URL.createObjectURL(cachedDoc.fileData);
          setPreviewDocument(cachedDoc);
          setPreviewUrl(nextPreviewUrl);
          return;
        }

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
      const tx = await db.transactions.get(transactionToDelete.id);
      if (tx) {
        const now = new Date();
        const reverseDeltas = new Map(
          Array.from(getTransactionAccountDeltas(tx).entries()).map(([accountId, delta]) => [accountId, -delta]),
        );

        await deleteTransactionWithBackendSync(transactionToDelete.id);
        await applyAccountBalanceDeltas(reverseDeltas, now);
        for (const accountId of reverseDeltas.keys()) {
          queueRecordUpsertSync('accounts', accountId);
        }

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

  const hasActiveFilters = filterType !== 'all' || selectedCategory !== 'all' || onlyWithReceipts || normalizedSearch.length > 0;

  const resetAllFilters = () => {
    setFilterType('all');
    setSelectedCategory('all');
    setOnlyWithReceipts(false);
    setSearchQuery('');
  };

  return (
    <CenteredLayout
      onRefresh={async () => {
        await backendSyncService.syncWithBackend();
        refreshData();
      }}
    >
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 pb-32">
        {/* Page Header */}
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
            <div className="min-w-0">
              <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">Transactions</h1>
              <p className="text-[10px] sm:text-xs font-semibold text-slate-400 mt-0.5 truncate">
                <span className="sm:hidden">{timeFilteredTransactions.length} recorded</span>
                <span className="hidden sm:inline">{timeFilteredTransactions.length} recorded • Tracked liquidity & verified accounts</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {canImport && (
              <Button
                data-testid="transactions-scan-bill-button"
                variant="secondary"
                onClick={() => setShowScanModal(true)}
                className="shadow-2xs border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-800 h-8.5 sm:h-10 px-3 sm:px-4 rounded-full font-bold text-xs sm:text-sm shrink-0 transition-all active:scale-95"
              >
                <Camera size={14} className="mr-1 sm:mr-1.5 shrink-0 text-slate-600" />
                <span className="hidden sm:inline">Scan Bill</span>
                <span className="sm:hidden">Scan</span>
              </Button>
            )}
            {canAdd && (
              <Button
                data-testid="transactions-add-button"
                onClick={() => setShowTransactionTypeModal(true)}
                className="shadow-sm bg-slate-950 hover:bg-slate-800 text-white h-8.5 sm:h-10 px-3.5 sm:px-5 rounded-full font-bold text-xs sm:text-sm shrink-0 transition-all active:scale-95"
              >
                <Plus size={15} className="mr-1 sm:mr-1.5 shrink-0" />
                <span className="hidden sm:inline">Add Transaction</span>
                <span className="sm:hidden">Add</span>
              </Button>
            )}
          </div>
        </div>

        {/* Horizontal Calendar Date Strip & Period Filter (PRESERVED AS REQUESTED) */}
        <div className="bg-white rounded-[24px] sm:rounded-[32px] px-3.5 sm:px-6 py-3.5 sm:py-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col items-center gap-3 sm:gap-6">
          <AppDateStrip
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            period={timePeriod}
          />
          <div className="flex justify-center w-full">
            <TimeFilter value={timePeriod} onChange={setTimePeriod} testId="transactions-time-filter" />
          </div>
        </div>

        {/* Compact Responsive 4-Metric Financial Pulse Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {/* 1. Inflow / Income */}
          <Card
            data-testid="transactions-card"
            variant="default"
            className="p-3 sm:p-4 lg:p-5 bg-white dark:bg-card border border-slate-100/90 dark:border-border/60 rounded-[20px] sm:rounded-[24px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden group hover:border-emerald-200/70 transition-all"
          >
            <div className="flex items-center justify-between gap-1.5 mb-1.5 sm:mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 whitespace-nowrap shrink-0">
                <ArrowDownLeft size={11} className="shrink-0" /> Inflow
              </span>
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 truncate">
                {counts.income} {counts.income === 1 ? 'credit' : 'credits'}
              </span>
            </div>
            <p className="text-base sm:text-xl lg:text-2xl font-black text-emerald-600 tracking-tight truncate">
              {formatCurrency(stats.income)}
            </p>
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 mt-0.5 truncate">Total received</p>
          </Card>

          {/* 2. Outflow / Expenses */}
          <Card
            data-testid="transactions-card-2"
            variant="default"
            className="p-3 sm:p-4 lg:p-5 bg-white dark:bg-card border border-slate-100/90 dark:border-border/60 rounded-[20px] sm:rounded-[24px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden group hover:border-rose-200/70 transition-all"
          >
            <div className="flex items-center justify-between gap-1.5 mb-1.5 sm:mb-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60 whitespace-nowrap shrink-0">
                <ArrowUpRight size={11} className="shrink-0" /> Outflow
              </span>
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 truncate">
                {counts.expense} {counts.expense === 1 ? 'debit' : 'debits'}
              </span>
            </div>
            <p className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
              {formatCurrency(stats.expenses)}
            </p>
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 mt-0.5 truncate">Total spent</p>
          </Card>

          {/* 3. Net Flow / Balance */}
          <Card
            data-testid="transactions-card-3"
            variant="default"
            className="p-3 sm:p-4 lg:p-5 bg-white dark:bg-card border border-slate-100/90 dark:border-border/60 rounded-[20px] sm:rounded-[24px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden group hover:border-purple-200/70 transition-all"
          >
            <div className="flex items-center justify-between gap-1 mb-1.5 sm:mb-2">
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold border whitespace-nowrap shrink-0",
                stats.netFlow >= 0
                  ? "bg-purple-50 text-purple-700 border-purple-200/60"
                  : "bg-amber-50 text-amber-700 border-amber-200/60"
              )}>
                <TrendingUp size={11} className={cn("shrink-0", stats.netFlow >= 0 ? "text-purple-600" : "text-amber-600")} />
                Net Flow
              </span>
              <span className={cn(
                "text-[9px] sm:text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0",
                stats.netFlow >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              )}>
                {stats.netFlow >= 0 ? 'Surplus' : 'Deficit'}
              </span>
            </div>
            <p className={cn(
              "text-base sm:text-xl lg:text-2xl font-black tracking-tight truncate",
              stats.netFlow >= 0 ? "text-slate-900 dark:text-white" : "text-rose-600"
            )}>
              {stats.netFlow > 0 ? '+' : ''}{formatCurrency(stats.netFlow)}
            </p>
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-400 mt-0.5 truncate">
              {stats.netFlow >= 0 ? 'Net retention' : 'Deficit'}
            </p>
          </Card>

          {/* 4. Tax & Receipts Compliance */}
          <div className="p-3 sm:p-4 lg:p-5 bg-white dark:bg-card border border-purple-100/80 dark:border-border/60 rounded-[20px] sm:rounded-[24px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden group flex flex-col justify-between hover:border-purple-300/70 transition-all">
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-1.5 sm:mb-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 whitespace-nowrap shrink-0">
                  <Receipt size={11} className="shrink-0" /> Tax & Bills
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage('receipt-scanner')}
                  className="text-[10px] font-bold text-purple-700 hover:text-purple-900 hover:underline inline-flex items-center gap-0.5 cursor-pointer shrink-0"
                >
                  Scanner <ChevronRight size={10} />
                </button>
              </div>
              <p className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                {formatCurrency(taxSummary.totalTax)}
              </p>
            </div>
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 font-medium mt-1 pt-1 border-t border-slate-100">
              <span className="truncate">{counts.withReceipt} bills</span>
              <span className="text-purple-700 font-bold shrink-0">{formatCurrency(taxSummary.monthlyTax)}/mo</span>
            </div>
          </div>
        </div>

        {/* Compact Responsive Controls & Filter Suite */}
        <div className="space-y-2 sm:space-y-2.5">
          {/* Top Bar: Search Input */}
          <div className="relative w-full max-w-xl mx-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 sm:w-4 sm:h-4 pointer-events-none" />
            <input
              data-testid="transactions-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search description, merchant, tags..."
              className="w-full pl-9 sm:pl-10 pr-9 py-1.5 sm:py-2.5 bg-white border border-slate-200/80 shadow-xs rounded-full focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 text-[11px] sm:text-xs md:text-sm text-slate-900 placeholder:text-slate-400 transition-all text-center sm:text-left placeholder:text-center sm:placeholder:text-left"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Secondary Controls Bar: compact horizontal scroll row on mobile, centered */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 w-full">
            {/* Category Dropdown Filter */}
            {availableCategories.length > 0 && (
              <div className="relative shrink-0">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none bg-white border border-slate-200/80 hover:border-slate-300 text-slate-700 font-bold text-[10px] sm:text-[11px] md:text-xs py-1 sm:py-1.5 pl-2.5 sm:pl-3 pr-6 sm:pr-7 rounded-full shadow-xs cursor-pointer focus:outline-none transition-all"
                >
                  <option value="all">Categories ({availableCategories.length})</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <ChevronRight size={10} className="absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
              </div>
            )}

            {/* Sort Dropdown */}
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none bg-white border border-slate-200/80 hover:border-slate-300 text-slate-700 font-bold text-[10px] sm:text-[11px] md:text-xs py-1 sm:py-1.5 pl-2.5 sm:pl-3 pr-6 sm:pr-7 rounded-full shadow-xs cursor-pointer focus:outline-none transition-all"
              >
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="highest">Sort: Highest</option>
                <option value="lowest">Sort: Lowest</option>
              </select>
              <ChevronRight size={10} className="absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
            </div>

            {/* Quick Bill / Receipt Toggle */}
            <button
              type="button"
              onClick={() => setOnlyWithReceipts(!onlyWithReceipts)}
              className={cn(
                "inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] md:text-xs font-bold border transition-all cursor-pointer shrink-0 active:scale-95 shadow-xs whitespace-nowrap",
                onlyWithReceipts
                  ? "bg-purple-50 text-purple-700 border-purple-300"
                  : "bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50"
              )}
            >
              <Paperclip size={10} className={onlyWithReceipts ? "text-purple-600" : "text-slate-400"} />
              <span>With Bill</span>
              {counts.withReceipt > 0 && (
                <span className={cn("px-1.5 py-0.2 rounded-full text-[9px] font-black", onlyWithReceipts ? "bg-purple-200/70 text-purple-900" : "bg-slate-100 text-slate-600")}>
                  {counts.withReceipt}
                </span>
              )}
            </button>
          </div>

          {/* Segmented Filter Pills (All / Expenses / Income / Transfers) */}
          <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar w-full">
            <div className="inline-flex bg-slate-100/90 dark:bg-muted p-0.5 sm:p-1 rounded-full border border-slate-200/60 shadow-inner max-w-full overflow-x-auto no-scrollbar shrink-0 mx-auto">
              {[
                { type: 'all', label: 'All', count: counts.all },
                { type: 'expense', label: 'Expenses', count: counts.expense },
                { type: 'income', label: 'Income', count: counts.income },
                { type: 'transfer', label: 'Transfers', count: counts.transfer },
              ].map((tab) => {
                const isActive = filterType === tab.type;
                return (
                  <button
                    key={tab.type}
                    data-testid={`transactions-filter-${tab.type}`}
                    onClick={() => setFilterType(tab.type as any)}
                    className={cn(
                      'flex items-center justify-center gap-1 py-1 sm:py-1.5 px-2.5 sm:px-3.5 rounded-full transition-all duration-150 font-bold text-[10px] sm:text-xs select-none cursor-pointer whitespace-nowrap shrink-0',
                      isActive
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    )}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        'px-1.5 py-0.2 rounded-full text-[9px] font-black',
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-200/70 text-slate-600'
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Filters Reset Link */}
          {hasActiveFilters && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer transition-colors px-1 shrink-0 whitespace-nowrap"
              >
                <X size={12} /> Reset
              </button>
            </div>
          )}
        </div>

        {/* Transaction List Card */}
        <Card
          data-testid="transactions-card-4"
          variant="glass"
          className="overflow-hidden !p-0 min-h-[350px] rounded-[24px] sm:rounded-[32px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] bg-white/95"
        >
          {/* DESKTOP TABLE VIEW (lg+) */}
          <div className="hidden lg:block overflow-x-auto">
            <table data-testid="transactions-table" className="w-full">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Details & Entity
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Timing & Context
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Account / Route
                  </th>
                  <th className="px-5 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Amount & Bill
                  </th>
                  <th className="w-24 px-5 py-3.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {visibleTransactions.map((transaction, i) => {
                  const accountInfo = getAccountInfo(transaction.accountId);
                  const destAccountInfo = transaction.transferToAccountId ? getAccountInfo(transaction.transferToAccountId) : null;
                  const displayType = transaction.type === 'transfer'
                    ? (transaction.subcategory === 'Transfer In' ? 'income' : 'expense')
                    : transaction.type;
                  const attachedDocumentId = getDocumentIdFromTransaction(transaction);
                  const attachedTaxAmount = parseMetadataNumber(transaction.importMetadata?.['Tax Amount']);
                  const formattedTime = formatTransactionTime(transaction.date);

                  return (
                    <tr
                      key={transaction.id ?? transaction.cloudId ?? i}
                      onClick={() => setSelectedTransaction(transaction)}
                      className="group hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      {/* 1. Details & Entity */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs border border-slate-100 bg-slate-50/90 group-hover:bg-white shrink-0 transition-colors">
                            {getCategoryCartoonIcon(transaction.category || 'Miscellaneous', 22)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[200px]">
                                {transaction.description || transaction.category}
                              </p>
                              {transaction.merchant && transaction.merchant !== transaction.description && (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-full border border-slate-200/50 truncate max-w-[120px]">
                                  {transaction.merchant}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100/80 text-slate-700 border border-slate-200/40">
                                {transaction.category}
                              </span>
                              {transaction.subcategory && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-md text-[9px] font-medium bg-slate-50 text-slate-500 border border-slate-200/30">
                                  {transaction.subcategory}
                                </span>
                              )}
                              {transaction.groupName && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/50">
                                  <Users size={9} /> {transaction.groupName}
                                </span>
                              )}
                              {transaction.contactName && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200/50">
                                  <HandCoins size={9} /> {transaction.contactName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Timing & Context */}
                      <td className="px-5 py-3.5">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800">
                            {formatLocalDate(transaction.date, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {formattedTime ? (
                              <span className="text-[11px] text-slate-400 font-medium inline-flex items-center gap-1">
                                <Clock size={10} /> {formattedTime}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium">Standard entry</span>
                            )}
                            {transaction.notes && (
                              <span title={`Note: ${transaction.notes}`} className="text-slate-400 hover:text-slate-600">
                                <FileText size={11} />
                              </span>
                            )}
                          </div>
                          {Array.isArray(transaction.tags) && transaction.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {transaction.tags.slice(0, 2).map((tag, idx) => (
                                <span key={idx} className="text-[9px] font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.2 rounded">
                                  #{tag}
                                </span>
                              ))}
                              {transaction.tags.length > 2 && (
                                <span className="text-[9px] font-bold text-slate-400">+{transaction.tags.length - 2}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3. Account / Route */}
                      <td className="px-5 py-3.5">
                        {transaction.type === 'transfer' && destAccountInfo ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <span className="truncate max-w-[90px]">{accountInfo.name}</span>
                            <ArrowRight size={12} className="text-purple-600 shrink-0" />
                            <span className="truncate max-w-[90px] text-purple-700">{destAccountInfo.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <accountInfo.Icon size={13} className="text-slate-400 shrink-0" />
                            <span className="text-xs font-bold text-slate-700 truncate max-w-[130px]">
                              {accountInfo.name}
                            </span>
                            <span className="text-[9px] font-semibold text-slate-400 px-1 py-0.2 bg-slate-100 rounded">
                              {accountInfo.type}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 4. Amount & Bill */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex flex-col items-end">
                          <span
                            className={cn(
                              'font-black text-xs sm:text-sm tracking-tight',
                              transaction.type === 'transfer'
                                ? 'text-purple-600'
                                : displayType === 'income'
                                ? 'text-emerald-600'
                                : 'text-slate-900'
                            )}
                          >
                            {transaction.type === 'transfer'
                              ? '⇄ '
                              : displayType === 'income'
                              ? '+'
                              : '-'}
                            {formatCurrency(transaction.amount)}
                          </span>

                          <div className="flex items-center gap-1 mt-0.5 justify-end">
                            {attachedDocumentId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePreviewBill(transaction);
                                }}
                                className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/60 px-1.5 py-0.2 rounded-full transition-colors cursor-pointer"
                                title="Click to view attached bill"
                              >
                                <Paperclip size={8} /> Receipt
                              </button>
                            )}
                            {attachedTaxAmount > 0 && (
                              <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1 py-0.2 rounded">
                                GST {formatCurrency(attachedTaxAmount)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 5. Actions */}
                      <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end items-center gap-1">
                          {attachedDocumentId && (
                            <Button
                              data-testid={`transactions-view-bill-${transaction.id}`}
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-purple-600 hover:bg-purple-50 rounded-full"
                              onClick={() => handlePreviewBill(transaction)}
                              title="View bill"
                            >
                              <Eye size={13} />
                            </Button>
                          )}
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEdit && (
                              <Button
                                data-testid={`transactions-button-2-${transaction.id}`}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                                onClick={() => {
                                  localStorage.setItem('editTransactionId', transaction.id?.toString() || '');
                                  setCurrentPage('add-transaction');
                                }}
                                title="Edit transaction"
                              >
                                <Edit2 size={12} />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                data-testid={`transactions-button-3-${transaction.id}`}
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full"
                                onClick={() => handleDeleteTransaction(transaction.id!, transaction.description)}
                                title="Delete transaction"
                              >
                                <Trash2 size={12} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARD LIST VIEW (< lg) - Compact & Elegant */}
          <div className="lg:hidden divide-y divide-slate-100">
            {visibleTransactions.map((transaction) => {
              const accountInfo = getAccountInfo(transaction.accountId);
              const destAccountInfo = transaction.transferToAccountId ? getAccountInfo(transaction.transferToAccountId) : null;
              const displayType = transaction.type === 'transfer'
                ? (transaction.subcategory === 'Transfer In' ? 'income' : 'expense')
                : transaction.type;
              const attachedDocumentId = getDocumentIdFromTransaction(transaction);
              const formattedTime = formatTransactionTime(transaction.date);

              return (
                <button
                  data-testid={`transactions-button-4-${transaction.id}`}
                  key={transaction.id}
                  onClick={() => setSelectedTransaction(transaction)}
                  className="w-full flex items-start gap-3 px-3.5 py-3 hover:bg-slate-50/80 active:bg-slate-100 transition-colors text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs border border-slate-100 bg-slate-50/90 shrink-0 mt-0.5">
                    {getCategoryCartoonIcon(transaction.category || 'Miscellaneous', 20)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                        {transaction.description || transaction.category}
                      </p>
                      <span
                        className={cn(
                          'font-black text-xs sm:text-sm tracking-tight shrink-0',
                          transaction.type === 'transfer'
                            ? 'text-purple-600'
                            : displayType === 'income'
                            ? 'text-emerald-600'
                            : 'text-slate-900'
                        )}
                      >
                        {transaction.type === 'transfer'
                          ? '⇄ '
                          : displayType === 'income'
                          ? '+'
                          : '-'}
                        {formatCurrency(transaction.amount)}
                      </span>
                    </div>

                    {/* Merchant & Subcategory Row */}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {transaction.merchant && transaction.merchant !== transaction.description && (
                        <span className="text-[10px] font-semibold text-slate-600 truncate max-w-[120px]">
                          {transaction.merchant} •
                        </span>
                      )}
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-full">
                        {transaction.category}
                      </span>
                      {transaction.subcategory && (
                        <span className="text-[9px] font-medium text-slate-400 truncate max-w-[90px]">
                          › {transaction.subcategory}
                        </span>
                      )}
                    </div>

                    {/* Date, Time, Account & Bill pills */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap text-slate-400 text-[10px]">
                      <span className="font-medium text-slate-500">
                        {formatLocalDate(transaction.date, 'en-US', { month: 'short', day: 'numeric' })}
                        {formattedTime ? ` • ${formattedTime}` : ''}
                      </span>

                      <span className="text-slate-300">•</span>

                      {transaction.type === 'transfer' && destAccountInfo ? (
                        <span className="inline-flex items-center gap-0.5 font-bold text-purple-700">
                          {accountInfo.name} → {destAccountInfo.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                          <accountInfo.Icon size={10} /> {accountInfo.name}
                        </span>
                      )}

                      {attachedDocumentId && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-purple-50 text-purple-700 font-bold text-[9px] border border-purple-200/50">
                          <Paperclip size={8} /> Bill
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight size={13} className="text-slate-300 shrink-0 self-center" />
                </button>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredTransactions.length === 0 && (
            <div className="py-16 flex flex-col items-center text-center px-4">
              <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-3 text-slate-300 shadow-xs">
                <Search size={24} />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">No transactions match your criteria</h3>
              <p className="text-slate-500 text-xs max-w-xs mt-1">
                {hasActiveFilters
                  ? 'Try clearing your search query or relaxing your filter selections to view transactions.'
                  : 'No transactions recorded for this period. Click "+ Add Transaction" to create your first entry.'}
              </p>
              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetAllFilters}
                  className="mt-3 rounded-full text-xs font-bold"
                >
                  Reset all filters
                </Button>
              ) : canAdd ? (
                <Button
                  size="sm"
                  onClick={() => setShowTransactionTypeModal(true)}
                  className="mt-3 rounded-full text-xs font-bold bg-slate-950 text-white"
                >
                  <Plus size={13} className="mr-1" /> Add Transaction
                </Button>
              ) : null}
            </div>
          )}

          {/* Infinite Scroll Footer */}
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

        {/* PROPER TRANSACTION DETAIL POPUP SCREEN - COMPACT & RESPONSIVE */}
        {selectedTransaction && typeof document !== 'undefined' && createPortal(
          (() => {
            const tx = selectedTransaction;
            const account = accountById.get(tx.accountId);
            const destAccount = tx.transferToAccountId ? accountById.get(tx.transferToAccountId) : null;
            const displayType = tx.type === 'transfer' ? (tx.subcategory === 'Transfer In' ? 'income' : 'expense') : tx.type;
            const attachedDocumentId = getDocumentIdFromTransaction(tx);
            const attachedTaxAmount = parseMetadataNumber(tx.importMetadata?.['Tax Amount']);
            const taxBreakdown = parseTaxBreakdown(tx.importMetadata?.['Tax Breakdown']);
            const formattedDateTime = formatFullDateTime(tx.date);

            return (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
                {/* Backdrop blur overlay */}
                <div
                  data-testid="transactions-div"
                  className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"
                  onClick={() => setSelectedTransaction(null)}
                />

                {/* Proper Popup Modal Dialog */}
                <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 16 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 16 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 360 }}
                  className="relative bg-white rounded-[24px] sm:rounded-[36px] overflow-hidden shadow-[0_25px_50px_-12px_rgba(15,23,42,0.25)] border border-slate-100 w-full max-w-lg max-h-[calc(100dvh-2.5rem)] flex flex-col z-[121] my-auto"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2.5 px-4 sm:px-6 py-3.5 sm:py-5 border-b border-slate-100 bg-white shrink-0">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center bg-slate-50 border border-slate-100/80 shadow-xs shrink-0">
                        {getCategoryCartoonIcon(tx.category || 'Miscellaneous', 22)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight truncate">
                            {tx.description || tx.category}
                          </h3>
                          {tx.merchant && tx.merchant !== tx.description && (
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded-full">
                              {tx.merchant}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <p className="text-[11px] text-slate-400 font-medium">
                            {formattedDateTime}
                          </p>
                          {attachedDocumentId && (
                            <button
                              type="button"
                              data-testid="transactions-header-view-bill"
                              onClick={() => { handlePreviewBill(tx); setSelectedTransaction(null); }}
                              className="inline-flex items-center gap-0.5 px-2 py-0.2 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/70 text-[10px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                              title="View attached bill"
                            >
                              <Paperclip size={10} className="shrink-0" />
                              <span>Bill</span>
                              <Eye size={10} className="shrink-0 text-purple-600 ml-0.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Header navigation pill & close button */}
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="inline-flex items-center bg-slate-100/90 rounded-full p-0.5 sm:p-1 border border-slate-200/60 shadow-xs">
                        <button
                          data-testid="transactions-header-prev-btn"
                          onClick={handlePrevTx}
                          disabled={!hasPrevTx}
                          className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full bg-white flex items-center justify-center text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
                          title="Previous transaction (Left Arrow)"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 px-1.5 sm:px-2 min-w-[38px] sm:min-w-[44px] text-center select-none">
                          {currentTxIndex >= 0 ? `${currentTxIndex + 1}/${filteredTransactions.length}` : ''}
                        </span>
                        <button
                          data-testid="transactions-header-next-btn"
                          onClick={handleNextTx}
                          disabled={!hasNextTx}
                          className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full bg-white flex items-center justify-center text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
                          title="Next transaction (Right Arrow)"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>

                      <button
                        data-testid="transactions-button-5"
                        onClick={() => setSelectedTransaction(null)}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 hover:bg-slate-200/80 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-all active:scale-95 cursor-pointer ml-1"
                        title="Close (Esc)"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Body */}
                  <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-3 sm:space-y-4 custom-scrollbar">
                    {/* Amount hero card */}
                    <div className="p-3.5 sm:p-5 rounded-[20px] sm:rounded-[24px] bg-slate-50/90 border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Amount</p>
                        <p className={cn(
                          'text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mt-0.5',
                          tx.type === 'transfer' ? 'text-purple-600' : displayType === 'income' ? 'text-emerald-600' : 'text-slate-900'
                        )}>
                          {tx.type === 'transfer' ? '⇄ ' : displayType === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {tx.type === 'transfer'
                            ? `Transfer between linked accounts`
                            : displayType === 'income'
                            ? `Credited into ${account?.name || 'Account'}`
                            : `Debited from ${account?.name || 'Account'}`}
                        </p>
                      </div>
                      <span className={cn(
                        'px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-black uppercase tracking-wider border shadow-xs shrink-0',
                        tx.type === 'transfer' ? 'bg-purple-50 text-purple-700 border-purple-200/70' :
                        displayType === 'income' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70' :
                        'bg-rose-50 text-rose-700 border-rose-200/70'
                      )}>
                        {tx.type === 'transfer' ? 'Transfer' : displayType === 'income' ? 'Income' : 'Expense'}
                      </span>
                    </div>

                    {/* Proper Info Data Grid */}
                    <div className="bg-white rounded-[20px] sm:rounded-[24px] border border-slate-100 divide-y divide-slate-100/80 overflow-hidden shadow-xs text-xs sm:text-sm">
                      {/* Category & Subcategory */}
                      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Category</span>
                        <div className="flex items-center gap-1.5 text-right">
                          <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full">
                            {tx.category}
                          </span>
                          {tx.subcategory && (
                            <span className="text-xs font-semibold text-slate-500">
                              › {tx.subcategory}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Account or Route */}
                      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {tx.type === 'transfer' ? 'Route' : 'Account'}
                        </span>
                        {tx.type === 'transfer' && destAccount ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <span className="text-slate-700">{account?.name || 'Account'}</span>
                            <ArrowRight size={12} className="text-purple-600" />
                            <span className="text-purple-700">{destAccount.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <Wallet size={12} className="text-slate-400" />
                            <span>{account?.name || 'Unassigned'}</span>
                            {account?.type && (
                              <span className="text-[9px] text-slate-400 font-semibold bg-slate-100 px-1.5 py-0.2 rounded">
                                {account.type}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Exact Date & Time */}
                      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date & Time</span>
                        <span className="text-xs font-bold text-slate-800 text-right">
                          {formattedDateTime}
                        </span>
                      </div>

                      {/* Merchant / Payee */}
                      {tx.merchant && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Merchant</span>
                          <span className="text-xs font-bold text-slate-800 text-right">
                            {tx.merchant}
                          </span>
                        </div>
                      )}

                      {/* Group Expense Info */}
                      {(tx.groupName || tx.expenseMode === 'group') && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors bg-indigo-50/30">
                          <span className="text-[10px] sm:text-[11px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1">
                            <Users size={11} /> Group
                          </span>
                          <div className="text-right">
                            <span className="text-xs font-bold text-indigo-900">
                              {tx.groupName || 'Group Expense'}
                            </span>
                            {tx.splitType && (
                              <span className="text-[10px] font-semibold text-indigo-600 block">
                                {tx.splitType === 'equal' ? 'Split Equally' : 'Custom Split'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Loan Info */}
                      {(tx.contactName || tx.loanType) && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors bg-amber-50/30">
                          <span className="text-[10px] sm:text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                            <HandCoins size={11} /> Loan
                          </span>
                          <div className="text-right">
                            <span className="text-xs font-bold text-amber-900">
                              {tx.loanType === 'lent' ? 'Money Lent' : 'Money Borrowed'}
                            </span>
                            {tx.contactName && (
                              <span className="text-[10px] font-semibold text-amber-700 block">
                                Contact: {tx.contactName}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {Array.isArray(tx.tags) && tx.tags.length > 0 && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Tag size={11} /> Tags
                          </span>
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {tx.tags.map((tag, idx) => (
                              <span key={idx} className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200/50 px-1.5 py-0.2 rounded-md">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {tx.notes && (
                        <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notes</span>
                          <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200/50 leading-relaxed italic">
                            "{tx.notes}"
                          </p>
                        </div>
                      )}

                      {/* Tax Breakdown (if available) */}
                      {attachedTaxAmount > 0 && (
                        <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-purple-50/20">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] sm:text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                              <Receipt size={11} /> Tax Details
                            </span>
                            <span className="text-xs font-black text-purple-900">
                              {formatCurrency(attachedTaxAmount)}
                            </span>
                          </div>
                          {taxBreakdown.length > 0 && (
                            <div className="space-y-1 mt-1.5 pt-1.5 border-t border-purple-100">
                              {taxBreakdown.map((t, idx) => (
                                <div key={idx} className="flex justify-between text-[10px] sm:text-[11px] text-slate-600">
                                  <span>{t.name} {t.rate ? `(${t.rate}%)` : ''}</span>
                                  <span className="font-bold">{formatCurrency(t.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Attached Bill Row */}
                      {attachedDocumentId && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 bg-purple-50/30 hover:bg-purple-50/60 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="w-6.5 h-6.5 rounded-lg bg-purple-100/90 text-purple-700 flex items-center justify-center shrink-0 shadow-xs">
                              <Receipt size={13} />
                            </span>
                            <div>
                              <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">Attached Bill</p>
                              <p className="text-xs font-bold text-purple-900 mt-0.5">Receipt document verified</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid="transactions-view-attached-bill"
                            onClick={() => { handlePreviewBill(tx); setSelectedTransaction(null); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white hover:bg-purple-100 border border-purple-200/80 text-purple-700 text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                            title="View attached bill"
                          >
                            <Receipt size={11} className="shrink-0" />
                            <span>View</span>
                            <Eye size={11} className="shrink-0 text-purple-600" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer with Previous / Next navigation and Action buttons */}
                  <div className="p-3.5 sm:p-5 border-t border-slate-100 bg-slate-50/60 flex flex-col gap-2.5 shrink-0">
                    {/* Previous & Next Transaction buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        data-testid="transactions-prev-button"
                        onClick={handlePrevTx}
                        disabled={!hasPrevTx}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-white border border-slate-200/90 shadow-xs hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm disabled:opacity-35 disabled:pointer-events-none transition-all active:scale-[0.98] cursor-pointer"
                      >
                        <ChevronLeft size={15} /> Previous
                      </button>
                      <button
                        data-testid="transactions-next-button"
                        onClick={handleNextTx}
                        disabled={!hasNextTx}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full bg-white border border-slate-200/90 shadow-xs hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm disabled:opacity-35 disabled:pointer-events-none transition-all active:scale-[0.98] cursor-pointer"
                      >
                        Next <ChevronRight size={15} />
                      </button>
                    </div>

                    {/* Edit & Delete Action buttons */}
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <button
                          data-testid="transactions-edit"
                          onClick={() => {
                            localStorage.setItem('editTransactionId', tx.id?.toString() || '');
                            setCurrentPage('add-transaction');
                            setSelectedTransaction(null);
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          data-testid="transactions-delete"
                          onClick={() => {
                            handleDeleteTransaction(tx.id!, tx.description);
                            setSelectedTransaction(null);
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-rose-50 hover:bg-rose-100/90 border border-rose-200/70 text-rose-600 font-bold text-xs sm:text-sm shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                        >
                          <Trash2 size={13} /> Delete
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
            <div
              data-testid="transactions-div-2"
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowTransactionTypeModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="relative bg-white/95 backdrop-blur-2xl rounded-[28px] sm:rounded-[32px] p-5 sm:p-8 w-full max-w-md shadow-2xl border border-white/50 z-10 max-h-[calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-y-auto"
            >
              <h3 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 tracking-tight mb-1 text-center">New Transaction</h3>
              <p className="text-slate-500 font-medium text-[11px] sm:text-xs md:text-sm mb-4 sm:mb-6 text-center">What kind of transaction is this?</p>

              <div className="space-y-2 sm:space-y-2.5">
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
                      "w-full p-2.5 sm:p-3.5 flex items-center justify-center gap-3 sm:gap-4 rounded-2xl transition-all border border-transparent hover:scale-[1.01] active:scale-[0.98] cursor-pointer",
                      opt.color
                    )}
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/80 rounded-xl flex items-center justify-center shadow-xs shrink-0">
                      <opt.icon size={18} />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-bold text-xs sm:text-sm md:text-base leading-tight">{opt.label}</p>
                      <p className="text-[10px] sm:text-xs opacity-80 font-medium leading-tight">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <Button
                data-testid="transactions-cancel"
                variant="ghost"
                onClick={() => setShowTransactionTypeModal(false)}
                className="w-full mt-4 sm:mt-6 py-5 rounded-2xl font-bold text-xs sm:text-sm text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </Button>
            </motion.div>
          </div>,
          document.body
        )}

        {/* Delete Confirm Modal */}
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

        {/* Receipt Document Preview Modal */}
        {previewDocument && previewUrl && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-4xl rounded-[28px] bg-transparent backdrop-blur-3xl shadow-2xl border border-white/20 overflow-hidden">
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6 bg-white">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900">Attached Bill</h3>
                  <p className="text-xs sm:text-sm text-gray-500 truncate">{previewDocument.fileName}</p>
                </div>
                <Button
                  data-testid="transactions-button-6"
                  variant="ghost"
                  size="icon"
                  className="h-8.5 w-8.5 shrink-0 text-gray-500 hover:text-gray-900 rounded-full"
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

        {/* Receipt Scanner Modal */}
        <ReceiptScanner
          isOpen={showScanModal}
          onClose={() => setShowScanModal(false)}
          onTransactionCreated={() => setShowScanModal(false)}
        />
      </div>
    </CenteredLayout>
  );
};
