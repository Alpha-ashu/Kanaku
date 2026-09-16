import React, { useState, useMemo, useEffect, useDeferredValue, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp, useSubFeature } from '@/contexts/AppContext';
import { db, type DocumentRecord } from '@/lib/database';
import { deleteTransactionWithBackendSync, queueRecordUpsertSync } from '@/lib/auth-sync-integration';
import { applyAccountBalanceDeltas, buildTransactionAggregation, getTransactionAccountDeltas } from '@/lib/transactionAggregation';
import {
  Plus, TrendingUp, TrendingDown, Search, Camera, Edit2, Trash2,
  ArrowUpRight, ArrowDownLeft, Repeat2, Wallet, Receipt, Eye,
  X, ChevronLeft, ChevronRight, Paperclip,
  Building2, CreditCard, Banknote, Tag, Users, HandCoins,
  ArrowRight, SlidersHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { DeleteConfirmModal } from '@/app/components/shared/DeleteConfirmModal';
import { ReceiptScanner } from '@/app/components/transactions/ReceiptScanner';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { getCategoryCartoonIcon, getCategoryColor } from '@/app/components/ui/CartoonCategoryIcons';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { InfiniteScrollFooter } from '@/app/components/ui/InfiniteScrollFooter';
import { backendSyncService } from '@/lib/backend-sync-service';
import { AppDateStrip } from '@/app/components/ui/AppDateStrip';
import { TimeFilter, TimeFilterPeriod, filterByTimePeriod, getPeriodLabel } from '@/app/components/ui/TimeFilter';
import { coerceDate, formatLocalDate } from '@/lib/dateUtils';
import { backendService } from '@/lib/backend-api';
import type { TaxComponent } from '@/types/receipt.types';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { SPLIT_TYPE_LABELS, normalizeSplitType } from '@/lib/groupSplit';
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
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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

  // The list reads like a statement: consecutive rows from the same day share a section.
  // Amount sorts break date order, so they render as one section with a date on every row.
  const transactionGroups = useMemo(() => {
    type Group = { key: string; label: string; items: typeof visibleTransactions; showDates: boolean };
    if (visibleTransactions.length === 0) return [] as Group[];
    if (sortBy === 'highest' || sortBy === 'lowest') {
      return [{
        key: `by-amount-${sortBy}`,
        label: sortBy === 'highest' ? 'Highest amount first' : 'Lowest amount first',
        items: visibleTransactions,
        showDates: true,
      }] as Group[];
    }
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    const groups: Group[] = [];
    visibleTransactions.forEach((transaction) => {
      const date = coerceDate(transaction.date);
      const key = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'undated';
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        const label = !date
          ? 'Undated'
          : sameDay(date, today)
          ? 'Today'
          : sameDay(date, yesterday)
          ? 'Yesterday'
          : date.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
            });
        group = { key, label, items: [], showDates: false };
        groups.push(group);
      }
      group.items.push(transaction);
    });
    return groups;
  }, [visibleTransactions, sortBy]);

  const summaryTileClass =
    'p-4 sm:p-5 bg-white border border-slate-100 rounded-[24px] sm:rounded-[28px] shadow-[0_10px_30px_-4px_rgba(112,144,176,0.10)] min-w-0';
  const filterSelectClass =
    'appearance-none bg-white border border-slate-100 shadow-xs text-slate-700 font-bold text-xs py-2 pl-4 pr-8 rounded-full cursor-pointer focus:outline-none transition-all';

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
  const refineCount = Number(selectedCategory !== 'all') + Number(sortBy !== 'newest') + Number(onlyWithReceipts);

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
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-slate-400 truncate">
              {getPeriodLabel(timePeriod, selectedDate)}
            </p>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-tight truncate">Transactions</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="transactions-search-toggle"
              onClick={() => setShowSearch((open) => !open || searchQuery.length > 0)}
              className={cn(
                'w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-[0_6px_18px_-6px_rgba(15,23,42,0.18)]',
                showSearch || searchQuery ? 'bg-[#18181B] text-white' : 'bg-white text-slate-700 border border-slate-100'
              )}
              aria-label="Search transactions"
              aria-expanded={showSearch}
              title="Search"
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              data-testid="transactions-filters-toggle"
              onClick={() => setShowFilters((open) => !open)}
              className={cn(
                'relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-[0_6px_18px_-6px_rgba(15,23,42,0.18)]',
                showFilters ? 'bg-[#18181B] text-white' : 'bg-white text-slate-700 border border-slate-100'
              )}
              aria-label="Filter and sort"
              aria-expanded={showFilters}
              title="Filter & sort"
            >
              <SlidersHorizontal size={18} />
              {refineCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-purple-600 text-white text-2xs font-black flex items-center justify-center border-2 border-white">
                  {refineCount}
                </span>
              )}
            </button>
            {canImport && (
              <button
                type="button"
                data-testid="transactions-scan-bill-button"
                onClick={() => setShowScanModal(true)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white border border-slate-100 text-slate-700 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-[0_6px_18px_-6px_rgba(15,23,42,0.18)]"
                aria-label="Scan bill"
                title="Scan bill"
              >
                <Camera size={18} />
              </button>
            )}
            {canAdd && (
              <button
                type="button"
                data-testid="transactions-add-button"
                onClick={() => setShowTransactionTypeModal(true)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#18181B] hover:bg-black text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-[0_8px_20px_-6px_rgba(15,23,42,0.45)]"
                aria-label="Add transaction"
                title="Add transaction"
              >
                <Plus size={20} />
              </button>
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

        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div data-testid="transactions-card" className={summaryTileClass}>
            <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft size={18} />
            </span>
            <p className="mt-3 text-xs sm:text-sm font-semibold text-slate-400">Income</p>
            <p className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight truncate">{formatCurrency(stats.income)}</p>
            <p className="text-2xs font-medium text-slate-400 truncate">
              {counts.income} {counts.income === 1 ? 'credit' : 'credits'}
            </p>
          </div>

          <div data-testid="transactions-card-2" className={summaryTileClass}>
            <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight size={18} />
            </span>
            <p className="mt-3 text-xs sm:text-sm font-semibold text-slate-400">Expenses</p>
            <p className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight truncate">{formatCurrency(stats.expenses)}</p>
            <p className="text-2xs font-medium text-slate-400 truncate">
              {counts.expense} {counts.expense === 1 ? 'debit' : 'debits'}
            </p>
          </div>

          <div data-testid="transactions-card-3" className={summaryTileClass}>
            <div className="flex items-start justify-between gap-2">
              <span className={cn(
                'w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center',
                stats.netFlow >= 0 ? 'bg-purple-50 text-purple-600' : 'bg-amber-50 text-amber-600'
              )}>
                {stats.netFlow >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              </span>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-2xs font-bold',
                stats.netFlow >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              )}>
                {stats.netFlow >= 0 ? 'Surplus' : 'Deficit'}
              </span>
            </div>
            <p className="mt-3 text-xs sm:text-sm font-semibold text-slate-400">Net flow</p>
            <p className={cn(
              'text-lg sm:text-2xl font-black tracking-tight truncate',
              stats.netFlow >= 0 ? 'text-slate-900' : 'text-rose-600'
            )}>
              {stats.netFlow > 0 ? '+' : ''}{formatCurrency(stats.netFlow)}
            </p>
            <p className="text-2xs font-medium text-slate-400 truncate">
              {stats.netFlow >= 0 ? 'Kept this period' : 'Spent more than earned'}
            </p>
          </div>

          <div className={summaryTileClass}>
            <div className="flex items-start justify-between gap-2">
              <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Receipt size={18} />
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage('receipt-scanner')}
                className="text-2xs font-bold text-purple-700 hover:text-purple-900 inline-flex items-center gap-0.5 cursor-pointer"
              >
                Bills <ChevronRight size={11} />
              </button>
            </div>
            <p className="mt-3 text-xs sm:text-sm font-semibold text-slate-400">Tax on bills</p>
            <p className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight truncate">{formatCurrency(taxSummary.totalTax)}</p>
            <p className="text-2xs font-medium text-slate-400 truncate">
              {counts.withReceipt} {counts.withReceipt === 1 ? 'bill' : 'bills'} · {formatCurrency(taxSummary.monthlyTax)}/mo
            </p>
          </div>
        </div>

        {/* Search (opened from the header) */}
        {(showSearch || searchQuery) && (
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
            <input
              data-testid="transactions-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search description, merchant, tags..."
              autoFocus={showSearch && !searchQuery}
              className="w-full pl-11 pr-10 py-3 bg-white border border-slate-100 shadow-[0_6px_18px_-8px_rgba(15,23,42,0.15)] rounded-full focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer transition-colors"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Filter & sort (opened from the header) */}
        {showFilters && (
          <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar py-0.5 w-full">
            {availableCategories.length > 0 && (
              <div className="relative shrink-0">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={cn(filterSelectClass, selectedCategory !== 'all' && 'border-purple-300 text-purple-700 bg-purple-50')}
                  aria-label="Filter by category"
                >
                  <option value="all">All categories</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <ChevronRight size={12} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
              </div>
            )}

            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className={cn(filterSelectClass, sortBy !== 'newest' && 'border-purple-300 text-purple-700 bg-purple-50')}
                aria-label="Sort transactions"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest amount</option>
                <option value="lowest">Lowest amount</option>
              </select>
              <ChevronRight size={12} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={() => setOnlyWithReceipts(!onlyWithReceipts)}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-all cursor-pointer shrink-0 active:scale-95 whitespace-nowrap',
                onlyWithReceipts
                  ? 'bg-purple-50 text-purple-700 border-purple-300'
                  : 'bg-white text-slate-600 border-slate-100 shadow-xs'
              )}
              aria-pressed={onlyWithReceipts}
            >
              <Paperclip size={12} />
              With bill{counts.withReceipt > 0 ? ` (${counts.withReceipt})` : ''}
            </button>
          </div>
        )}

        {/* Type pills */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar w-full py-0.5">
          {[
            { type: 'all', label: 'All' },
            { type: 'expense', label: 'Expenses' },
            { type: 'income', label: 'Income' },
            { type: 'transfer', label: 'Transfers' },
          ].map((tab) => {
            const isActive = filterType === tab.type;
            return (
              <button
                key={tab.type}
                type="button"
                data-testid={`transactions-filter-${tab.type}`}
                onClick={() => setFilterType(tab.type as typeof filterType)}
                aria-pressed={isActive}
                className={cn(
                  'px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer active:scale-95',
                  isActive
                    ? 'bg-[#18181B] text-white shadow-[0_6px_16px_-6px_rgba(15,23,42,0.5)]'
                    : 'bg-white text-slate-500 border border-slate-100 shadow-xs hover:text-slate-900'
                )}
              >
                {tab.label}
              </button>
            );
          })}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors shrink-0 whitespace-nowrap"
            >
              <X size={12} /> Reset
            </button>
          )}
        </div>

        {/* Transaction list, grouped by day */}
        <div data-testid="transactions-card-4" className="space-y-5">
          {transactionGroups.map((group) => (
            <section key={group.key}>
              <p className="px-1 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                {group.label}
              </p>
              <div className="mt-2 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.10)] px-4 sm:px-5 divide-y divide-slate-100">
                {group.items.map((transaction, i) => {
                  const accountInfo = getAccountInfo(transaction.accountId);
                  const destAccountInfo = transaction.transferToAccountId ? getAccountInfo(transaction.transferToAccountId) : null;
                  const displayType = transaction.type === 'transfer'
                    ? (transaction.subcategory === 'Transfer In' ? 'income' : 'expense')
                    : transaction.type;
                  const attachedDocumentId = getDocumentIdFromTransaction(transaction);
                  const formattedTime = formatTransactionTime(transaction.date);
                  const category = transaction.category || 'Miscellaneous';
                  const metaParts = [
                    transaction.type === 'transfer' && destAccountInfo
                      ? `${accountInfo.name} → ${destAccountInfo.name}`
                      : category,
                    transaction.type === 'transfer' && destAccountInfo ? null : accountInfo.name,
                    transaction.groupName,
                    transaction.contactName,
                  ].filter(Boolean);
                  const sideText = group.showDates
                    ? formatLocalDate(transaction.date, 'en-US', { month: 'short', day: 'numeric' })
                    : formattedTime;

                  return (
                    <div
                      key={transaction.id ?? transaction.cloudId ?? `${group.key}-${i}`}
                      role="button"
                      tabIndex={0}
                      data-testid={`transactions-button-4-${transaction.id}`}
                      onClick={() => setSelectedTransaction(transaction)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTransaction(transaction);
                        }
                      }}
                      className="group w-full flex items-center gap-3 sm:gap-4 py-3 sm:py-3.5 text-left cursor-pointer focus:outline-none focus-visible:bg-slate-50 rounded-xl"
                    >
                      <div
                        className="w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${getCategoryColor(category)}1A` }}
                      >
                        {getCategoryCartoonIcon(category, 22)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-bold text-slate-900 text-sm sm:text-base truncate">
                            {transaction.description || category}
                          </p>
                          {attachedDocumentId && (
                            <Paperclip size={12} className="text-purple-500 shrink-0" aria-label="Bill attached" />
                          )}
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-slate-400 truncate mt-0.5">
                          {metaParts.join(' · ')}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className={cn(
                            'font-extrabold text-sm sm:text-base tracking-tight',
                            transaction.type === 'transfer'
                              ? 'text-purple-600'
                              : displayType === 'income'
                              ? 'text-emerald-600'
                              : 'text-slate-900'
                          )}
                        >
                          {transaction.type === 'transfer' ? '⇄ ' : displayType === 'income' ? '+' : '−'}
                          {formatCurrency(transaction.amount)}
                        </p>
                        {sideText && <p className="text-xs font-medium text-slate-400 mt-0.5">{sideText}</p>}
                      </div>

                      {/* Quick actions on hover (desktop) */}
                      <div className="hidden lg:flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {attachedDocumentId && (
                          <Button
                            data-testid={`transactions-view-bill-${transaction.id}`}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-purple-600 hover:bg-purple-50 rounded-full"
                            onClick={() => handlePreviewBill(transaction)}
                            title="View bill"
                          >
                            <Eye size={14} />
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            data-testid={`transactions-button-2-${transaction.id}`}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              if (transaction.groupExpenseId) {
                                localStorage.setItem('editGroupExpenseId', transaction.groupExpenseId.toString());
                                localStorage.setItem('quickFormType', 'expense');
                                localStorage.setItem('quickExpenseMode', 'group');
                                localStorage.setItem('quickBackPage', 'transactions');
                              } else {
                                localStorage.setItem('editTransactionId', transaction.id?.toString() || '');
                              }
                              setCurrentPage('add-transaction');
                            }}
                            title="Edit transaction"
                          >
                            <Edit2 size={13} />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            data-testid={`transactions-button-3-${transaction.id}`}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteTransaction(transaction.id!, transaction.description)}
                            title="Delete transaction"
                          >
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Empty State */}
          {filteredTransactions.length === 0 && (
            <div className="py-14 flex flex-col items-center text-center px-4 rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.10)]">
              <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-3 text-slate-300">
                <Search size={24} />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">No transactions match your criteria</h3>
              <p className="text-slate-500 text-xs max-w-xs mt-1">
                {hasActiveFilters
                  ? 'Try clearing your search query or relaxing your filter selections to view transactions.'
                  : 'No transactions recorded for this period. Tap + to add your first entry.'}
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
                  className="mt-3 rounded-full text-xs font-bold bg-[#18181B] text-white"
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
        </div>

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
                            <span className="text-2xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded-full">
                              {tx.merchant}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <p className="text-xs text-slate-400 font-medium">
                            {formattedDateTime}
                          </p>
                          {attachedDocumentId && (
                            <button
                              type="button"
                              data-testid="transactions-header-view-bill"
                              onClick={() => { handlePreviewBill(tx); setSelectedTransaction(null); }}
                              className="inline-flex items-center gap-0.5 px-2 py-0.2 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/70 text-2xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
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
                        <span className="text-2xs font-bold text-slate-600 px-1.5 sm:px-2 min-w-[38px] sm:min-w-[44px] text-center select-none">
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
                        <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Amount</p>
                        <p className={cn(
                          'text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mt-0.5',
                          tx.type === 'transfer' ? 'text-purple-600' : displayType === 'income' ? 'text-emerald-600' : 'text-slate-900'
                        )}>
                          {tx.type === 'transfer' ? '⇄ ' : displayType === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </p>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                          {tx.type === 'transfer'
                            ? `Transfer between linked accounts`
                            : displayType === 'income'
                            ? `Credited into ${account?.name || 'Account'}`
                            : `Debited from ${account?.name || 'Account'}`}
                        </p>
                      </div>
                      <span className={cn(
                        'px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-xs font-black uppercase tracking-wider border shadow-xs shrink-0',
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
                        <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Category</span>
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
                        <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">
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
                              <span className="text-2xs text-slate-400 font-semibold bg-slate-100 px-1.5 py-0.2 rounded">
                                {account.type}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Exact Date & Time */}
                      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                        <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Date & Time</span>
                        <span className="text-xs font-bold text-slate-800 text-right">
                          {formattedDateTime}
                        </span>
                      </div>

                      {/* Merchant / Payee */}
                      {tx.merchant && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                          <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Merchant</span>
                          <span className="text-xs font-bold text-slate-800 text-right">
                            {tx.merchant}
                          </span>
                        </div>
                      )}

                      {/* Group Expense Info */}
                      {(tx.groupName || tx.expenseMode === 'group') && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors bg-indigo-50/30">
                          <span className="text-2xs font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1">
                            <Users size={11} /> Group
                          </span>
                          <div className="text-right">
                            <span className="text-xs font-bold text-indigo-900">
                              {tx.groupName || 'Group Expense'}
                            </span>
                            {tx.splitType && (
                              <span className="text-2xs font-semibold text-indigo-600 block">
                                {SPLIT_TYPE_LABELS[normalizeSplitType(tx.splitType)]}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Loan Info */}
                      {(tx.contactName || tx.loanType) && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors bg-amber-50/30">
                          <span className="text-2xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                            <HandCoins size={11} /> Loan
                          </span>
                          <div className="text-right">
                            <span className="text-xs font-bold text-amber-900">
                              {tx.loanType === 'lent' ? 'Money Lent' : 'Money Borrowed'}
                            </span>
                            {tx.contactName && (
                              <span className="text-2xs font-semibold text-amber-700 block">
                                Contact: {tx.contactName}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {Array.isArray(tx.tags) && tx.tags.length > 0 && (
                        <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                          <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Tag size={11} /> Tags
                          </span>
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {tx.tags.map((tag, idx) => (
                              <span key={idx} className="text-2xs font-bold text-purple-700 bg-purple-50 border border-purple-200/50 px-1.5 py-0.2 rounded-md">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {tx.notes && (
                        <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-50/50 transition-colors">
                          <span className="text-2xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Notes</span>
                          <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200/50 leading-relaxed italic">
                            "{tx.notes}"
                          </p>
                        </div>
                      )}

                      {/* Tax Breakdown (if available) */}
                      {attachedTaxAmount > 0 && (
                        <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-purple-50/20">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-2xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                              <Receipt size={11} /> Tax Details
                            </span>
                            <span className="text-xs font-black text-purple-900">
                              {formatCurrency(attachedTaxAmount)}
                            </span>
                          </div>
                          {taxBreakdown.length > 0 && (
                            <div className="space-y-1 mt-1.5 pt-1.5 border-t border-purple-100">
                              {taxBreakdown.map((t, idx) => (
                                <div key={idx} className="flex justify-between text-2xs text-slate-600">
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
                              <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider leading-none">Attached Bill</p>
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
                            if (tx.groupExpenseId) {
                              localStorage.setItem('editGroupExpenseId', tx.groupExpenseId.toString());
                              localStorage.setItem('quickFormType', 'expense');
                              localStorage.setItem('quickExpenseMode', 'group');
                              localStorage.setItem('quickBackPage', 'transactions');
                            } else {
                              localStorage.setItem('editTransactionId', tx.id?.toString() || '');
                            }
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

        {/* Transaction Type Picker - Floating Action Pills */}
        {showTransactionTypeModal && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 flex flex-col items-center justify-center z-[120] p-4">
            <motion.div
              data-testid="transactions-div-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity cursor-pointer"
              onClick={() => setShowTransactionTypeModal(false)}
            />
            
            <motion.div
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.05, delayChildren: 0.02 }
                },
                exit: {
                  opacity: 0,
                  transition: { staggerChildren: 0.03, staggerDirection: -1 }
                }
              }}
              className="relative z-10 flex flex-col items-center gap-1.5 w-full max-w-[170px] sm:max-w-[185px]"
            >
              {[
                {
                  type: 'expense',
                  label: 'Expense',
                  icon: ArrowDownLeft,
                  border: 'hover:border-rose-300 active:border-rose-400',
                  iconStyle: 'bg-rose-50 text-rose-600 border-rose-200/80 group-hover:bg-rose-600 group-hover:text-white',
                  textStyle: 'group-hover:text-rose-600',
                  glow: 'hover:shadow-[0_6px_16px_-3px_rgba(244,63,94,0.25)]',
                },
                {
                  type: 'income',
                  label: 'Income',
                  icon: ArrowUpRight,
                  border: 'hover:border-emerald-300 active:border-emerald-400',
                  iconStyle: 'bg-emerald-50 text-emerald-600 border-emerald-200/80 group-hover:bg-emerald-600 group-hover:text-white',
                  textStyle: 'group-hover:text-emerald-600',
                  glow: 'hover:shadow-[0_6px_16px_-3px_rgba(16,185,129,0.25)]',
                },
                {
                  type: 'transfer',
                  label: 'Transfer',
                  icon: Repeat2,
                  border: 'hover:border-indigo-300 active:border-indigo-400',
                  iconStyle: 'bg-indigo-50 text-indigo-600 border-indigo-200/80 group-hover:bg-indigo-600 group-hover:text-white',
                  textStyle: 'group-hover:text-indigo-600',
                  glow: 'hover:shadow-[0_6px_16px_-3px_rgba(99,102,241,0.25)]',
                },
              ].map((opt) => (
                <motion.button
                  key={opt.type}
                  data-testid={`transaction-modal-type-${opt.type}-button`}
                  variants={{
                    hidden: { opacity: 0, scale: 0.82, y: 14 },
                    visible: {
                      opacity: 1,
                      scale: 1,
                      y: 0,
                      transition: { type: "spring", stiffness: 460, damping: 24 }
                    },
                    exit: { opacity: 0, scale: 0.85, y: 8, transition: { duration: 0.12 } }
                  }}
                  whileHover={{ scale: 1.035, y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    setShowTransactionTypeModal(false);
                    localStorage.setItem('quickFormType', opt.type);
                    setCurrentPage('add-transaction');
                  }}
                  className={cn(
                    "group w-full py-1.5 px-2.5 sm:px-3 flex items-center justify-between rounded-full bg-white/95 backdrop-blur-xl border border-white/70 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.12)] transition-all duration-150 cursor-pointer text-left select-none",
                    opt.border,
                    opt.glow
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border transition-all duration-150 shrink-0 shadow-2xs",
                      opt.iconStyle
                    )}>
                      <opt.icon size={13} className="stroke-[2.5]" />
                    </div>
                    <span className={cn("font-bold text-[11px] sm:text-xs text-slate-900 tracking-tight transition-colors", opt.textStyle)}>
                      {opt.label}
                    </span>
                  </div>
                  <div className="w-4 h-4 rounded-full bg-slate-50 group-hover:bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-slate-700 transition-all duration-150 shrink-0">
                    <ChevronRight size={10} className="stroke-[2.5] group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </motion.button>
              ))}

              {/* Floating Close Button */}
              <motion.button
                data-testid="transactions-cancel"
                variants={{
                  hidden: { opacity: 0, scale: 0.6, y: 8 },
                  visible: {
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    transition: { type: "spring", stiffness: 460, damping: 24 }
                  },
                  exit: { opacity: 0, scale: 0.6, y: 5, transition: { duration: 0.12 } }
                }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setShowTransactionTypeModal(false)}
                className="mt-1 w-7 h-7 rounded-full bg-white/90 hover:bg-white text-slate-500 hover:text-slate-900 backdrop-blur-xl border border-white/60 shadow-[0_4px_14px_-2px_rgba(0,0,0,0.15)] flex items-center justify-center transition-all cursor-pointer"
                aria-label="Close"
                title="Close"
              >
                <X size={13} className="stroke-[2.5]" />
              </motion.button>
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
