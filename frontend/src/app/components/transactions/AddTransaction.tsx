import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAICapability } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { saveTransactionWithBackendSync, updateTransactionWithBackendSync, queueRecordUpsertSync, runWithCloudSyncSuppressed } from '@/lib/auth-sync-integration';
import { applyTransactionAccountImpact, applyAccountBalanceDeltas, getTransactionAccountDeltas } from '@/lib/transactionAggregation';
import { DocumentManagementService } from '@/services/documentManagementService';
import { backendService } from '@/lib/backend-api';
import {
 ArrowDownLeft,
 CalendarDays, Wallet, Tag, AlignLeft, Sparkles,
 CreditCard, Banknote,
 ChevronDown, Check, Users, UserPlus, Trash2,
 Plus, ArrowRightLeft, ArrowDown, Info, ArrowLeft,
 User, X, ScanLine, Paperclip, ArrowUpRight, AlertTriangle, Search
} from 'lucide-react';

import { toast } from 'sonner';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import {
 EXPENSE_CATEGORIES,
 INCOME_CATEGORIES,
 normalizeCategorySelection,
} from '@/lib/expenseCategories';
import { useCategoryNames } from '@/hooks/useCategoryOptions';
import { createCategoryEverywhere } from '@/services/featureSyncService';
import { ReceiptScanner, type ReceiptScanPayload } from '@/app/components/transactions/ReceiptScanner';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { parseDateInputValue, toLocalDateKey, withEntryTime } from '@/lib/dateUtils';
import {
  resolvePendingSmsTransactionDraft,
  markSmsTransactionImported,
  updateSmsTransactionDirection,
} from '@/services/smsTransactionDetectionService';

import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { decodeQuotedPrintable } from '@/services/contactsService';

// --- Types ---
type TransactionType = 'expense' | 'income' | 'transfer' | 'withdrawal';
type ExpenseMode = 'individual' | 'group' | 'loan';
type LoanType = 'borrowed' | 'lent';
type TransferSubType = 'self' | 'others';

interface GroupParticipantDraft {
 id: string;
 friendId?: number;
 name: string;
 share: number;
 email?: string;
 phone?: string;
}

// --- Constants & Helpers ---
// Built-ins only; the picker below reads through useCategoryNames so the user's
// own categories (including ones the importer created) appear here too.
const BUILTIN_CATEGORIES = {
 expense: Object.values(EXPENSE_CATEGORIES as Record<string, any>).map(cat => cat.name as string),
 income: Object.values(INCOME_CATEGORIES as Record<string, any>).map(cat => cat.name as string),
};

const DEFAULT_CATEGORY = {
 expense: 'Food & Dining',
 income: 'Salary',
};

const createDraftId = () =>
 typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
 ? crypto.randomUUID()
 : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createEmptyParticipant = (seed: Partial<GroupParticipantDraft> = {}): GroupParticipantDraft => ({
 id: createDraftId(),
 name: '',
 share: 0,
 ...seed,
});

const formatAccountBalance = (v: number, currency: string) =>
  formatCurrencyAmount(v, currency);

// --- Sub-components ---

const PremiumModeSelector = ({
 options,
 activeId,
 onChange,
 className,
 variant = 'pill'
}: {
 options: { id: string, label: string, icon?: React.ReactNode }[],
 activeId: string,
 onChange: (id: any) => void,
 className?: string,
 variant?: 'pill' | 'ghost'
}) => {
 return (
 <div className={cn(
 variant === 'pill' ?"mode-selector-pill" :"flex gap-1 bg-slate-100/50 p-1 rounded-xl",
 className
 )}>
 {options.map(opt => {
 const isActive = activeId === opt.id;
 return (
 <button data-testid={`add-transaction-button-${opt.id}`}
 key={opt.id}
 onClick={() => onChange(opt.id)}
 className={cn(
"flex-1 relative flex items-center justify-center gap-2 py-2.5 sm:py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors z-10",
 isActive ?"text-white" :"text-slate-500 hover:text-slate-700"
 )}
 >
 {isActive && variant === 'pill' && (
 <motion.div
 layoutId="mode-active-pill"
 className="absolute inset-0 bg-slate-900 rounded-[14px] -z-10 shadow-lg shadow-slate-200"
 transition={{ type:"spring", stiffness: 400, damping: 35 }}
 />
 )}
 {opt.icon && <span className={cn("transition-transform", isActive &&"scale-110")}>{opt.icon}</span>}
 {opt.label}
 </button>
 );
 })}
 </div>
 );
};

const CategoryGrid = ({
  type,
  selectedCategory,
  onSelect,
  aiSuggested,
  onAddCustom
}: {
  type: 'expense' | 'income',
  selectedCategory: string,
  onSelect: (cat: string) => void,
  aiSuggested?: string,
  onAddCustom?: () => void
}) => {
  // Built-ins plus everything in db.categories, live — a category created in
  // Settings or by an import is selectable here the moment it is written.
  const categories = useCategoryNames(type);
  const [activePage, setActivePage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset active page when tab category type changes
  useEffect(() => {
    setActivePage(0);
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
  }, [type]);

  const allItems = useMemo(() => {
    return onAddCustom ? [...categories, '__ADD_CUSTOM__'] : categories;
  }, [categories, onAddCustom]);

  const itemsPerPage = 20;
  const pages = useMemo(() => {
    const chunked: string[][] = [];
    for (let i = 0; i < allItems.length; i += itemsPerPage) {
      chunked.push(allItems.slice(i, i + itemsPerPage));
    }
    return chunked;
  }, [allItems]);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, clientWidth } = containerRef.current;
      if (clientWidth > 0) {
        const pageIndex = Math.round(scrollLeft / clientWidth);
        setActivePage(pageIndex);
      }
    }
  };

  return (
    <div className="w-full flex flex-col">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full p-1 gap-0"
      >
        {pages.map((pageItems, pageIdx) => (
          <div 
            key={pageIdx} 
            className="w-full shrink-0 snap-align-start grid grid-cols-5 grid-rows-4 gap-1 sm:gap-1.5"
          >
            {pageItems.map(cat => {
              if (cat === '__ADD_CUSTOM__') {
                return (
                  <div
                    data-testid="add-transaction-custom-category-tile"
                    key="__ADD_CUSTOM__"
                    onClick={onAddCustom}
                    className="flex flex-col items-center justify-center gap-1 p-1 sm:p-1.5 rounded-xl transition-all cursor-pointer group bg-indigo-50/70 hover:bg-indigo-100/90 border-2 border-dashed border-indigo-300 active:scale-95 shadow-xs"
                  >
                    <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm group-hover:scale-105 transition-transform">
                      <Plus size={14} />
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-tight text-center leading-none text-indigo-700 w-full px-0.5 truncate">
                      + Custom
                    </span>
                  </div>
                );
              }

              return (
                <div data-testid={`add-transaction-div-${cat}`}
                  key={cat}
                  onClick={() => onSelect(cat)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 p-1 sm:p-1.5 rounded-xl transition-all cursor-pointer group",
                    selectedCategory === cat ? "bg-indigo-600 shadow-md shadow-indigo-200" : "bg-slate-50 hover:bg-slate-100",
                    aiSuggested === cat && !selectedCategory && "ring-2 ring-indigo-400 ring-offset-1 animate-pulse"
                  )}
                >
                  <div className={cn("w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg transition-colors", selectedCategory === cat ? "bg-white/20" : "bg-white group-hover:bg-slate-50")}>
                    {getCategoryCartoonIcon(cat, 16)}
                  </div>
                  <span className={cn("text-[9px] sm:text-[10px] font-bold uppercase tracking-tight text-center leading-none truncate w-full px-0.5", selectedCategory === cat ? "text-white" : "text-slate-500")}>
                    {cat.split(' ')[0]}
                  </span>
                </div>
              );
            })}
            {/* Pad the last page if it doesn't have 20 items to preserve the 5x4 grid structure */}
            {pageItems.length < itemsPerPage && 
              Array.from({ length: itemsPerPage - pageItems.length }).map((_, idx) => (
                <div key={`empty-${idx}`} className="opacity-0 pointer-events-none" />
              ))
            }
          </div>
        ))}
      </div>
      {/* Indicator Dots */}
      {pages.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {pages.map((_, idx) => (
            <button data-testid={`add-transaction-go-to-page-${idx}`}
              key={idx}
              type="button"
              onClick={() => {
                if (containerRef.current) {
                  const width = containerRef.current.clientWidth;
                  containerRef.current.scrollTo({ left: idx * width, behavior: 'smooth' });
                  setActivePage(idx);
                }
              }}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                activePage === idx ? "bg-indigo-600 w-3.5" : "bg-slate-300 hover:bg-slate-400"
              )}
              aria-label={`Go to page ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main Component ---

export function AddTransaction() {
 const { accounts, friends, setCurrentPage, currency, refreshData } = useApp();
 const { user } = useAuth();
 const defaultDateKey = toLocalDateKey(new Date()) ?? new Date().toISOString().split('T')[0];
 const isOcrEnabled = useAICapability('ocrEngine', 'transactionOCR');
  const [editingTransactionId] = useState<number | null>(() => {
    const raw = localStorage.getItem('editTransactionId');
    const num = raw ? Number(raw) : null;
    return num && Number.isFinite(num) ? num : null;
  });
  const [originalTransaction, setOriginalTransaction] = useState<any>(null);

 // State
 const [formData, setFormData] = useState(() => {
   const quickType = localStorage.getItem('quickFormType') as TransactionType | null;
   const quickAccountIdStr = localStorage.getItem('quickAccountId');
   const quickAccountId = quickAccountIdStr ? Number(quickAccountIdStr) : null;
   const defaultAccountId = quickAccountId && accounts.some(a => a.id === quickAccountId)
     ? quickAccountId
     : (accounts[0]?.id || 0);

   return {
     type: quickType || 'expense',
     amount: 0,
     accountId: defaultAccountId,
     toAccountId: 0,
     category: quickType === 'transfer' ? 'Transfer' : DEFAULT_CATEGORY[quickType as 'expense' | 'income'] || DEFAULT_CATEGORY.expense,
     subcategory: quickType === 'transfer' ? 'Transfer' : '',
     description: '',
     merchant: '',
     date: defaultDateKey,
     notes: '',
     payee: '',
   };
 });

 const clearQuickStorage = () => {
   localStorage.removeItem('quickFormType');
   localStorage.removeItem('quickAccountId');
   localStorage.removeItem('quickExpenseMode');
   localStorage.removeItem('quickBackPage');
   localStorage.removeItem('editTransactionId');
 };

  // Pre-fill form when editing an existing transaction
  useEffect(() => {
    if (!editingTransactionId) return;

    db.transactions.get(editingTransactionId).then(existing => {
      if (!existing) return;
      setOriginalTransaction(existing);
      const isTransfer = existing.type === 'transfer';
      const existingDateKey = toLocalDateKey(new Date(existing.date)) ?? defaultDateKey;

      setFormData({
        type: existing.type as TransactionType,
        amount: Number(existing.amount || 0),
        accountId: existing.accountId || (accounts[0]?.id || 0),
        toAccountId: existing.transferToAccountId || 0,
        category: existing.category || (isTransfer ? 'Transfer' : DEFAULT_CATEGORY.expense),
        subcategory: existing.subcategory || '',
        description: existing.description || '',
        merchant: existing.merchant || '',
        date: existingDateKey,
        notes: existing.notes || '',
        payee: (existing as any).payee || '',
      });
      setAmountStr(existing.amount ? String(existing.amount) : '');
      if (isTransfer) {
        setTransferSubType(existing.transferToAccountId ? 'self' : 'others');
      }
    });
  }, [editingTransactionId, accounts, defaultDateKey]);

 const [isSubmitting, setIsSubmitting] = useState(false);
 const [showScanner, setShowScanner] = useState(false);
 const [scannerMode, setScannerMode] = useState<'scan' | 'attachment' | null>(null);
 const [scanDocumentId, setScanDocumentId] = useState<number | null>(null);
 const [attachmentDocumentId, setAttachmentDocumentId] = useState<number | null>(null);
 const [activeSmsTransactionId, setActiveSmsTransactionId] = useState<number | null>(null);
 const [amountStr, setAmountStr] = useState('');
 const [balanceError, setBalanceError] = useState<{ available: number; entered: number; accountName: string; currency: string } | null>(null);
 // pendingDuplicate holds a similar transaction found in the 24-hour window.
 // When set, the UI shows a confirmation dialog before proceeding.
 const [pendingDuplicate, setPendingDuplicate] = useState<{ existingTx: any; resolve: (confirm: boolean) => void } | null>(null);
 const [expenseMode, setExpenseMode] = useState<ExpenseMode>(() => {
 const mode = localStorage.getItem('quickExpenseMode') as ExpenseMode | null;
 return mode || 'individual';
 });
 const [loanType, setLoanType] = useState<LoanType>('borrowed');
 const [transferSubType, setTransferSubType] = useState<TransferSubType>('self');
 const [transferMethod, setTransferMethod] = useState<'bank' | 'cash'>('bank');
 const [loanDraft, setLoanDraft] = useState({
 contactName: '',
 interestRate: 0,
 dueDate: defaultDateKey,
 category: 'Personal Loan',
 bankName: '',
 tenureMonths: 12,
 emiAmount: 0,
 downPayment: 0,
 receivedAccount: accounts[0]?.id || 0,
 emiDeductionAccount: accounts[0]?.id || 0,
 transferMethod: 'bank' as 'bank' | 'cash'
 });
 const [groupParticipants, setGroupParticipants] = useState<GroupParticipantDraft[]>([]);
 const [returnPage] = useState(() => localStorage.getItem('quickBackPage') || 'transactions');
 const [remoteCategorySuggestion, setRemoteCategorySuggestion] = useState<any>(null);
 const [manualExpenseCategory, setManualExpenseCategory] = useState(false);
 const [showFriendPicker, setShowFriendPicker] = useState(false);
 const [friendSearch, setFriendSearch] = useState('');
 const [newPersonName, setNewPersonName] = useState('');
 const [showNewPersonInput, setShowNewPersonInput] = useState(false);
 const [showLoanFriendPicker, setShowLoanFriendPicker] = useState(false);
 const [newLoanPersonName, setNewLoanPersonName] = useState('');
 const [showNewLoanPersonInput, setShowNewLoanPersonInput] = useState(false);
 const [transferRecipient, setTransferRecipient] = useState('');
 const [showTransferFriendPicker, setShowTransferFriendPicker] = useState(false);
 const [customBanks, setCustomBanks] = useState<string[]>(() => {
 try {
 return JSON.parse(localStorage.getItem('customBanks') || '[]');
 } catch {
 return [];
 }
 });

  // Custom Category Creation State
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366F1');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Mount effect: Resolve pending SMS draft or pending Receipt scan
  useEffect(() => {
    let isMounted = true;

    async function loadPendingDrafts() {
      // 1. Check SMS transaction draft
      try {
        const smsDraft = await resolvePendingSmsTransactionDraft();
        if (smsDraft && isMounted) {
          setActiveSmsTransactionId(smsDraft.smsTransactionId);
          setFormData((prev) => ({
            ...prev,
            type: smsDraft.type || 'expense',
            amount: Number(smsDraft.amount) || 0,
            accountId: (smsDraft.accountId && accounts.some((a) => a.id === smsDraft.accountId))
              ? smsDraft.accountId
              : prev.accountId,
            category: smsDraft.category || prev.category,
            subcategory: smsDraft.subcategory || '',
            description: smsDraft.description || prev.description,
            merchant: smsDraft.merchant || prev.merchant,
            date: smsDraft.date || prev.date,
          }));
          if (smsDraft.amount) {
            setAmountStr(String(smsDraft.amount));
          }
          toast.info('SMS Transaction Details Loaded');
          return;
        }
      } catch (err) {
        console.debug('Error resolving SMS draft:', err);
      }

      // 2. Check pending receipt scan
      try {
        const rawScan = localStorage.getItem('pendingReceiptScan');
        if (rawScan && isMounted) {
          localStorage.removeItem('pendingReceiptScan');
          const scan = JSON.parse(rawScan);
          const parsedAmount = Number(scan.amount || scan.extractedAmount || 0);
          setFormData((prev) => ({
            ...prev,
            amount: parsedAmount || prev.amount,
            merchant: scan.merchant || scan.merchantName || prev.merchant,
            category: scan.category || prev.category,
            date: scan.date ? (toLocalDateKey(scan.date) || prev.date) : prev.date,
            description: scan.description || (scan.merchant ? `Bill at ${scan.merchant}` : prev.description),
          }));
          if (parsedAmount > 0) {
            setAmountStr(String(parsedAmount));
          }
          if (scan.documentId) {
            setScanDocumentId(Number(scan.documentId));
          }
          toast.info('Receipt Details Loaded');
        }
      } catch (err) {
        console.debug('Error resolving receipt scan draft:', err);
      }
    }

    void loadPendingDrafts();

    return () => {
      isMounted = false;
    };
  }, [accounts]);

  const handleCreateCustomCategory = async () => {
    const name = newCatName.trim();
    if (!name) {
      toast.error('Please enter a category name');
      return;
    }
    setIsCreatingCategory(true);
    try {
      await createCategoryEverywhere({
        name,
        type: formData.type === 'income' ? 'income' : 'expense',
        color: newCatColor,
        icon: 'tag'
      });
      setManualExpenseCategory(true);
      setFormData(prev => ({ ...prev, category: name, subcategory: '' }));
      toast.success(`Category "${name}" created!`);
      setShowAddCategoryModal(false);
      setNewCatName('');
    } catch (err) {
      console.error('Failed to create category:', err);
      toast.error('Failed to create category');
    } finally {
      setIsCreatingCategory(false);
    }
  };

 const DEFAULT_BANKS = [
 { value: 'HDFC Bank', label: 'HDFC Bank' },
 { value: 'ICICI Bank', label: 'ICICI Bank' },
 { value: 'SBI', label: 'State Bank of India' },
 { value: 'Axis Bank', label: 'Axis Bank' },
 { value: 'Kotak Bank', label: 'Kotak Mahindra Bank' },
 { value: 'Bajaj Finance', label: 'Bajaj Finance' },
 { value: 'IDFC First', label: 'IDFC FIRST Bank' },
 { value: 'Bank of Baroda', label: 'Bank of Baroda' },
 { value: 'PNB', label: 'Punjab National Bank' },
 { value: 'Yes Bank', label: 'Yes Bank' },
 { value: 'IndusInd', label: 'IndusInd Bank' },
 { value: 'Muthoot Finance', label: 'Muthoot Finance' },
 { value: 'Tata Capital', label: 'Tata Capital' },
 { value: 'LIC Housing', label: 'LIC Housing Finance' },
 { value: 'Aditya Birla', label: 'Aditya Birla Capital' }
 ];

 const loanProviderOptions = useMemo(() => {
 const combined = [...DEFAULT_BANKS];
 customBanks.forEach(bank => {
 if (!combined.some(b => b.value === bank)) {
 combined.push({ value: bank, label: bank });
 }
 });
 return combined;
 }, [customBanks]);

 const handleBankChange = (val: string) => {
 setLoanDraft(prev => ({ ...prev, bankName: val }));
 if (!loanProviderOptions.some(o => o.value === val)) {
 const updated = [...customBanks, val];
 setCustomBanks(updated);
 localStorage.setItem('customBanks', JSON.stringify(updated));
 }
 };

 const isExpense = formData.type === 'expense';
 const isTransfer = formData.type === 'transfer';
 const isWithdrawal = formData.type === 'withdrawal';
 const isLoanMode = isExpense && expenseMode === 'loan';
 const isBankLoan = isLoanMode && loanType === 'borrowed' && [
 'Consumer Loan', 'Personal Loan', 'Home Loan', 'Vehicle Loan', 'Education Loan', 'Credit Card', 'Overdraft'
 ].includes(loanDraft.category);
 
 const showPersonCard = !isTransfer && !isWithdrawal && (
 expenseMode === 'group' || 
 (isLoanMode && !isBankLoan) || 
 formData.type === 'income'
 );

 const selectedAccount = accounts.find(a => a.id === formData.accountId);
 const targetAccount = accounts.find(a => a.id === formData.toAccountId);

 // Helper: save a new person as a Friend in the DB (temporary record)
 const saveNewFriend = async (name: string): Promise<void> => {
 const trimmed = name.trim();
 if (!trimmed) return;
 const existing = friends.find(f => f.name.toLowerCase() === trimmed.toLowerCase());
 if (existing) return; // already exists
 await db.friends.add({ name: trimmed, createdAt: new Date(), updatedAt: new Date(), syncStatus: 'pending' });
 refreshData();
 };

  // Add participant from friends list
  const addParticipantFromFriend = async (friend: typeof friends[0]) => {
    const fEmail = friend.email ? friend.email.trim().toLowerCase() : '';
    const fPhone = friend.phone ? friend.phone.replace(/\D/g, '') : '';

    const isDuplicate = groupParticipants.some(p => {
      if (p.friendId && p.friendId === friend.id) return true;
      if (fEmail && p.email && p.email.trim().toLowerCase() === fEmail) return true;
      if (fPhone && p.phone && p.phone.replace(/\D/g, '') === fPhone) return true;
      if (!fEmail && !fPhone && !p.email && !p.phone && p.name.trim().toLowerCase() === friend.name.trim().toLowerCase()) return true;
      return false;
    });

    if (isDuplicate) {
      toast.error(`${friend.name} is already added as a participant`);
      return;
    }

    setGroupParticipants(prev => [
      ...prev,
      createEmptyParticipant({
        name: friend.name,
        friendId: friend.id,
        email: friend.email,
        phone: (friend as any)?.phone,
      }),
    ]);
    setShowFriendPicker(false);
  };

  const confirmNewSplitPerson = async () => {
    const name = newPersonName.trim();
    if (!name) return;
    await saveNewFriend(name);
    setGroupParticipants(prev => [...prev, createEmptyParticipant({ name })]);
    setNewPersonName('');
    setShowNewPersonInput(false);
  };

 const confirmNewLoanPerson = async () => {
 const name = newLoanPersonName.trim();
 if (!name) return;
 await saveNewFriend(name);
 setLoanDraft(prev => ({ ...prev, contactName: name }));
 setNewLoanPersonName('');
 setShowNewLoanPersonInput(false);
 setShowLoanFriendPicker(false);
 };

 const switchType = (t: TransactionType) => {
 setFormData(prev => ({
 ...prev,
 type: t,
 category: t === 'transfer' ? 'Transfer' : t === 'withdrawal' ? 'Withdrawal' : DEFAULT_CATEGORY[t as 'expense' | 'income'] || DEFAULT_CATEGORY.expense,
 subcategory: t === 'transfer' ? 'Transfer' : t === 'withdrawal' ? 'Cash Withdrawal' : '',
 toAccountId: (t === 'transfer' || t === 'withdrawal')
 ? (t === 'withdrawal'
 ? (accounts.find(a => a.name.toLowerCase().includes('cash'))?.id || 0)
 : (accounts.find(a => a.id !== prev.accountId)?.id || 0)
 )
 : 0
 }));
 setManualExpenseCategory(false);
 };

 // AI Categorization
 useEffect(() => {
 const input = [formData.description, formData.merchant].filter(Boolean).join(' ').trim();
 if (input.length < 3 || !isExpense) {
 setRemoteCategorySuggestion(null);
 return;
 }
 const timer = setTimeout(() => {
 backendService.categorizeText(input).then(res => {
 if (res && res.confidence >= 0.45) {
 setRemoteCategorySuggestion({ ...res, text: input });
 if (!manualExpenseCategory) {
 setFormData(prev => ({ ...prev, category: normalizeCategorySelection(res.category, 'expense'), subcategory: res.subcategory || '' }));
 }
 }
 });
 }, 400);
 return () => clearTimeout(timer);
 }, [formData.description, formData.merchant, isExpense, manualExpenseCategory]);

  // Mirror a saved transaction's balance impact onto the local accounts. When the
  // backend confirmed the save it already booked the delta in the same DB
  // transaction, and it ignores client balances on account updates — so queueing
  // those account rows would only fire a no-op PUT /accounts/:id per account.
  const applyLocalAccountImpact = (
    saved: Parameters<typeof applyTransactionAccountImpact>[0] & { syncStatus?: string },
    at: Date,
  ) =>
    saved?.syncStatus === 'synced'
      ? runWithCloudSyncSuppressed(() => applyTransactionAccountImpact(saved, at))
      : applyTransactionAccountImpact(saved, at);

  const handleSubmit = async () => {
    if (!selectedAccount) { toast.error('Select an account'); return; }
    if (!formData.amount || formData.amount <= 0) { toast.error('Enter amount'); return; }

    // No-overdraw guard (mirrors the backend INSUFFICIENT_BALANCE check): a debit
    // — expense, transfer, or withdrawal — may not exceed the source account's
    // available balance. Income/credits are never restricted. Credit/overdraft/
    // loan account types (none exist yet) may carry a negative and are exempt.
    {
      const isDebit = formData.type === 'expense' || formData.type === 'transfer' || formData.type === 'withdrawal';
      const allowsNegative = ['credit', 'credit_card', 'overdraft', 'loan'].includes(String(selectedAccount.type || '').toLowerCase());
      const available = Number(selectedAccount.balance ?? 0);
      if (isDebit && !allowsNegative && formData.amount > available) {
        setBalanceError({ available, entered: formData.amount, accountName: selectedAccount.name, currency: selectedAccount.currency || 'INR' });
        return; // prevent save — nothing written locally or to the backend
      }
    }

    // Group mode unique contact validation (names CAN be duplicate, but emails and phones must be unique)
    if (isExpense && expenseMode === 'group' && groupParticipants.length > 0) {
      const emailSet = new Set<string>();
      const phoneSet = new Set<string>();
      for (const p of groupParticipants) {
        if (p.email) {
          const e = p.email.trim().toLowerCase();
          if (emailSet.has(e)) {
            toast.error(`Duplicate participant email "${p.email}". All participants must have unique emails.`);
            return;
          }
          emailSet.add(e);
        }
        if (p.phone) {
          const ph = p.phone.replace(/\D/g, '');
          if (phoneSet.has(ph)) {
            toast.error(`Duplicate participant phone "${p.phone}". All participants must have unique phone numbers.`);
            return;
          }
          phoneSet.add(ph);
        }
      }
    }

    setIsSubmitting(true);
    let intentionalDuplicate = false;
    try {
      // ── Duplicate detection: same amount + same category + same date (±0 days) ──
      // This is a broader check than the 10-second window, catching the case where
      // a user manually enters a transaction that matches a recurring or previous one.
      // If found, we show a confirmation dialog before proceeding (not a silent block).
      // Carries the clock time when the chosen day is today, so entries made on
      // the same day stay in the order they were actually recorded.
      const transactionDate = withEntryTime(parseDateInputValue(formData.date));
      const dayStart = new Date(transactionDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(transactionDate);
      dayEnd.setHours(23, 59, 59, 999);

      if (!editingTransactionId) {
        // Narrow by the indexed accountId first — a bare .filter() walks every
        // transaction the user has ever recorded before each save.
        const similarTransactions = await db.transactions
          .where('accountId')
          .equals(formData.accountId)
          .filter(t =>
            !t.deletedAt &&
            t.type === formData.type &&
            t.amount === formData.amount &&
            t.category === normalizeCategorySelection(formData.category, formData.type as 'expense' | 'income') &&
            !!t.date &&
            new Date(t.date).getTime() >= dayStart.getTime() &&
            new Date(t.date).getTime() <= dayEnd.getTime()
          )
          .limit(1)
          .toArray();

        if (similarTransactions.length > 0) {
          const existingTx = similarTransactions[0];
          // Ask user if they want to create an intentional duplicate
          const confirmed = await new Promise<boolean>((resolve) => {
            setPendingDuplicate({ existingTx, resolve });
          });
          setPendingDuplicate(null);
          if (!confirmed) {
            setIsSubmitting(false);
            return;
          }
          intentionalDuplicate = true;
        }
      }

      const now = new Date();
      let result: any;

      // Handle Edit mode update
      if (editingTransactionId && originalTransaction) {
        const payload: any = {
          type: formData.type,
          amount: formData.amount,
          accountId: formData.accountId,
          category: normalizeCategorySelection(formData.category, formData.type as 'expense' | 'income'),
          subcategory: formData.subcategory,
          description: formData.description,
          merchant: formData.merchant,
          date: transactionDate,
          notes: formData.notes,
          transferToAccountId: (isTransfer || formData.type === 'withdrawal') ? (formData.toAccountId || undefined) : undefined,
          transferType: formData.type === 'withdrawal' ? 'withdrawal' : (transferSubType === 'self' ? 'self-transfer' : 'external-payment'),
          updatedAt: now,
        };

        // Calculate old deltas and new deltas to compute accurate account balance delta changes
        const oldDeltas = getTransactionAccountDeltas(originalTransaction);
        const newDeltas = getTransactionAccountDeltas({ ...originalTransaction, ...payload });

        // Combined delta: reverse old delta (-old), apply new delta (+new)
        const combinedDeltas = new Map<number, number>();
        for (const [accId, delta] of oldDeltas.entries()) {
          combinedDeltas.set(accId, (combinedDeltas.get(accId) || 0) - delta);
        }
        for (const [accId, delta] of newDeltas.entries()) {
          combinedDeltas.set(accId, (combinedDeltas.get(accId) || 0) + delta);
        }

        // Update transaction via backend sync wrapper
        await updateTransactionWithBackendSync(editingTransactionId, payload);

        // Apply balance deltas atomically
        await applyAccountBalanceDeltas(combinedDeltas, now);
        for (const accId of combinedDeltas.keys()) {
          queueRecordUpsertSync('accounts', accId);
        }

        toast.success('Transaction updated successfully');
        clearQuickStorage();
        setCurrentPage(returnPage);
        return;
      }

 if (isTransfer || formData.type === 'withdrawal') {
 const isWithdrawal = formData.type === 'withdrawal';
 const targetAccId = isWithdrawal
 ? (accounts.find(a => a.name.toLowerCase().includes('cash'))?.id || formData.toAccountId)
 : formData.toAccountId;

 if ((transferSubType === 'self' || isWithdrawal) && !targetAccId) {
 toast.error(isWithdrawal ? 'No Cash account found' : 'Select target account');
 return;
 }

 result = await saveTransactionWithBackendSync({
 type: isWithdrawal ? 'transfer' : 'transfer',
 amount: formData.amount,
 accountId: formData.accountId,
 category: isWithdrawal ? 'Withdrawal' : 'Transfer',
 subcategory: isWithdrawal
 ? 'Cash Withdrawal'
 : transferSubType === 'others'
 ? 'External Payment'
 : transferMethod === 'cash'
 ? 'Cash Transfer'
 : 'Bank Transfer',
 description: formData.description || (
 isWithdrawal ? 'ATM Withdrawal'
 : transferSubType === 'self'
 ? `${transferMethod === 'cash' ? 'Cash' : 'Bank'} Transfer to ${accounts.find(a => a.id === targetAccId)?.name}`
 : 'Transfer to Other'
 ),
 date: transactionDate,
 transferToAccountId: (transferSubType === 'self' || isWithdrawal) ? targetAccId : undefined,
 transferType: isWithdrawal ? 'withdrawal' : (transferSubType === 'self' ? 'self-transfer' : 'external-payment'),
 notes: transferMethod === 'cash' ? 'Cash Transfer' : 'Bank Transfer',
 updatedAt: now,
 intentionalDuplicate,
 });

 await applyLocalAccountImpact(result, now);
 } else {
 const payload: any = {
  ...formData,
  category: normalizeCategorySelection(formData.category, formData.type as 'expense' | 'income'),
  date: transactionDate,
  expenseMode: isExpense ? expenseMode : undefined,
  updatedAt: now,
  intentionalDuplicate,
  };

 if (isExpense && expenseMode === 'group') {
 payload.participants = groupParticipants.map(p => ({
 name: p.name,
 share: p.share || (formData.amount / (groupParticipants.length || 1)),
 }));
 } else if (isExpense && expenseMode === 'loan') {
 payload.loanType = loanType;
 payload.contactName = loanDraft.contactName;
 payload.dueDate = parseDateInputValue(loanDraft.dueDate) || new Date();
 payload.interestRate = loanDraft.interestRate;
 payload.loanCategory = loanDraft.category;
 payload.bankName = loanDraft.bankName;
 payload.tenureMonths = loanDraft.tenureMonths;
 payload.emiAmount = loanDraft.emiAmount;
 payload.downPayment = loanDraft.downPayment;
 payload.receivedAccount = loanDraft.receivedAccount;
 payload.emiDeductionAccount = loanDraft.emiDeductionAccount;
 }

 result = await saveTransactionWithBackendSync(payload);
 await applyLocalAccountImpact(result, now);

 // Create GroupExpense record so it appears in the Groups page 
 if (isExpense && expenseMode === 'group' && result?.id && groupParticipants.length > 0) {
 const perHead = formData.amount / (groupParticipants.length + 1); // +1 for current user
 // Enrich each participant with email/phone from their Friend record so the
 // backend can look them up and send the correct invitation email.
 const enrichedParticipants = groupParticipants.map((p) => {
   const friend = p.friendId ? friends.find(f => f.id === p.friendId) : friends.find((f) => f.name.toLowerCase() === p.name.toLowerCase());
   return {
     name: p.name,
     share: p.share && p.share > 0 ? p.share : perHead,
     paid: false,
     isCurrentUser: false,
     paidAmount: 0,
     paymentStatus: 'pending' as const,
     friendId: p.friendId ?? friend?.id,
     email: p.email ?? friend?.email,
     phone: p.phone ?? (friend as any)?.phone,
   };
 });
 const members: import('@/lib/database').GroupMember[] = [
 // Current user's share first
 {
 name: 'You',
 share: perHead,
 paid: true,
 isCurrentUser: true,
 paidAmount: perHead,
 paymentStatus: 'paid',
 },
 ...enrichedParticipants,
 ];

 const groupExpenseName = formData.description || formData.category || 'Group Expense';
 // Suppressed: this block does its own POST /groups below. An unsuppressed add
 // ALSO queues a create, and at Sydney round-trip latency the 250 ms queue timer
 // regularly fired before the direct post came back with a cloudId — so the
 // queue posted the same group a second time under a different idempotency key.
 const groupClientRequestId = crypto.randomUUID();
 const groupExpenseId = await runWithCloudSyncSuppressed(() => db.groupExpenses.add({
 clientRequestId: groupClientRequestId,
 name: groupExpenseName,
 totalAmount: formData.amount,
 paidBy: formData.accountId,
 date: transactionDate,
 members,
 category: formData.category,
 subcategory: formData.subcategory || undefined,
 description: formData.notes || undefined,
 yourShare: perHead,
 splitType: 'equal',
 status: 'pending',
 expenseTransactionId: result.id,
 syncStatus: 'pending',
 createdAt: now,
 updatedAt: now,
 } as any));

 // Push to backend immediately so invitations fire and data persists in the DB.
 // The local Dexie record (syncStatus='pending') is the fallback if this fails.
 try {
   // Resolve local Dexie IDs → backend cloudIds before sending to the API.
   // The backend schema uses UUID foreign keys (Account.id, Friend.id).
   const selectedAccount = accounts.find((a) => a.id === formData.accountId);
   const paidByCloudId = selectedAccount?.cloudId ?? null;

   const backendMembers = [
     { name: 'You', share: perHead, paid: true, isCurrentUser: true },
     ...enrichedParticipants.map((p) => {
       const friend = friends.find((f) => f.id === p.friendId);
       return {
         ...p,
         friendId: friend?.cloudId ?? undefined, // backend UUID, not local integer
       };
     }),
   ];

   const backendResp = await backendService.api.post('/groups', {
     clientRequestId: groupClientRequestId,
     name: groupExpenseName,
     totalAmount: formData.amount,
     paidBy: paidByCloudId,       // backend Account UUID (or null)
     date: transactionDate.toISOString(),
     category: formData.category,
     description: formData.notes || undefined,
     splitType: 'equal',
     yourShare: perHead,
     status: 'pending',
     members: backendMembers,
   });
   const cloudId = backendResp.data?.id ?? backendResp.data?.data?.id;
   if (cloudId) {
     await runWithCloudSyncSuppressed(() =>
       db.groupExpenses.update(groupExpenseId as number, { cloudId: String(cloudId), syncStatus: 'synced' }),
     );
   } else {
     queueRecordUpsertSync('group_expenses', groupExpenseId as number);
   }
 } catch {
   // Offline or server error — the queue retries under the same key.
   queueRecordUpsertSync('group_expenses', groupExpenseId as number);
 }

 // Back-link: store groupExpenseId on the transaction
 await db.transactions.update(result.id, {
 groupExpenseId: groupExpenseId as number,
 groupName: groupExpenseName,
 updatedAt: now,
 });
 } else if (isExpense && expenseMode === 'loan' && result?.id) {
 // Create Loan record 
 await db.loans.add({
 type: (loanType === 'borrowed' && loanDraft.emiAmount > 0) ? 'emi' : (loanType as 'borrowed' | 'lent'),
 name: formData.description || loanDraft.category || 'Loan',
 principalAmount: formData.amount,
 outstandingBalance: formData.amount,
 interestRate: loanDraft.interestRate,
 loanCategory: loanDraft.category,
 bankName: loanDraft.bankName,
 tenureMonths: loanDraft.tenureMonths,
 emiAmount: loanDraft.emiAmount,
 downPayment: loanDraft.downPayment,
 receivedAccountId: loanDraft.receivedAccount || formData.accountId,
 emiDeductionAccountId: loanDraft.emiDeductionAccount || formData.accountId,
 dueDate: loanDraft.dueDate ? new Date(loanDraft.dueDate) : undefined,
 status: 'active',
 contactPerson: loanDraft.contactName,
 accountId: formData.accountId,
 createdAt: now,
 updatedAt: now,
 });
 }
 }

 if (result?.id) {
 const linkedDocId = scanDocumentId ?? attachmentDocumentId;
if (linkedDocId) {
 await new DocumentManagementService().linkTransaction(linkedDocId, result.id);
 }
 if (activeSmsTransactionId) {
   await markSmsTransactionImported(activeSmsTransactionId, result.id);
   await updateSmsTransactionDirection(activeSmsTransactionId, formData.type);
 }
 }

 toast.success('Transaction saved');
 clearQuickStorage();
 setCurrentPage(returnPage);
 } catch (err: any) {
 toast.error(err?.message || 'Failed to save');
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleScanApply = (scan: ReceiptScanPayload) => {
 setFormData(prev => ({
 ...prev,
 amount: scan.amount || prev.amount,
 description: scan.description || scan.merchantName || prev.description,
 merchant: scan.merchantName || prev.merchant,
 date: (scan.date ? toLocalDateKey(scan.date) : prev.date) as string,
 category: (scan.category || prev.category) as string,
 }));
 setAmountStr((scan.amount || 0).toString());
 setScanDocumentId(scan.scanDocumentId || null);
 };

 return (
    <CenteredLayout enablePullToRefresh={false} className="pb-32">
      <div className="space-y-6 w-full">
        {/* Header with circular back button and page title */}
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => { clearQuickStorage(); setCurrentPage(returnPage); }}
              title="Back"
              aria-label="Back"
              data-testid="transaction-back-button"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">
              {editingTransactionId ? 'Edit Transaction' : 'Add Transaction'}
            </h1>
          </div>
        </div>

        {/* Centered Mode Navigation Suite: Main Type Tabs + Sub-mode Selection */}
        <div className="flex flex-col items-center justify-center gap-2.5 sm:gap-3 w-full mx-auto">
          {/* Main Type Tabs (Expense / Income / Transfer) */}
          <div className="flex items-center justify-center bg-white/95 rounded-full p-1 border border-slate-200/80 shadow-xs gap-1 mx-auto">
            {([
              { id: 'expense', label: 'Expense', icon: <ArrowUpRight size={13} /> },
              { id: 'income', label: 'Income', icon: <ArrowDownLeft size={13} /> },
              { id: 'transfer', label: 'Transfer', icon: <ArrowRightLeft size={13} /> },
            ] as { id: TransactionType; label: string; icon: React.ReactNode }[]).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFormData(prev => ({
                    ...prev,
                    type: tab.id,
                    category: tab.id === 'income' ? DEFAULT_CATEGORY.income
                      : tab.id === 'transfer' ? 'Transfer'
                      : DEFAULT_CATEGORY.expense,
                    subcategory: tab.id === 'transfer' ? 'Transfer' : '',
                  }));
                  if (tab.id !== 'expense') {
                    setExpenseMode('individual');
                  }
                }}
                data-testid={`transaction-type-${tab.id}-tab`}
                className={cn(
                  'flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap select-none shrink-0',
                  formData.type === tab.id
                    ? 'bg-[#18181B] text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
                )}
              >
                {tab.icon}
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Sub-mode & Transfer Method Selection */}
          {(isExpense || isTransfer) && (
            <div className="flex flex-row flex-wrap sm:flex-nowrap gap-2 sm:gap-3 items-center justify-center w-full mx-auto">
              {/* Sub-mode Selection for Expense/Transfer */}
              <div className="p-1 flex items-center justify-center gap-1 bg-white/90 rounded-full border border-slate-200/80 shadow-xs mx-auto">
                {isExpense ? [
                  { id: 'individual', label: 'Individual', icon: <Tag size={12} /> },
                  { id: 'group', label: 'Split', icon: <Users size={12} /> },
                  { id: 'loan', label: 'Loan', icon: <Banknote size={12} /> }
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setExpenseMode(m.id as any)}
                    data-testid={`transaction-expense-mode-${m.id}-button`}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-xs transition-all cursor-pointer whitespace-nowrap select-none shrink-0",
                      expenseMode === m.id ? "bg-[#18181B] text-white shadow-xs" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
                    )}
                  >
                    {m.icon}
                    <span className="whitespace-nowrap">{m.label}</span>
                  </button>
                )) : [
                  { id: 'self', label: 'Self', icon: <Wallet size={12} /> },
                  { id: 'others', label: 'Others', icon: <UserPlus size={12} /> }
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTransferSubType(m.id as any)}
                    data-testid={`transaction-transfer-subtype-${m.id}-button`}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-xs transition-all cursor-pointer whitespace-nowrap select-none shrink-0",
                      transferSubType === m.id ? "bg-[#18181B] text-white shadow-xs" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/60"
                    )}
                  >
                    {m.icon}
                    <span className="whitespace-nowrap">{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Transfer Method: Bank / Cash */}
              {isTransfer && (
                <div className="p-1 flex items-center justify-center gap-1 bg-white/90 rounded-full border border-slate-200/80 shadow-xs animate-in fade-in zoom-in-95 duration-200 mx-auto">
                  {([
                    { id: 'bank', label: 'Bank Transfer', icon: <CreditCard size={12} /> },
                    { id: 'cash', label: 'Cash Transfer', icon: <Banknote size={12} /> },
                  ] as { id: 'bank' | 'cash'; label: string; icon: React.ReactNode }[]).map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setTransferMethod(m.id)}
                      data-testid={`transaction-transfer-method-${m.id}-button`}
                      className={cn(
                        'flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-xs transition-all cursor-pointer whitespace-nowrap select-none shrink-0',
                        transferMethod === m.id ? 'bg-[#18181B] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
                      )}
                    >
                      {m.icon}
                      <span className="whitespace-nowrap">{m.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Single-Page Content Area */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 w-full pb-48 no-scrollbar">

 {/* Left Column: Context & categorization (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-4">

 {/* Intelligent Summary - Moved for higher visibility */}
 <div className="p-4 bg-slate-900 rounded-2xl text-white flex items-center justify-between shadow-xl">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Info size={16} className="text-indigo-400" /></div>
 <div>
  <p className="text-[10px] sm:text-[11px] font-bold text-white/50 uppercase tracking-wider">Summary</p>
  <p className="text-xs sm:text-sm font-bold truncate max-w-[120px]">{formData.description || formData.category}</p>
 </div>
 </div>
 <div className="text-right">
  <p className="text-[10px] sm:text-[11px] font-bold text-white/50 uppercase tracking-wider">Final Amount</p>
 <p className="text-lg font-black tracking-tighter">{currency} {formData.amount.toLocaleString()}</p>
 </div>
 </div>

 {/* Primary Input Card */}
 <div className="premium-glass-card p-4 space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {isExpense && expenseMode === 'loan' && (
 <div className="col-span-1 sm:col-span-2">
 <div className="flex gap-2 p-1 bg-white rounded-xl border border-slate-100">
 {['borrowed', 'lent'].map(t => (
 <button key={t} type="button" onClick={() => setLoanType(t as any)} data-testid={`transaction-loan-type-${t}-button`} className={cn("flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", loanType === t ?"bg-slate-900 text-white shadow-md" :"text-slate-400 hover:text-slate-600")}>
 {t === 'borrowed' ? 'Borrowed' : 'Lent'}
 </button>
 ))}
 </div>
 </div>
 )}
 {expenseMode === 'loan' && (
  <div className="col-span-1 sm:col-span-2 space-y-2">
  <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Loan Category</label>
  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
  {(loanType === 'borrowed'
  ? ['Consumer Loan', 'Personal Loan', 'Home Loan', 'Vehicle Loan', 'Education Loan', 'Credit Card', 'Overdraft', 'Others']
  : ['Personal / Friend', 'Business', 'Others']
  ).map(cat => (
  <button data-testid={`add-transaction-button-2-${cat}`}
  key={cat}
  type="button"
  onClick={() => {
  setLoanDraft(prev => ({ ...prev, category: cat }));
  setFormData(prev => ({ ...prev, category: cat }));
  }}
  className={cn("px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold transition-all border", (loanDraft.category === cat || formData.category === cat) ? (loanType === 'borrowed' ?"bg-indigo-50 border-indigo-200 text-indigo-700" :"bg-emerald-50 border-emerald-200 text-emerald-700") :"bg-white border-slate-100 text-slate-600 hover:bg-slate-50")}
  >
  {cat}
  </button>
  ))}
  </div>
  </div>
  )}
  <div className="col-span-1 sm:col-span-2 space-y-1">
  <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Description / Reason</label>
  <div className="relative">
  <AlignLeft className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
  <input
    type="text"
    value={formData.description}
    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
    aria-label="Description"
    data-testid="transaction-description-input"
    className="w-full h-10 sm:h-11 bg-slate-50 hover:bg-slate-100/60 border border-slate-200/90 rounded-xl pl-9 pr-3 font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal text-xs sm:text-sm placeholder:text-xs sm:placeholder:text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs text-center sm:text-left placeholder:text-center sm:placeholder:text-left"
    placeholder="e.g. Pani Puri & Pav Baji / Friends / Groceries"
  />
  </div>
  </div>
  </div>

  {/* AI Highlight / Detection Indicator */}
  {remoteCategorySuggestion && (
  <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100/50">
  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0">
  <Sparkles size={14} />
  </div>
  <div className="flex-1">
  <p className="text-[10px] sm:text-[11px] font-bold text-indigo-600 uppercase tracking-wider">AI Detected Category</p>
  <p className="text-xs sm:text-sm font-bold text-slate-700">{remoteCategorySuggestion.category} ({(remoteCategorySuggestion.confidence * 100).toFixed(0)}% confident)</p>
  </div>
  </div>
  )}

  {/* Unified Category Selector */}
  {!isTransfer && expenseMode !== 'loan' && (
  <div className="space-y-2 sm:space-y-3">
  <div className="flex items-center justify-between gap-2">
  <div className="flex items-center gap-1.5 sm:gap-2">
    <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Select Category</label>
    <button
      type="button"
      onClick={() => setShowAddCategoryModal(true)}
      data-testid="add-custom-category-header-btn"
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all border border-indigo-200/60 shadow-xs cursor-pointer active:scale-95"
    >
      <Plus size={10} />
      <span>+ Custom</span>
    </button>
  </div>
  <span className="text-[10px] sm:text-[11px] font-bold text-indigo-500 shrink-0">Auto-Categorization Active</span>
  </div>
  <CategoryGrid
  type={formData.type === 'income' ? 'income' : 'expense'}
  selectedCategory={formData.category}
  onSelect={cat => { setManualExpenseCategory(true); setFormData(prev => ({ ...prev, category: cat, subcategory: '' })); }}
  aiSuggested={remoteCategorySuggestion?.category}
  onAddCustom={() => setShowAddCategoryModal(true)}
  />
  </div>
  )}
 </div>

 {/* Person / Participants Section - NEW Dedicated Card */}
 {showPersonCard && (
 <div className="premium-glass-card p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
 <div className="flex items-center justify-between">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
 {expenseMode === 'group' ? `PARTICIPANTS (${groupParticipants.length + 1})` : 
 expenseMode === 'loan' ? 'COUNTERPARTY' : 'WHO? / PERSON'}
 </label>
 
 <div className="flex gap-2">
 {friends.length > 0 && (
 <button
 type="button"
 onClick={() => { setShowFriendPicker(p => !p); setShowNewPersonInput(false); }}
 data-testid="transaction-friends-picker-button"
 className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 px-3 py-1 rounded-full uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
 >
 <Users size={11} /> Friends
 </button>
 )}
 <button
 type="button"
 onClick={() => { setShowNewPersonInput(p => !p); setShowFriendPicker(false); }}
 data-testid="transaction-add-person-toggle-button"
 className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 px-3 py-1 rounded-full uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
 >
 <UserPlus size={11} /> New
 </button>
 </div>
 </div>

 {/* Individual / Loan Mode: Single Person Picker */}
 {expenseMode !== 'group' && (
 <div className="space-y-4">
 <div className="relative">
 <button
 type="button"
 onClick={() => setShowFriendPicker(p => !p)}
 data-testid="transaction-person-picker-button"
 className="w-full flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-2xl py-3 px-4 font-bold text-xs text-slate-700 hover:bg-slate-100/60 transition-all cursor-pointer"
 >
 <div className="flex items-center gap-2">
 {formData.payee || loanDraft.contactName ? (
 <div className="w-6 h-6 rounded-full bg-[#18181B] flex items-center justify-center text-[10px] font-black text-white uppercase">
 {(formData.payee || loanDraft.contactName)[0]}
 </div>
 ) : (
 <User size={14} className="text-slate-400" />
 )}
 <span className={cn('text-[11px] sm:text-xs font-semibold', formData.payee || loanDraft.contactName ? 'text-slate-900' : 'text-slate-400')}>
 {formData.payee || loanDraft.contactName || 'Select Person'}
 </span>
 </div>
 <ChevronDown size={14} className="text-slate-400" />
 </button>
 </div>
 </div>
 )}

      {/* Friends quick-add / Selection Panel */}
      {showFriendPicker && friends.length > 0 && (
        <div className="p-3.5 bg-purple-50/70 rounded-2xl border border-purple-100/90 animate-in zoom-in-95 duration-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Tap to select friend</p>
            <button
              type="button"
              onClick={() => {
                setShowFriendPicker(false);
                setFriendSearch('');
              }}
              className="text-purple-400 hover:text-purple-600 text-[10px] font-bold uppercase cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Search box for filtering contacts */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none" />
            <input
              type="text"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              placeholder="Search contact by name or number..."
              data-testid="transaction-friend-search-input"
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-purple-200/80 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
            />
            {friendSearch && (
              <button
                type="button"
                onClick={() => setFriendSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto pr-1">
            {(() => {
              const query = friendSearch.toLowerCase().trim();
              const queryDigits = friendSearch.replace(/\D/g, '');
              const filtered = friends.filter(f => {
                if (!query) return true;
                const decoded = decodeQuotedPrintable(f.name).toLowerCase();
                const raw = f.name.toLowerCase();
                const email = (f.email || '').toLowerCase();
                const phoneDigits = (f.phone || '').replace(/\D/g, '');
                return decoded.includes(query) || raw.includes(query) || email.includes(query) || (queryDigits && phoneDigits.includes(queryDigits));
              });

              if (filtered.length === 0) {
                return (
                  <p className="text-xs text-purple-400 py-2 w-full text-center">
                    No contacts match "{friendSearch}"
                  </p>
                );
              }

              return filtered.map(f => {
                const cleanName = decodeQuotedPrintable(f.name);
                const fEmail = f.email?.trim().toLowerCase();
                const fPhone = f.phone?.replace(/\D/g, '');
                const isSelected = expenseMode === 'group' 
                  ? groupParticipants.some(p =>
                      (p.friendId && p.friendId === f.id) ||
                      (fEmail && p.email && p.email.trim().toLowerCase() === fEmail) ||
                      (fPhone && p.phone && p.phone.replace(/\D/g, '') === fPhone) ||
                      (!fEmail && !fPhone && !p.email && !p.phone && p.name.trim().toLowerCase() === cleanName.trim().toLowerCase())
                    )
                  : (formData.payee === cleanName || loanDraft.contactName === cleanName);

                return (
                  <button
                    data-testid={`add-transaction-button-3-${f.id}`}
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (expenseMode === 'group') {
                        if (!isSelected) addParticipantFromFriend({ ...f, name: cleanName });
                      } else {
                        setFormData(prev => ({ ...prev, payee: cleanName }));
                        setLoanDraft(prev => ({ ...prev, contactName: cleanName }));
                        setShowFriendPicker(false);
                      }
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border cursor-pointer shadow-2xs flex items-center gap-1.5",
                      isSelected
                        ? "bg-[#18181B] border-[#18181B] text-white shadow-xs"
                        : "bg-white border-purple-200 text-purple-700 hover:bg-purple-600 hover:text-white hover:border-purple-600"
                    )}
                  >
                    <span>{cleanName}</span>
                    {f.email ? (
                      <span className="text-[9px] opacity-70">({f.email})</span>
                    ) : f.phone ? (
                      <span className="text-[9px] opacity-70">({f.phone})</span>
                    ) : null}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}

 {/* New Person Input */}
 {showNewPersonInput && (
 <div className="flex items-center gap-2 p-3 bg-indigo-50/70 rounded-2xl border border-indigo-100/90 animate-in slide-in-from-top-2">
 <UserPlus size={14} className="text-indigo-500 shrink-0" />
 <input
 type="text"
 value={newPersonName}
 onChange={e => setNewPersonName(e.target.value)}
 onKeyDown={e => {
 if (e.key === 'Enter') {
 if (expenseMode === 'group') confirmNewSplitPerson();
 else {
 setFormData(prev => ({ ...prev, payee: newPersonName }));
 setLoanDraft(prev => ({ ...prev, contactName: newPersonName }));
 setShowNewPersonInput(false);
 }
 }
 }}
 aria-label="New person name"
 data-testid="transaction-new-person-input"
 className="flex-1 bg-transparent border-none p-0 text-[11px] sm:text-xs font-semibold text-slate-900 focus:ring-0 placeholder:text-slate-400 placeholder:font-normal placeholder:text-[10px] sm:placeholder:text-[11px]"
 placeholder="Enter name & press Enter"
 autoFocus
 />
 <button
 type="button"
 title="Confirm"
 onClick={() => {
 if (expenseMode === 'group') confirmNewSplitPerson();
 else {
 setFormData(prev => ({ ...prev, payee: newPersonName }));
 setLoanDraft(prev => ({ ...prev, contactName: newPersonName }));
 setShowNewPersonInput(false);
 }
 }}
 data-testid="transaction-new-person-confirm-button"
 className="p-1.5 bg-[#18181B] hover:bg-black text-white rounded-full transition-all cursor-pointer shadow-2xs"
 >
 <Check size={12} strokeWidth={3} />
 </button>
 </div>
 )}

 {/* Split Mode: Participant List Display */}
 {expenseMode === 'group' && (
 <div className="space-y-3">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-none">
 {/* Fixed "You" */}
 <div className="flex items-center gap-2.5 p-2.5 bg-slate-100/70 rounded-2xl border border-slate-100">
 <div className="w-7 h-7 rounded-full bg-[#18181B] flex items-center justify-center text-[9px] font-black text-white shrink-0">ME</div>
 <div className="flex-1 min-w-0">
  <p className="text-xs font-black text-slate-900 truncate">You (Included)</p>
  <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Payer / Equal share</p>
 </div>
 </div>

 {groupParticipants.map(p => (
 <div key={p.id} className="flex items-center gap-2 p-2.5 bg-white rounded-2xl border border-slate-100 group shadow-2xs hover:border-slate-200 transition-all">
 <div className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 uppercase shrink-0">
 {p.name?.[0] || '?'}
 </div>
 <input
 data-testid={`add-transaction-participant-name-${p.id}`}
 type="text"
 value={p.name}
 onChange={e => setGroupParticipants(prev => prev.map(i => i.id === p.id ? { ...i, name: e.target.value } : i))}
 aria-label="Participant name"
 className="flex-1 bg-transparent border-none p-0 text-xs font-bold text-slate-900 focus:ring-0"
 />
 <button
 data-testid={`add-transaction-remove-participant-${p.id}`}
 type="button"
 title="Remove participant"
 onClick={() => setGroupParticipants(prev => prev.filter(i => i.id !== p.id))}
 className="w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
 >
 <Trash2 size={12} strokeWidth={2.5} />
 </button>
 </div>
 ))}
 </div>

 {/* Live Split Calculation Summary Card */}
 <div className="p-4 bg-[#18181B] rounded-2xl text-white flex items-center justify-between shadow-md">
 <div>
  <p className="text-[10px] sm:text-[11px] font-bold text-white/50 uppercase tracking-wider">
  Equal Split ({groupParticipants.length + 1} people)
  </p>
 <p className="text-xs font-bold text-white mt-0.5">
 {formData.amount > 0 ? (
 <>
 <span className="text-white/40">{currency}</span> {(formData.amount / (groupParticipants.length + 1)).toFixed(2)} <span className="text-white/40 font-normal">/ head</span>
 </>
 ) : (
 <span className="text-white/40">Enter amount above to view split</span>
 )}
 </p>
 </div>
 <div className="text-right">
  <p className="text-[10px] sm:text-[11px] font-bold text-white/50 uppercase tracking-wider">Your Share</p>
 <p className="text-sm sm:text-base font-black text-purple-300">
 {currency} {formData.amount > 0 ? (formData.amount / (groupParticipants.length + 1)).toFixed(2) : '0'}
 </p>
 </div>
 </div>
 </div>
 )}
 </div>
 )}

 {/* Additional Loan Meta Card */}
 {isExpense && expenseMode === 'loan' && (
 <div className="premium-glass-card p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
 {loanType === 'borrowed' ? (
 <div className="space-y-4">
 {['Consumer Loan', 'Personal Loan', 'Home Loan', 'Vehicle Loan', 'Education Loan', 'Credit Card', 'Overdraft'].includes(loanDraft.category) && (
 <div className="space-y-2">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Loan Provider</label>
 <SearchableDropdown testId="add-transaction-select-bank-nbfc"
 options={loanProviderOptions}
 value={loanDraft.bankName}
 onChange={handleBankChange}
 placeholder="Select Bank/NBFC"
 allowCustom={true}
 className="bg-slate-50 border border-slate-200/80 rounded-xl h-10 sm:h-11 font-semibold text-xs sm:text-sm"
 />
 </div>
 )}

 {/* Institutional Loan Details - ONLY for Bank/NBFC categories */}
 {['Consumer Loan', 'Personal Loan', 'Home Loan', 'Vehicle Loan', 'Education Loan', 'Credit Card', 'Overdraft'].includes(loanDraft.category) ? (
 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Interest (%)</label>
 <input data-testid="add-transaction-interest-rate" type="number" value={loanDraft.interestRate} onChange={e => setLoanDraft(prev => ({ ...prev, interestRate: parseFloat(e.target.value) || 0 }))} aria-label="Interest rate" className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl px-3 font-semibold text-xs sm:text-sm text-center" />
 </div>
 <div className="space-y-1">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tenure (Months)</label>
 <input data-testid="add-transaction-tenure-in-months" type="number" value={loanDraft.tenureMonths} onChange={e => setLoanDraft(prev => ({ ...prev, tenureMonths: parseInt(e.target.value) || 0 }))} aria-label="Tenure in months" className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl px-3 font-semibold text-xs sm:text-sm text-center" />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">EMI Amount</label>
 <input data-testid="add-transaction-emi-amount" type="number" value={loanDraft.emiAmount} onChange={e => setLoanDraft(prev => ({ ...prev, emiAmount: parseFloat(e.target.value) || 0 }))} aria-label="EMI amount" className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl px-3 font-semibold text-xs sm:text-sm text-center" />
 </div>
 <div className="space-y-1">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Down Payment</label>
 <input data-testid="add-transaction-down-payment" type="number" value={loanDraft.downPayment} onChange={e => setLoanDraft(prev => ({ ...prev, downPayment: parseFloat(e.target.value) || 0 }))} aria-label="Down payment" className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl px-3 font-semibold text-xs sm:text-sm text-center" />
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Received In</label>
 <SearchableDropdown testId="add-transaction-select-account"
 options={accounts.map(a => ({ value: String(a.id), label: a.name, description: formatAccountBalance(a.balance, currency) }))}
 value={String(loanDraft.receivedAccount)}
 onChange={val => {
 const accId = parseInt(val);
 setLoanDraft(prev => ({ ...prev, receivedAccount: accId }));
 setFormData(prev => ({ ...prev, accountId: accId }));
 }}
 placeholder="Select Account"
 className="bg-slate-50 border border-slate-200/80 rounded-xl h-10 sm:h-11 font-semibold text-xs sm:text-sm"
 />
 </div>
 <div className="space-y-1">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">EMI Deduction</label>
 <SearchableDropdown testId="add-transaction-select-account-2"
 options={accounts.map(a => ({ value: String(a.id), label: a.name, description: formatAccountBalance(a.balance, currency) }))}
 value={String(loanDraft.emiDeductionAccount)}
 onChange={val => setLoanDraft(prev => ({ ...prev, emiDeductionAccount: parseInt(val) }))}
 placeholder="Select Account"
 className="bg-slate-50 border border-slate-200/80 rounded-xl h-10 sm:h-11 font-semibold text-xs sm:text-sm"
 />
 </div>
 </div>
 </div>
 ) : (
 /* Simplified Borrowed View (e.g. from Friends/Cash) */
 <div className="space-y-4">
 <div className="space-y-2">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Received Method</label>
 <div className="flex gap-2">
 {['bank', 'cash'].map((m) => (
 <button data-testid={`add-transaction-button-6-${m}`}
 key={m}
 type="button"
 onClick={() => {
 const cashAcc = accounts.find(a => a.name.toLowerCase().includes('cash'));
 const accId = m === 'cash' ? (cashAcc?.id || 0) : (accounts.find(a => !a.name.toLowerCase().includes('cash'))?.id || 0);
 setLoanDraft(prev => ({ ...prev, transferMethod: m as any, receivedAccount: accId }));
 setFormData(prev => ({ ...prev, accountId: accId }));
 }}
 className={cn(
"flex-1 py-2 rounded-xl text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-all border",
 loanDraft.transferMethod === m 
 ?"bg-indigo-600 border-indigo-600 text-white shadow-md" 
 :"bg-white border-slate-200/80 text-slate-500 hover:bg-slate-50"
 )}
 >
 {m === 'bank' ? 'Bank Transfer' : 'Cash'}
 </button>
 ))}
 </div>
 </div>

 {loanDraft.transferMethod === 'bank' && (
 <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Select Bank Account</label>
 <SearchableDropdown testId="add-transaction-select-account-3"
 options={accounts.filter(a => !a.name.toLowerCase().includes('cash')).map(a => ({ value: String(a.id), label: a.name, description: formatAccountBalance(a.balance, currency) }))}
 value={String(loanDraft.receivedAccount)}
 onChange={val => {
 const accId = parseInt(val);
 setLoanDraft(prev => ({ ...prev, receivedAccount: accId }));
 setFormData(prev => ({ ...prev, accountId: accId }));
 }}
 placeholder="Select Account"
 className="bg-slate-50 border border-slate-200/80 rounded-xl h-10 sm:h-11 font-semibold text-xs sm:text-sm"
 />
 </div>
 )}

 {loanDraft.transferMethod === 'cash' && (
 <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
 <span className="text-xs font-semibold text-slate-500">Crediting to:</span>
 <span className="text-xs font-bold text-slate-900 uppercase">Cash In Hand</span>
 </div>
 )}

 <div className="space-y-2">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Return Date / Reminder</label>
 <div data-testid="add-transaction-div-2" className="relative group" onClick={(e) => {
 const input = e.currentTarget.querySelector('input');
 if (input) (input as any).showPicker();
 }}>
 <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors z-10" size={14} />
 <div className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-3 font-semibold text-xs sm:text-sm text-slate-900 group-hover:bg-slate-100/50 group-hover:border-slate-300 transition-all flex items-center h-10 sm:h-11">
 {(() => {
 if (!loanDraft.dueDate) return 'Set Date';
 const date = new Date(loanDraft.dueDate);
 const day = String(date.getDate()).padStart(2, '0');
 const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
 })()}
 </div>
 <input data-testid="add-transaction-return-date"
 type="date"
 value={loanDraft.dueDate}
 onChange={e => setLoanDraft(prev => ({ ...prev, dueDate: e.target.value }))}
 aria-label="Return date"
 className="absolute inset-0 opacity-0 cursor-pointer z-20"
 />
 </div>
 </div>
 </div>
 )}
 </div>
 ) : (
 <div className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-2">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lent From</label>
 <SearchableDropdown testId="add-transaction-select-account-4"
 options={accounts.map(a => ({ value: String(a.id), label: a.name, description: formatAccountBalance(a.balance, currency) }))}
 value={String(loanDraft.receivedAccount)}
 onChange={val => {
 const accId = parseInt(val);
 setLoanDraft(prev => ({ ...prev, receivedAccount: accId }));
 setFormData(prev => ({ ...prev, accountId: accId }));
 }}
 placeholder="Select Account"
 className="bg-slate-50 border border-slate-200/80 rounded-xl h-10 sm:h-11 font-semibold text-xs sm:text-sm"
 />
 </div>
 <div className="space-y-2">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Due Date</label>
 <div data-testid="add-transaction-div-3" className="relative group" onClick={(e) => {
 const input = e.currentTarget.querySelector('input');
 if (input) (input as any).showPicker();
 }}>
 <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors z-10" size={14} />
 <div className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-3 font-semibold text-xs sm:text-sm text-slate-900 group-hover:bg-slate-100/50 group-hover:border-slate-300 transition-all flex items-center h-10 sm:h-11">
 {(() => {
 if (!loanDraft.dueDate) return 'Select Due Date';
 const date = new Date(loanDraft.dueDate);
 const day = String(date.getDate()).padStart(2, '0');
 const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
 })()}
 </div>
 <input data-testid="add-transaction-due-date"
 type="date"
 value={loanDraft.dueDate}
 onChange={e => setLoanDraft(prev => ({ ...prev, dueDate: e.target.value }))}
 aria-label="Due date"
 className="absolute inset-0 opacity-0 cursor-pointer z-20"
 />
 </div>
 </div>
 </div>
 </div>
 )}
 </div>
 )}
 </div>

 {/* Right Column: Financials & Action (lg:col-5) */}
 <div className="lg:col-span-5 flex flex-col gap-4">

 {/* Amount Display - Premium & High Density */}
 <div className="premium-glass-card p-8 bg-white relative overflow-hidden flex flex-col items-center">
 <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full animate-pulse pointer-events-none z-0" />
 <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-violet-500/5 blur-[80px] rounded-full animate-pulse pointer-events-none z-0 [animation-delay:1s]" />

 <div className="relative z-10 flex flex-col items-center w-full">
 <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 sm:mb-4">Transaction Amount</span>

 <div className="flex items-center justify-center w-full my-2 sm:my-4 gap-1 sm:gap-4 overflow-hidden px-2">
 {/* Left Side: Currency */}
 <div className="flex-1 flex justify-end">
 <span className="text-xl sm:text-4xl font-black text-slate-200 select-none tracking-tighter shrink-0">{currency}</span>
 </div>

 {/* Center: Input */}
 <div className="shrink-0 flex justify-center max-w-[60%]">
 <input
 type="number"
 name="amount"
 value={amountStr}
 onChange={e => { setAmountStr(e.target.value); setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 })); if (balanceError) setBalanceError(null); }}
 aria-label="Transaction amount"
 data-testid="transaction-amount-input"
 className={cn("bg-transparent text-4xl min-[400px]:text-5xl sm:text-6xl font-black outline-none w-full text-center tracking-tighter placeholder:text-slate-100 p-0 m-0", balanceError ? "text-rose-600" : "text-slate-900")}
 placeholder="0"
 autoFocus
 />
 </div>

 {/* Right Side: Clear Button */}
 <div className="flex-1 flex justify-start">
 {amountStr && (
 <button
 onClick={() => { setAmountStr(''); setFormData(prev => ({ ...prev, amount: 0 })); }}
 title="Clear amount"
 data-testid="transaction-amount-clear-button"
 className="p-1 sm:p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all animate-in fade-in zoom-in-50"
 >
 <X size={20} className="sm:w-7 sm:h-7" strokeWidth={3} />
 </button>
 )}
 </div>
 </div>

 <div className="flex flex-wrap justify-center gap-3 mt-8 max-w-sm">
 {[100, 500, 1000, 2000, 5000].map(amt => (
 <button
 key={amt}
 type="button"
 onClick={() => {
 const current = Number(formData.amount) || 0;
 const next = current + amt;
 setAmountStr(String(next));
 setFormData(prev => ({ ...prev, amount: next }));
 }}
 data-testid={`transaction-preset-${amt}-button`}
 className="px-6 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-black text-slate-500 hover:bg-slate-900 hover:text-white hover:border-slate-900 hover:shadow-2xl hover:shadow-slate-200 transition-all active:scale-90 select-none"
 >
 +{currency}{amt}
 </button>
 ))}
 </div>
 </div>
 </div>

 <div className="premium-glass-card p-4 sm:p-6 space-y-5">
 <div className="space-y-2">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
 {isWithdrawal ? 'Withdraw From Account' : isTransfer ? 'From Account' : 'Account'}
 </label>
 <SearchableDropdown testId="add-transaction-account"
 options={accounts.map(a => ({
 value: String(a.id),
 label: a.name,
 description: formatAccountBalance(a.balance, currency),
 icon: <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 font-bold text-[9px] sm:text-[10px]">{(a.type || 'BK').substring(0, 2).toUpperCase()}</div>
 }))}
 value={String(formData.accountId)}
 onChange={val => setFormData(prev => ({ ...prev, accountId: parseInt(val) }))}
 placeholder="Account"
 triggerClassName="h-10 sm:h-11 border border-slate-200/80 bg-slate-50 rounded-xl font-semibold text-xs sm:text-sm shadow-none"
 />
 </div>

 {/* To Account Bank Transfer: self */}
 {isTransfer && transferSubType === 'self' && transferMethod === 'bank' && (
 <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
 <div className="flex justify-center"><ArrowDown size={14} className="text-slate-300" /></div>
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">To Account</label>
 <SearchableDropdown testId="add-transaction-destination-account"
 options={accounts.filter(a => a.id !== formData.accountId).map(a => ({
 value: String(a.id),
 label: a.name,
 description: formatAccountBalance(a.balance, currency),
 icon: <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-400 font-black text-[9px]">{(a.type || 'BK').substring(0, 2).toUpperCase()}</div>
 }))}
 value={String(formData.toAccountId)}
 onChange={val => setFormData(prev => ({ ...prev, toAccountId: parseInt(val) }))}
 placeholder="Destination Account"
 triggerClassName="h-10 sm:h-11 border border-slate-200/80 bg-slate-50 rounded-xl font-semibold text-xs sm:text-sm shadow-none"
 />
 </div>
 )}

 {/* Cash Transfer: self show info banner, no To Account needed */}
 {isTransfer && transferSubType === 'self' && transferMethod === 'cash' && (
 <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl animate-in fade-in duration-200">
 <Banknote size={16} className="text-amber-500 shrink-0" />
 <p className="text-xs font-semibold text-amber-700">
 Cash handed over directly no destination account needed.
 </p>
 </div>
 )}

 {/* Withdrawal */}
 {isWithdrawal && (
 <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
 <div className="flex justify-center"><ArrowDown size={14} className="text-slate-300" /></div>
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Deposit To</label>
 <SearchableDropdown testId="add-transaction-destination-account-2"
 options={accounts.filter(a => a.id !== formData.accountId).map(a => ({
 value: String(a.id),
 label: a.name,
 description: formatAccountBalance(a.balance, currency),
 icon: <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-400 font-black text-[9px]">{(a.type || 'BK').substring(0, 2).toUpperCase()}</div>
 }))}
 value={String(formData.toAccountId)}
 onChange={val => setFormData(prev => ({ ...prev, toAccountId: parseInt(val) }))}
 placeholder="Destination Account"
 disabled={isWithdrawal}
 triggerClassName="h-10 sm:h-11 border border-slate-200/80 bg-slate-50 rounded-xl font-semibold text-xs sm:text-sm shadow-none"
 />
 </div>
 )}

 {/* Others transfer recipient picker + name input */}
 {isTransfer && transferSubType === 'others' && (
 <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
 <div className="flex justify-center"><ArrowDown size={14} className="text-slate-300" /></div>
 <div className="premium-glass-card p-4 space-y-4">
  <div className="flex items-center justify-between">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">RECIPIENT</label>
 {friends.length > 0 && (
 <button data-testid="add-transaction-friends"
 type="button"
 onClick={() => setShowTransferFriendPicker(p => !p)}
 className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-lg uppercase tracking-wide"
 >
 <Users size={11} /> FRIENDS
 </button>
 )}
 </div>

 {/* Friends quick-pick chips */}
 {showTransferFriendPicker && friends.length > 0 && (
 <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-100 animate-in zoom-in-95 duration-200">
 <p className="text-[10px] sm:text-[11px] font-bold text-violet-500 uppercase tracking-wider mb-2">Tap to select</p>
 <div className="flex flex-wrap gap-2">
 {friends.map(f => (
 <button data-testid={`add-transaction-button-9-${f.id}`}
 key={f.id}
 type="button"
 onClick={() => {
 setTransferRecipient(f.name);
 setShowTransferFriendPicker(false);
 }}
 className={cn(
 'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border',
 transferRecipient === f.name
 ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
 : 'bg-white border-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white'
 )}
 >
 {f.name}
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Name / UPI input */}
 <div className="relative">
 <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
 <input
 type="text"
 value={transferRecipient}
 onChange={e => setTransferRecipient(e.target.value)}
 aria-label="Recipient name or UPI"
 data-testid="transaction-recipient-input"
 className="w-full h-10 sm:h-11 bg-slate-50 hover:bg-slate-100/60 border border-slate-200/90 rounded-xl pl-9 pr-3 font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal text-xs sm:text-sm placeholder:text-xs sm:placeholder:text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
 placeholder="Name / UPI / Account"
 />
 {transferRecipient && (
 <button
 type="button"
 title="Clear recipient"
 onClick={() => setTransferRecipient('')}
 data-testid="transaction-recipient-clear-button"
 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
 >
 <X size={13} strokeWidth={3} />
 </button>
 )}
 </div>
 </div>
 </div>
 )}

 <div className="space-y-2">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">
 {isWithdrawal || isTransfer ? 'Transfer Date' : 'Date'}
 </label>
 <div data-testid="add-transaction-div-4" className="relative group" onClick={(e) => {
 const input = e.currentTarget.querySelector('input');
 if (input) (input as any).showPicker();
 }}>
 <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors z-10" size={14} />
 <div className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-3 font-semibold text-xs sm:text-sm text-slate-900 group-hover:bg-slate-100/50 group-hover:border-slate-300 transition-all flex items-center h-10 sm:h-11">
 {(() => {
 if (!formData.date) return 'Select Date';
 const date = new Date(formData.date);
 const day = String(date.getDate()).padStart(2, '0');
 const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
 })()}
 </div>
 <input
 type="date"
 value={formData.date}
 onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
 aria-label="Transaction date"
 data-testid="transaction-date-input"
 className="absolute inset-0 opacity-0 cursor-pointer z-20"
 />
 </div>
 </div>

 <div className="space-y-1.5 sm:space-y-2">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reason / Notes</label>
 <input
 type="text"
 value={formData.notes}
 onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
 aria-label="Notes"
 data-testid="transaction-notes-textarea"
 className="w-full h-10 sm:h-11 bg-slate-50 hover:bg-slate-100/60 border border-slate-200/90 rounded-xl px-3 sm:px-3.5 font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal text-xs sm:text-sm placeholder:text-xs sm:placeholder:text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
 placeholder="ATM Withdrawal / Friend Transfer / etc..."
 />
 </div>
 </div>
 {/* Receipt Section */}
 <div className="premium-glass-card p-4 space-y-3">
 <div className="flex items-center justify-between">
 <label className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider">Receipt</label>
 {(scanDocumentId || attachmentDocumentId) && (
 <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-wide">
 <Check size={10} strokeWidth={3} /> Attached
 </span>
 )}
 </div>

  {/* No receipt attached yet */}
  {!scanDocumentId && !attachmentDocumentId && (
  <div className="grid grid-cols-2 gap-3">
    <button
      type="button"
      onClick={() => { setScannerMode('scan'); setShowScanner(true); }}
      data-testid="transaction-scan-receipt-button"
      disabled={!isOcrEnabled}
      className={cn(
        "flex flex-col items-center gap-2 p-4 rounded-2xl active:scale-[0.97] transition-all shadow-lg",
        isOcrEnabled 
          ? "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200" 
          : "bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed"
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center",
        isOcrEnabled ? "bg-white/10" : "bg-slate-200"
      )}>
        <ScanLine size={18} />
      </div>
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-wide leading-none">Scan Receipt</p>
        <p className={cn("text-[9px] font-semibold mt-0.5 leading-none", isOcrEnabled ? "text-white/40" : "text-slate-400/60")}>OCR auto-fill</p>
      </div>
    </button>

    <button
      type="button"
      onClick={() => { setScannerMode('attachment'); setShowScanner(true); }}
      data-testid="transaction-add-attachment-button"
      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-50 text-slate-900 hover:bg-slate-100 active:scale-[0.97] transition-all border border-slate-100 cursor-pointer"
    >
      <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center">
        <Paperclip size={18} className="text-slate-600" />
      </div>
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-wide leading-none">Add Attachment</p>
      </div>
    </button>
  </div>
  )}

  {/* Receipt attached show summary + remove option */}
  {(scanDocumentId || attachmentDocumentId) && (
    <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
      {scanDocumentId ? (
        <ScanLine size={16} className="text-emerald-600 shrink-0" />
      ) : (
        <Paperclip size={16} className="text-emerald-600 shrink-0" />
      )}
      <div className="flex-1">
        <p className="text-[10px] font-black text-emerald-700 uppercase">
          {scanDocumentId ? 'Scanned Receipt' : 'Attachment'}
        </p>
        <p className="text-[9px] font-semibold text-emerald-500">
          {scanDocumentId ? 'Data was auto-extracted by OCR' : 'Saved as proof no OCR'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => { setScanDocumentId(null); setAttachmentDocumentId(null); }}
        data-testid="transaction-remove-attachment-button"
        className="p-1.5 text-emerald-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
        title="Remove attachment"
      >
        <X size={13} strokeWidth={3} />
      </button>
    </div>
  )}
  </div>
  </div>
  </main>

  {/* Floating Balance Error Modal */}
  {balanceError && (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => setBalanceError(null)}
      data-testid="insufficient-balance-modal"
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl shrink-0"><AlertTriangle size={22} /></div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">Insufficient Balance</h3>
        </div>
        <p className="text-sm font-medium text-slate-600 mb-4 leading-relaxed">
          You don&apos;t have enough balance in <span className="font-bold text-slate-900">{balanceError.accountName}</span>.
        </p>
        <div className="space-y-2.5 mb-4 bg-slate-50 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Available Balance</span>
            <span className="text-sm font-black text-slate-900">{formatCurrencyAmount(balanceError.available, balanceError.currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Entered Amount</span>
            <span className="text-sm font-black text-rose-600">{formatCurrencyAmount(balanceError.entered, balanceError.currency)}</span>
          </div>
        </div>
        <p className="text-xs font-medium text-slate-400 mb-5 leading-relaxed">
          Please enter an amount less than or equal to your available balance.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setBalanceError(null)}
            className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="insufficient-balance-edit-button"
            onClick={() => setBalanceError(null)}
            className="flex-1 py-3 rounded-2xl bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest hover:bg-slate-800 transition-all cursor-pointer"
          >
            Edit Amount
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Possible Duplicate Transaction Confirmation Dialog */}
  {pendingDuplicate && (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => pendingDuplicate.resolve(false)}
      data-testid="duplicate-transaction-modal"
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl shrink-0">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Possible Duplicate</h3>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">A similar transaction already exists</p>
          </div>
        </div>

        {/* Existing transaction preview */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4 space-y-2">
          <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Existing Transaction</p>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Category</span>
            <span className="text-xs font-black text-slate-900">{pendingDuplicate.existingTx.category}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Amount</span>
            <span className="text-xs font-black text-slate-900">{formatCurrencyAmount(pendingDuplicate.existingTx.amount, pendingDuplicate.existingTx.currency || currency || 'INR')}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Date</span>
            <span className="text-xs font-black text-slate-900">{new Date(pendingDuplicate.existingTx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          {pendingDuplicate.existingTx.description && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600 shrink-0">Note</span>
              <span className="text-xs font-black text-slate-900 text-right truncate max-w-[160px]">{pendingDuplicate.existingTx.description}</span>
            </div>
          )}
        </div>

        <p className="text-xs font-medium text-slate-500 mb-5 leading-relaxed">
          Are you sure you want to create another transaction with the same amount and category on this date? This could be an accidental duplicate.
        </p>

        <div className="flex gap-3">
          <button
            data-testid="duplicate-modal-cancel"
            type="button"
            onClick={() => pendingDuplicate.resolve(false)}
            className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            data-testid="duplicate-modal-confirm"
            type="button"
            onClick={() => pendingDuplicate.resolve(true)}
            className="flex-1 py-3 rounded-2xl bg-amber-500 text-white font-black text-[11px] uppercase tracking-widest hover:bg-amber-600 transition-all cursor-pointer"
          >
            Create Anyway
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Receipt Scanner */}
  {showScanner && (
    <ReceiptScanner
      isOpen={showScanner}
      onClose={() => { setShowScanner(false); setScannerMode(null); }}
      onApplyScan={(scan) => {
        handleScanApply(scan);
        setShowScanner(false);
        setScannerMode(null);
      }}
      onAttachmentSaved={(docId) => {
        setAttachmentDocumentId(docId);
        setShowScanner(false);
        setScannerMode(null);
      }}
      initialMode={scannerMode}
    />
  )}

  {/* Quick Add Custom Category Modal */}
  {showAddCategoryModal && (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => setShowAddCategoryModal(false)}
      data-testid="add-custom-category-modal"
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Tag size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">New Category</h3>
              <p className="text-[10px] text-slate-400 font-medium">Add a custom {formData.type} category</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddCategoryModal(false)}
            className="p-1 rounded-full text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Category Name</label>
            <input
              type="text"
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Street Food, Pani Puri, Books..."
              className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 sm:px-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal placeholder:text-xs sm:placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateCustomCategory();
                }
              }}
            />
          </div>

          <div>
            <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Color Tag</label>
            <div className="flex items-center gap-2">
              {['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#14B8A6'].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCatColor(color)}
                  className={cn(
                    "w-6 h-6 rounded-full transition-transform cursor-pointer",
                    newCatColor === color ? "scale-125 ring-2 ring-slate-900 ring-offset-2 shadow-xs" : "hover:scale-110 opacity-80 hover:opacity-100"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setShowAddCategoryModal(false)}
            className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreateCustomCategory()}
            disabled={isCreatingCategory || !newCatName.trim()}
            className="flex-1 py-2.5 text-xs font-black uppercase text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-200 disabled:opacity-50 cursor-pointer"
          >
            {isCreatingCategory ? 'Saving...' : 'Add Category'}
          </button>
        </div>
      </div>
    </div>
  )}

    <FloatingSaveBar
      onSave={handleSubmit}
      onDiscard={() => { clearQuickStorage(); setCurrentPage(returnPage); }}
      isSaving={isSubmitting}
      saveLabel="Save Transaction"
    />
      </div>
    </CenteredLayout>
  );
}
