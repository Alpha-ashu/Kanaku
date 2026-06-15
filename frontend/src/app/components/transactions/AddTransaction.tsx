import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useAICapability } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';
import { applyTransactionAccountImpact } from '@/lib/transactionAggregation';
import { DocumentManagementService } from '@/services/documentManagementService';
import { backendService } from '@/lib/backend-api';
import {
 ChevronLeft, ArrowDownLeft, ArrowDownRight, Camera,
 CalendarDays, Wallet, Tag, AlignLeft, Store, Sparkles,
 CreditCard, Banknote, Smartphone,
 Zap, ChevronDown, Search, Check, Users, UserPlus, Mail, Phone, Trash2,
 Plus, Loader2, ArrowRightLeft, Menu, ArrowDown, Info, HelpCircle, Settings, ArrowLeft,
 ArrowUp, User, X, ScanLine, Paperclip, ArrowUpRight
} from 'lucide-react';

import { toast } from 'sonner';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import {
 EXPENSE_CATEGORIES,
 INCOME_CATEGORIES,
 normalizeCategorySelection,
} from '@/lib/expenseCategories';
import { ReceiptScanner, type ReceiptScanPayload } from '@/app/components/transactions/ReceiptScanner';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';

import '@/styles/premium-transactions.css';
import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';

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
}

// --- Constants & Helpers ---
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
 <button
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
  aiSuggested
}: {
  type: 'expense' | 'income',
  selectedCategory: string,
  onSelect: (cat: string) => void,
  aiSuggested?: string
}) => {
  const categories = type === 'expense' ? BUILTIN_CATEGORIES.expense : BUILTIN_CATEGORIES.income;
  const [activePage, setActivePage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset active page when tab category type changes
  useEffect(() => {
    setActivePage(0);
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
  }, [type]);

  const itemsPerPage = 8;
  const pages = useMemo(() => {
    const chunked: string[][] = [];
    for (let i = 0; i < categories.length; i += itemsPerPage) {
      chunked.push(categories.slice(i, i + itemsPerPage));
    }
    return chunked;
  }, [categories]);

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
            className="w-full shrink-0 snap-align-start grid grid-cols-4 grid-rows-2 gap-2"
          >
            {pageItems.map(cat => (
              <div
                key={cat}
                onClick={() => onSelect(cat)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all cursor-pointer group",
                  selectedCategory === cat ? "bg-indigo-600 shadow-lg shadow-indigo-200" : "bg-slate-50 hover:bg-slate-100",
                  aiSuggested === cat && !selectedCategory && "ring-2 ring-indigo-400 ring-offset-2 animate-pulse"
                )}
              >
                <div className={cn("w-8 h-8 flex items-center justify-center rounded-lg transition-colors", selectedCategory === cat ? "bg-white/20" : "bg-white group-hover:bg-slate-50")}>
                  {getCategoryCartoonIcon(cat, 20)}
                </div>
                <span className={cn("text-[9px] font-black uppercase tracking-tight text-center leading-none truncate w-full px-0.5", selectedCategory === cat ? "text-white" : "text-slate-500")}>
                  {cat.split(' ')[0]}
                </span>
              </div>
            ))}
            {/* Pad the last page if it doesn't have 8 items to preserve the grid structure and spacing */}
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
            <button
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
 };

 const [isSubmitting, setIsSubmitting] = useState(false);
 const [showScanner, setShowScanner] = useState(false);
 const [scannerMode, setScannerMode] = useState<'scan' | 'attachment' | null>(null);
 const [scanDocumentId, setScanDocumentId] = useState<number | null>(null);
 const [attachmentDocumentId, setAttachmentDocumentId] = useState<number | null>(null);
 const [amountStr, setAmountStr] = useState('');
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
 (expenseMode === 'individual' && isExpense) || 
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

 // Add participant from friends list or as new temp person
 const addParticipantFromFriend = async (name: string) => {
 if (groupParticipants.some(p => p.name.toLowerCase() === name.toLowerCase())) return;
 await saveNewFriend(name);
 setGroupParticipants(prev => [...prev, createEmptyParticipant({ name })]);
 setShowFriendPicker(false);
 };

 const confirmNewSplitPerson = async () => {
 const name = newPersonName.trim();
 if (!name) return;
 await addParticipantFromFriend(name);
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

  const handleSubmit = async () => {
    if (!selectedAccount) { toast.error('Select an account'); return; }
    if (!formData.amount || formData.amount <= 0) { toast.error('Enter amount'); return; }

    setIsSubmitting(true);
    try {
      const tenSecondsAgo = new Date(Date.now() - 10000);
      const duplicates = await db.transactions
        .filter(t => 
          t.accountId === formData.accountId &&
          t.type === formData.type &&
          t.amount === formData.amount &&
          t.description === formData.description &&
          !!t.createdAt && new Date(t.createdAt).getTime() > tenSecondsAgo.getTime() &&
          !t.deletedAt
        )
        .toArray();

      if (duplicates.length > 0) {
        toast.error('This transaction was recently saved. Duplicate prevented.');
        setIsSubmitting(false);
        return;
      }

      const now = new Date();
      const transactionDate = parseDateInputValue(formData.date) || new Date();
      let result: any;

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
 });

 await applyTransactionAccountImpact(result, now);
 } else {
 let payload: any = {
 ...formData,
 category: normalizeCategorySelection(formData.category, formData.type as 'expense' | 'income'),
 date: transactionDate,
 expenseMode: isExpense ? expenseMode : undefined,
 updatedAt: now,
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
 await applyTransactionAccountImpact(result, now);

 // Create GroupExpense record so it appears in the Groups page 
 if (isExpense && expenseMode === 'group' && result?.id && groupParticipants.length > 0) {
 const perHead = formData.amount / (groupParticipants.length + 1); // +1 for current user
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
 // Each participant
 ...groupParticipants.map((p) => ({
 name: p.name,
 share: p.share && p.share > 0 ? p.share : perHead,
 paid: false,
 isCurrentUser: false,
 paidAmount: 0,
 paymentStatus: 'pending' as const,
 friendId: friends.find((f) => f.name.toLowerCase() === p.name.toLowerCase())?.id,
 })),
 ];

 const groupExpenseId = await db.groupExpenses.add({
 name: formData.description || formData.category || 'Group Expense',
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
 });

 // Back-link: store groupExpenseId on the transaction
 await db.transactions.update(result.id, {
 groupExpenseId: groupExpenseId as number,
 groupName: formData.description || formData.category || 'Group Expense',
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
 }

 toast.success('Transaction saved');
 clearQuickStorage();
 refreshData();
 setCurrentPage(returnPage);
 } catch (err) {
 toast.error('Failed to save');
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
 <div className="flex flex-col min-h-screen bg-white">

 {/* Header */}
 <header className="bg-white border-b border-slate-100 sticky top-0 z-30">

 {/* Row 1: Back + Title + Save */}
 <div className="flex items-center justify-between px-4 lg:px-6 py-3 h-14">
 <div className="flex items-center gap-2 min-w-0">
 <button
 onClick={() => { clearQuickStorage(); setCurrentPage(returnPage); }}
 title="Back"
 className="p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all shrink-0"
 >
 <ArrowLeft size={18} />
 </button>
 <h1 className="text-base font-black text-slate-900 tracking-tight leading-none uppercase">Add Transaction</h1>
 </div>
 <button
 onClick={handleSubmit}
 disabled={isSubmitting || !formData.amount}
 className="bg-slate-400 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
 >
 {isSubmitting ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
 Save
 </button>
 </div>

 {/* Row 2: Type Tabs full width pill */}
 <div className="px-4 lg:px-6 pb-3">
 <div className="flex items-center bg-slate-100 rounded-2xl p-1 gap-0.5">
 {([
 { id: 'expense', label: 'Expense', icon: <ArrowUpRight size={13} /> },
 { id: 'income', label: 'Income', icon: <ArrowDownLeft size={13} /> },
 { id: 'transfer', label: 'Transfer', icon: <ArrowRightLeft size={13} /> },
 ] as { id: TransactionType; label: string; icon: React.ReactNode }[]).map(tab => (
 <button
 key={tab.id}
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
 className={cn(
 'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all',
 formData.type === tab.id
 ? 'bg-slate-900 text-white shadow-sm'
 : 'text-slate-400 hover:text-slate-600'
 )}
 >
 {tab.icon}
 {tab.label}
 </button>
 ))}
 </div>
 </div>

 </header>

 {/* Main Single-Page Content Area */}
 <main className="flex-1 p-3 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 overflow-y-auto pb-32 lg:pb-6 no-scrollbar">

 {/* Left Column: Context & categorization (lg:col-7) */}
 <div className="lg:col-span-7 flex flex-col gap-4">

 {/* Sub-mode Selection for Expense/Transfer */}
 {(isExpense || isTransfer) && (
 <div className="premium-glass-card p-1 flex gap-1">
 {isExpense ? [
 { id: 'individual', label: 'Individual', icon: <Tag size={12} /> },
 { id: 'group', label: 'Split', icon: <Users size={12} /> },
 { id: 'loan', label: 'Loan', icon: <Banknote size={12} /> }
 ].map(m => (
 <button key={m.id} onClick={() => setExpenseMode(m.id as any)} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-black text-[8px] uppercase tracking-wider transition-all", expenseMode === m.id ?"bg-white text-slate-900 shadow-sm" :"text-slate-400 hover:text-slate-600")}>
 {m.icon} {m.label}
 </button>
 )) : [
 { id: 'self', label: 'Self', icon: <Wallet size={12} /> },
 { id: 'others', label: 'Others', icon: <UserPlus size={12} /> }
 ].map(m => (
 <button key={m.id} onClick={() => setTransferSubType(m.id as any)} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-black text-[8px] uppercase tracking-wider transition-all", transferSubType === m.id ?"bg-white text-slate-900 shadow-sm" :"text-slate-400 hover:text-slate-600")}>
 {m.icon} {m.label}
 </button>
 ))}
 </div>
 )}

 {/* Transfer Method: Bank / Cash */}
 {isTransfer && (
 <div className="premium-glass-card p-1 flex gap-1 animate-in fade-in zoom-in-95 duration-200">
 {([
 { id: 'bank', label: 'Bank Transfer', icon: <CreditCard size={12} /> },
 { id: 'cash', label: 'Cash Transfer', icon: <Banknote size={12} /> },
 ] as { id: 'bank' | 'cash'; label: string; icon: React.ReactNode }[]).map(m => (
 <button
 key={m.id}
 onClick={() => setTransferMethod(m.id)}
 className={cn(
 'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-black text-[8px] uppercase tracking-wider transition-all',
 transferMethod === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
 )}
 >
 {m.icon} {m.label}
 </button>
 ))}
 </div>
 )}

 {/* Intelligent Summary - Moved for higher visibility */}
 <div className="p-4 bg-slate-900 rounded-2xl text-white flex items-center justify-between shadow-xl">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Info size={16} className="text-indigo-400" /></div>
 <div>
 <p className="text-[8px] font-black text-white/40 uppercase">Summary</p>
 <p className="text-[10px] font-black truncate max-w-[120px]">{formData.description || formData.category}</p>
 </div>
 </div>
 <div className="text-right">
 <p className="text-[8px] font-black text-white/40 uppercase">Final Amount</p>
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
 <button key={t} type="button" onClick={() => setLoanType(t as any)} className={cn("flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", loanType === t ?"bg-slate-900 text-white shadow-md" :"text-slate-400 hover:text-slate-600")}>
 {t === 'borrowed' ? 'Borrowed' : 'Lent'}
 </button>
 ))}
 </div>
 </div>
 )}
 {expenseMode === 'loan' && (
 <div className="col-span-1 sm:col-span-2 space-y-2">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Loan Category</label>
 <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
 {(loanType === 'borrowed'
 ? ['Consumer Loan', 'Personal Loan', 'Home Loan', 'Vehicle Loan', 'Education Loan', 'Credit Card', 'Overdraft', 'Others']
 : ['Personal / Friend', 'Business', 'Others']
 ).map(cat => (
 <button
 key={cat}
 type="button"
 onClick={() => {
 setLoanDraft(prev => ({ ...prev, category: cat }));
 setFormData(prev => ({ ...prev, category: cat }));
 }}
 className={cn("px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border", (loanDraft.category === cat || formData.category === cat) ? (loanType === 'borrowed' ?"bg-indigo-50 border-indigo-200 text-indigo-700" :"bg-emerald-50 border-emerald-200 text-emerald-700") :"bg-white border-slate-100 text-slate-600 hover:bg-slate-50")}
 >
 {cat}
 </button>
 ))}
 </div>
 </div>
 )}
 <div className="col-span-1 sm:col-span-2 space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Description / Reason</label>
 <div className="relative">
 <AlignLeft className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input type="text" value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} aria-label="Description" className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20" placeholder=" Loan EMI / Friends / ATM Withdrawal" />
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
 <p className="text-[9px] font-black text-indigo-600 uppercase">AI Detected Category</p>
 <p className="text-xs font-bold text-slate-700">{remoteCategorySuggestion.category} ({(remoteCategorySuggestion.confidence * 100).toFixed(0)}% confident)</p>
 </div>
 </div>
 )}

 {/* Unified Category Selector */}
 {!isTransfer && expenseMode !== 'loan' && (
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Select Category</label>
 <span className="text-[9px] font-bold text-indigo-500">Auto-Categorization Active</span>
 </div>
 <CategoryGrid
 type={formData.type === 'income' ? 'income' : 'expense'}
 selectedCategory={formData.category}
 onSelect={cat => { setManualExpenseCategory(true); setFormData(prev => ({ ...prev, category: cat, subcategory: '' })); }}
 aiSuggested={remoteCategorySuggestion?.category}
 />
 </div>
 )}
 </div>

 {/* Person / Participants Section - NEW Dedicated Card */}
 {showPersonCard && (
 <div className="premium-glass-card p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
 <div className="flex items-center justify-between">
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
 {expenseMode === 'group' ? `Participants (${groupParticipants.length})` : 
 expenseMode === 'loan' ? 'Counterparty' : 'Who? / Person'}
 </label>
 
 <div className="flex gap-2">
 {friends.length > 0 && (
 <button
 type="button"
 onClick={() => { setShowFriendPicker(p => !p); setShowNewPersonInput(false); }}
 className="flex items-center gap-1 text-[9px] font-black text-violet-600 bg-violet-50 px-2.5 py-1.5 rounded-lg uppercase tracking-wide"
 >
 <Users size={11} /> Friends
 </button>
 )}
 <button
 type="button"
 onClick={() => { setShowNewPersonInput(p => !p); setShowFriendPicker(false); }}
 className="flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg uppercase tracking-wide"
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
 className="w-full flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 font-bold text-xs text-slate-700 hover:bg-slate-100 transition-all"
 >
 <div className="flex items-center gap-2">
 {formData.payee || loanDraft.contactName ? (
 <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white uppercase">
 {(formData.payee || loanDraft.contactName)[0]}
 </div>
 ) : (
 <User size={14} className="text-slate-400" />
 )}
 <span className={formData.payee || loanDraft.contactName ? 'text-slate-900' : 'text-slate-300'}>
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
 <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-100 animate-in zoom-in-95 duration-200">
 <p className="text-[8px] font-black text-violet-400 uppercase tracking-widest mb-2">Tap to select</p>
 <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
 {friends.map(f => {
 const isSelected = expenseMode === 'group' 
 ? groupParticipants.some(p => p.name.toLowerCase() === f.name.toLowerCase())
 : (formData.payee === f.name || loanDraft.contactName === f.name);
 
 return (
 <button
 key={f.id}
 type="button"
 onClick={() => {
 if (expenseMode === 'group') {
 if (!isSelected) addParticipantFromFriend(f.name);
 } else {
 setFormData(prev => ({ ...prev, payee: f.name }));
 setLoanDraft(prev => ({ ...prev, contactName: f.name }));
 setShowFriendPicker(false);
 }
 }}
 className={cn(
"px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all border",
 isSelected
 ?"bg-indigo-600 border-indigo-600 text-white shadow-md"
 :"bg-white border-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white"
 )}
 >
 {f.name}
 </button>
 );
 })}
 </div>
 </div>
 )}

 {/* New Person Input */}
 {showNewPersonInput && (
 <div className="flex items-center gap-2 p-2.5 bg-indigo-50/60 rounded-xl border border-indigo-100 animate-in slide-in-from-top-2">
 <UserPlus size={14} className="text-indigo-400 shrink-0" />
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
 className="flex-1 bg-transparent border-none p-0 text-xs font-bold text-slate-900 focus:ring-0 placeholder:text-slate-300"
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
 className="p-1.5 bg-indigo-600 text-white rounded-lg"
 >
 <Check size={12} strokeWidth={3} />
 </button>
 </div>
 )}

 {/* Split Mode: Participant List Display */}
 {expenseMode === 'group' && (
 <div className="space-y-2">
 {groupParticipants.length === 0 ? (
 <p className="text-[10px] font-bold text-slate-300 text-center py-2">No participants added</p>
 ) : (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-1">
 {groupParticipants.map(p => (
 <div key={p.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100 group">
 <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-black text-indigo-600 uppercase">{p.name?.[0] || '?'}</div>
 <input
 type="text"
 value={p.name}
 onChange={e => setGroupParticipants(prev => prev.map(i => i.id === p.id ? { ...i, name: e.target.value } : i))}
 aria-label="Participant name"
 className="flex-1 bg-transparent border-none p-0 text-xs font-bold text-slate-900 focus:ring-0"
 />
 <button
 type="button"
 title="Remove participant"
 onClick={() => setGroupParticipants(prev => prev.filter(i => i.id !== p.id))}
 className="p-1 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
 >
 <Trash2 size={12} strokeWidth={3} />
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 )}

 {/* Additional Loan Meta Card */}
 {isExpense && expenseMode === 'loan' && (
 <div className="premium-glass-card p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
 {loanType === 'borrowed' ? (
 <div className="space-y-4">
 {['Consumer Loan', 'Personal Loan', 'Home Loan', 'Vehicle Loan', 'Education Loan', 'Credit Card', 'Overdraft'].includes(loanDraft.category) ? (
 <div className="space-y-2">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Loan Provider</label>
 <SearchableDropdown
 options={loanProviderOptions}
 value={loanDraft.bankName}
 onChange={handleBankChange}
 placeholder="Select Bank/NBFC"
 allowCustom={true}
 className="bg-slate-50 border-none rounded-xl h-10 font-bold text-xs"
 />
 </div>
 ) : (
 <div className="space-y-2">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Counterparty</label>
 <div className="relative">
 <button type="button" onClick={() => setShowLoanFriendPicker(p => !p)} className="w-full flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 font-bold text-xs text-slate-700 hover:bg-slate-100 transition-all">
 <span className={loanDraft.contactName ? 'text-slate-900' : 'text-slate-300'}>{loanDraft.contactName || 'Who?'}</span>
 <ChevronDown size={12} className="text-slate-400" />
 </button>
 {showLoanFriendPicker && (
 <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
 {friends.length > 0 && (
 <div className="p-2 max-h-[150px] overflow-y-auto">
 {friends.map(f => (
 <button key={f.id} type="button" onClick={() => { setLoanDraft(prev => ({ ...prev, contactName: f.name })); setShowLoanFriendPicker(false); }} className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold text-left transition-all", loanDraft.contactName === f.name ?"bg-indigo-50 text-indigo-700" :"hover:bg-slate-50 text-slate-700")}>
 <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase">{f.name[0]}</div>
 {f.name}
 </button>
 ))}
 </div>
 )}
 {friends.length > 0 && <div className="border-t border-slate-100" />}
 <div className="p-2">
 {showNewLoanPersonInput ? (
 <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg">
 <input type="text" value={newLoanPersonName} onChange={e => setNewLoanPersonName(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmNewLoanPerson()} className="flex-1 bg-transparent border-none p-0 text-xs font-bold text-slate-900 focus:ring-0 placeholder:text-slate-300" placeholder="Enter name" autoFocus />
 <button type="button" title="Confirm" onClick={confirmNewLoanPerson} className="p-1 bg-indigo-600 text-white rounded-md"><Check size={11} strokeWidth={3} /></button>
 <button type="button" title="Cancel" onClick={() => { setShowNewLoanPersonInput(false); setNewLoanPersonName(''); }} className="p-1 text-slate-400"><X size={11} strokeWidth={3} /></button>
 </div>
 ) : (
 <button type="button" onClick={() => setShowNewLoanPersonInput(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-all">
 <UserPlus size={13} /> Add New Person
 </button>
 )}
 </div>
 </div>
 )}
 </div>
 </div>
 )}

 {/* Institutional Loan Details - ONLY for Bank/NBFC categories */}
 {['Consumer Loan', 'Personal Loan', 'Home Loan', 'Vehicle Loan', 'Education Loan', 'Credit Card', 'Overdraft'].includes(loanDraft.category) ? (
 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Interest (%)</label>
 <input type="number" value={loanDraft.interestRate} onChange={e => setLoanDraft(prev => ({ ...prev, interestRate: parseFloat(e.target.value) || 0 }))} aria-label="Interest rate" className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-sm text-center" />
 </div>
 <div className="space-y-1">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tenure (Months)</label>
 <input type="number" value={loanDraft.tenureMonths} onChange={e => setLoanDraft(prev => ({ ...prev, tenureMonths: parseInt(e.target.value) || 0 }))} aria-label="Tenure in months" className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-sm text-center" />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">EMI Amount</label>
 <input type="number" value={loanDraft.emiAmount} onChange={e => setLoanDraft(prev => ({ ...prev, emiAmount: parseFloat(e.target.value) || 0 }))} aria-label="EMI amount" className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-sm text-center" />
 </div>
 <div className="space-y-1">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Down Payment</label>
 <input type="number" value={loanDraft.downPayment} onChange={e => setLoanDraft(prev => ({ ...prev, downPayment: parseFloat(e.target.value) || 0 }))} aria-label="Down payment" className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-sm text-center" />
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <div className="space-y-1">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Received In</label>
 <SearchableDropdown
 options={accounts.map(a => ({ value: String(a.id), label: a.name, description: formatAccountBalance(a.balance, currency) }))}
 value={String(loanDraft.receivedAccount)}
 onChange={val => {
 const accId = parseInt(val);
 setLoanDraft(prev => ({ ...prev, receivedAccount: accId }));
 setFormData(prev => ({ ...prev, accountId: accId }));
 }}
 placeholder="Select Account"
 className="bg-slate-50 border-none rounded-xl h-10 font-bold text-xs"
 />
 </div>
 <div className="space-y-1">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">EMI Deduction</label>
 <SearchableDropdown
 options={accounts.map(a => ({ value: String(a.id), label: a.name, description: formatAccountBalance(a.balance, currency) }))}
 value={String(loanDraft.emiDeductionAccount)}
 onChange={val => setLoanDraft(prev => ({ ...prev, emiDeductionAccount: parseInt(val) }))}
 placeholder="Select Account"
 className="bg-slate-50 border-none rounded-xl h-10 font-bold text-xs"
 />
 </div>
 </div>
 </div>
 ) : (
 /* Simplified Borrowed View (e.g. from Friends/Cash) */
 <div className="space-y-4">
 <div className="space-y-2">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Received Method</label>
 <div className="flex gap-2">
 {['bank', 'cash'].map((m) => (
 <button
 key={m}
 type="button"
 onClick={() => {
 const cashAcc = accounts.find(a => a.name.toLowerCase().includes('cash'));
 const accId = m === 'cash' ? (cashAcc?.id || 0) : (accounts.find(a => !a.name.toLowerCase().includes('cash'))?.id || 0);
 setLoanDraft(prev => ({ ...prev, transferMethod: m as any, receivedAccount: accId }));
 setFormData(prev => ({ ...prev, accountId: accId }));
 }}
 className={cn(
"flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border",
 loanDraft.transferMethod === m 
 ?"bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200" 
 :"bg-white border-slate-100 text-slate-400 hover:bg-slate-50"
 )}
 >
 {m === 'bank' ? 'Bank Transfer' : 'Cash'}
 </button>
 ))}
 </div>
 </div>

 {loanDraft.transferMethod === 'bank' && (
 <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Select Bank Account</label>
 <SearchableDropdown
 options={accounts.filter(a => !a.name.toLowerCase().includes('cash')).map(a => ({ value: String(a.id), label: a.name, description: formatAccountBalance(a.balance, currency) }))}
 value={String(loanDraft.receivedAccount)}
 onChange={val => {
 const accId = parseInt(val);
 setLoanDraft(prev => ({ ...prev, receivedAccount: accId }));
 setFormData(prev => ({ ...prev, accountId: accId }));
 }}
 placeholder="Select Account"
 className="bg-slate-50 border-none rounded-xl h-10 font-bold text-xs"
 />
 </div>
 )}

 {loanDraft.transferMethod === 'cash' && (
 <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
 <span className="text-[10px] font-bold text-slate-500">Crediting to:</span>
 <span className="text-[10px] font-black text-slate-900 uppercase">Cash In Hand</span>
 </div>
 )}

 <div className="space-y-2">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Return Date / Reminder</label>
 <div className="relative group" onClick={(e) => {
 const input = e.currentTarget.querySelector('input');
 if (input) (input as any).showPicker();
 }}>
 <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors z-10" size={14} />
 <div className="w-full bg-slate-50 border border-transparent rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs text-slate-900 group-hover:bg-slate-100/50 group-hover:border-slate-200 transition-all flex items-center h-10">
 {(() => {
 if (!loanDraft.dueDate) return 'Set Date';
 const date = new Date(loanDraft.dueDate);
 const day = String(date.getDate()).padStart(2, '0');
 const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
 })()}
 </div>
 <input
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
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lent From</label>
 <SearchableDropdown
 options={accounts.map(a => ({ value: String(a.id), label: a.name, description: formatAccountBalance(a.balance, currency) }))}
 value={String(loanDraft.receivedAccount)}
 onChange={val => {
 const accId = parseInt(val);
 setLoanDraft(prev => ({ ...prev, receivedAccount: accId }));
 setFormData(prev => ({ ...prev, accountId: accId }));
 }}
 placeholder="Select Account"
 className="bg-slate-50 border-none rounded-xl h-10 font-bold text-xs"
 />
 </div>
 <div className="space-y-2">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Due Date</label>
 <div className="relative group" onClick={(e) => {
 const input = e.currentTarget.querySelector('input');
 if (input) (input as any).showPicker();
 }}>
 <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors z-10" size={14} />
 <div className="w-full bg-slate-50 border border-transparent rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs text-slate-900 group-hover:bg-slate-100/50 group-hover:border-slate-200 transition-all flex items-center h-10">
 {(() => {
 if (!loanDraft.dueDate) return 'Select Due Date';
 const date = new Date(loanDraft.dueDate);
 const day = String(date.getDate()).padStart(2, '0');
 const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
 })()}
 </div>
 <input
 type="date"
 value={loanDraft.dueDate}
 onChange={e => setLoanDraft(prev => ({ ...prev, dueDate: e.target.value }))}
 aria-label="Due date"
 className="absolute inset-0 opacity-0 cursor-pointer z-20"
 />
 </div>
 </div>
 </div>
 <div className="space-y-1">
 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Counterparty</label>
 <div className="relative">
 <button type="button" onClick={() => setShowLoanFriendPicker(p => !p)} className="w-full flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 font-bold text-xs text-slate-700 hover:bg-slate-100 transition-all">
 <span className={loanDraft.contactName ? 'text-slate-900' : 'text-slate-300'}>{loanDraft.contactName || 'Who?'}</span>
 <ChevronDown size={12} className="text-slate-400" />
 </button>
 {showLoanFriendPicker && (
 <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2">
 {friends.length > 0 && (
 <div className="p-2 max-h-[150px] overflow-y-auto">
 {friends.map(f => (
 <button key={f.id} type="button" onClick={() => { setLoanDraft(prev => ({ ...prev, contactName: f.name })); setShowLoanFriendPicker(false); }} className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold text-left transition-all", loanDraft.contactName === f.name ?"bg-indigo-50 text-indigo-700" :"hover:bg-slate-50 text-slate-700")}>
 <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase">{f.name[0]}</div>
 {f.name}
 </button>
 ))}
 </div>
 )}
 {friends.length > 0 && <div className="border-t border-slate-100" />}
 <div className="p-2">
 {showNewLoanPersonInput ? (
 <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg">
 <input type="text" value={newLoanPersonName} onChange={e => setNewLoanPersonName(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmNewLoanPerson()} className="flex-1 bg-transparent border-none p-0 text-xs font-bold text-slate-900 focus:ring-0 placeholder:text-slate-300" placeholder="Enter name" autoFocus />
 <button type="button" title="Confirm" onClick={confirmNewLoanPerson} className="p-1 bg-indigo-600 text-white rounded-md"><Check size={11} strokeWidth={3} /></button>
 <button type="button" title="Cancel" onClick={() => { setShowNewLoanPersonInput(false); setNewLoanPersonName(''); }} className="p-1 text-slate-400"><X size={11} strokeWidth={3} /></button>
 </div>
 ) : (
 <button type="button" onClick={() => setShowNewLoanPersonInput(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-all">
 <UserPlus size={13} /> Add New Person
 </button>
 )}
 </div>
 </div>
 )}
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
 <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Transaction Amount</span>

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
 onChange={e => { setAmountStr(e.target.value); setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 })); }}
 aria-label="Transaction amount"
 className="bg-transparent text-4xl min-[400px]:text-5xl sm:text-6xl font-black text-slate-900 outline-none w-full text-center tracking-tighter placeholder:text-slate-100 p-0 m-0"
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
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
 {isWithdrawal ? 'Withdraw From Account' : isTransfer ? 'From Account' : 'Account'}
 </label>
 <SearchableDropdown
 options={accounts.map(a => ({
 value: String(a.id),
 label: a.name,
 description: formatAccountBalance(a.balance, currency),
 icon: <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 font-black text-[8px]">{(a.type || 'BK').substring(0, 2).toUpperCase()}</div>
 }))}
 value={String(formData.accountId)}
 onChange={val => setFormData(prev => ({ ...prev, accountId: parseInt(val) }))}
 placeholder="Account"
 triggerClassName="h-12 border-none bg-slate-50 font-bold text-xs shadow-none"
 />
 </div>

 {/* To Account Bank Transfer: self */}
 {isTransfer && transferSubType === 'self' && transferMethod === 'bank' && (
 <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
 <div className="flex justify-center"><ArrowDown size={14} className="text-slate-300" /></div>
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">To Account</label>
 <SearchableDropdown
 options={accounts.filter(a => a.id !== formData.accountId).map(a => ({
 value: String(a.id),
 label: a.name,
 description: formatAccountBalance(a.balance, currency),
 icon: <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-400 font-black text-[9px]">{(a.type || 'BK').substring(0, 2).toUpperCase()}</div>
 }))}
 value={String(formData.toAccountId)}
 onChange={val => setFormData(prev => ({ ...prev, toAccountId: parseInt(val) }))}
 placeholder="Destination Account"
 triggerClassName="h-12 border-none bg-slate-50 font-bold text-sm shadow-none"
 />
 </div>
 )}

 {/* Cash Transfer: self show info banner, no To Account needed */}
 {isTransfer && transferSubType === 'self' && transferMethod === 'cash' && (
 <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl animate-in fade-in duration-200">
 <Banknote size={16} className="text-amber-500 shrink-0" />
 <p className="text-[10px] font-bold text-amber-700">
 Cash handed over directly no destination account needed.
 </p>
 </div>
 )}

 {/* Withdrawal */}
 {isWithdrawal && (
 <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
 <div className="flex justify-center"><ArrowDown size={14} className="text-slate-300" /></div>
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deposit To</label>
 <SearchableDropdown
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
 triggerClassName="h-12 border-none bg-slate-50 font-bold text-sm shadow-none"
 />
 </div>
 )}

 {/* Others transfer recipient picker + name input */}
 {isTransfer && transferSubType === 'others' && (
 <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
 <div className="flex justify-center"><ArrowDown size={14} className="text-slate-300" /></div>
 <div className="flex items-center justify-between">
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recipient</label>
 {friends.length > 0 && (
 <button
 type="button"
 onClick={() => setShowTransferFriendPicker(p => !p)}
 className="flex items-center gap-1 text-[9px] font-black text-violet-600 bg-violet-50 px-2.5 py-1.5 rounded-lg uppercase tracking-wide"
 >
 <Users size={11} /> Friends
 </button>
 )}
 </div>

 {/* Friends quick-pick chips */}
 {showTransferFriendPicker && friends.length > 0 && (
 <div className="p-3 bg-violet-50/60 rounded-xl border border-violet-100 animate-in zoom-in-95 duration-200">
 <p className="text-[8px] font-black text-violet-400 uppercase tracking-widest mb-2">Tap to select</p>
 <div className="flex flex-wrap gap-2">
 {friends.map(f => (
 <button
 key={f.id}
 type="button"
 onClick={() => {
 setTransferRecipient(f.name);
 setShowTransferFriendPicker(false);
 }}
 className={cn(
 'px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all border',
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
 <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input
 type="text"
 value={transferRecipient}
 onChange={e => setTransferRecipient(e.target.value)}
 aria-label="Recipient name or UPI"
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs"
 placeholder="Name / UPI / Account"
 />
 {transferRecipient && (
 <button
 type="button"
 title="Clear recipient"
 onClick={() => setTransferRecipient('')}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-rose-500"
 >
 <X size={13} strokeWidth={3} />
 </button>
 )}
 </div>
 </div>
 )}

 <div className="space-y-2">
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
 {isWithdrawal || isTransfer ? 'Transfer Date' : 'Date'}
 </label>
 <div className="relative group" onClick={(e) => {
 const input = e.currentTarget.querySelector('input');
 if (input) (input as any).showPicker();
 }}>
 <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors z-10" size={14} />
 <div className="w-full bg-slate-50 border border-transparent rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs text-slate-900 group-hover:bg-slate-100/50 group-hover:border-slate-200 transition-all flex items-center min-h-[40px]">
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
 className="absolute inset-0 opacity-0 cursor-pointer z-20"
 />
 </div>
 </div>

 <div className="space-y-2">
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason / Notes</label>
 <textarea
 value={formData.notes}
 onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
 aria-label="Notes"
 className="w-full bg-slate-50 border-none rounded-xl p-3 font-bold text-xs min-h-[60px] resize-none"
 placeholder="ATM Withdrawal / Friend Transfer / etc..."
 />
 </div>
 </div>
 {/* Receipt Section */}
 <div className="premium-glass-card p-4 space-y-3">
 <div className="flex items-center justify-between">
 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Receipt</label>
 {(scanDocumentId || attachmentDocumentId) && (
 <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-wide">
 <Check size={10} strokeWidth={3} /> Attached
 </span>
 )}
 </div>

 {/* No receipt attached yet */}
 {!scanDocumentId && !attachmentDocumentId && (
 <div className={cn("grid gap-3", isOcrEnabled ? "grid-cols-2" : "grid-cols-1")}>
   {isOcrEnabled && (
     <button
       type="button"
       onClick={() => { setScannerMode('scan'); setShowScanner(true); }}
       className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.97] transition-all shadow-lg shadow-slate-200"
     >
       <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
         <ScanLine size={18} />
       </div>
       <div className="text-center">
         <p className="text-[10px] font-black uppercase tracking-wide leading-none">Scan Receipt</p>
         <p className="text-[9px] font-semibold text-white/40 mt-0.5 leading-none">OCR auto-fill</p>
       </div>
     </button>
   )}

   <button
     type="button"
     onClick={() => { setScannerMode('attachment'); setShowScanner(true); }}
     className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-50 text-slate-900 hover:bg-slate-100 active:scale-[0.97] transition-all border border-slate-100"
   >
     <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center">
       <Paperclip size={18} className="text-slate-600" />
     </div>
     <div className="text-center">
       <p className="text-[10px] font-black uppercase tracking-wide leading-none">Add Attachment</p>
       <p className="text-[9px] font-semibold text-slate-400 mt-0.5 leading-none">No OCR</p>
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
 className="p-1.5 text-emerald-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
 title="Remove attachment"
 >
 <X size={13} strokeWidth={3} />
 </button>
 </div>
 )}
 </div>
 </div>
 </main>

 {/* Floating Scanner Overlay */}
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
 <FloatingSaveBar
   onSave={handleSubmit}
   onDiscard={() => { clearQuickStorage(); setCurrentPage(returnPage); }}
   isSaving={isSubmitting}
   disabled={!formData.amount}
   saveLabel="Save Transaction"
 />
 </div>
 );
}
