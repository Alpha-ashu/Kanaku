import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { queueTransactionInsertSync, saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';
import { DocumentManagementService } from '@/services/documentManagementService';
import { backendService } from '@/lib/backend-api';
import { createNotificationRecord } from '@/lib/notifications';
import {
  ChevronLeft, ArrowDownLeft, ArrowUpRight, Camera,
  CalendarDays, Wallet, Tag, AlignLeft, Store, Sparkles,
  CreditCard, Banknote, Smartphone,
  Zap, ChevronDown, Search, Check, Users, UserPlus, Mail, Phone, Trash2,
  Plus, Loader2, ArrowRightLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  detectExpenseCategoryFromText,
  getCategoryForExpenseSubcategory,
  getSubcategoriesForCategory,
  loadCustomExpenseSubcategories,
  normalizeCategorySelection,
  noteExpenseSubcategoryUsage,
  saveCustomExpenseSubcategory,
  searchExpenseSubcategories,
  type CustomExpenseSubcategory,
  type ExpenseSubcategorySuggestion,
} from '@/lib/expenseCategories';
import { ReceiptScanner, type ReceiptScanPayload } from '@/app/components/ReceiptScanner';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { CategoryDropdown } from '@/app/components/ui/CategoryDropdown';
import { AutoSuggestTag } from '@/app/components/ui/AutoSuggestTag';
import { categorizeText, learnCategorization } from '@/lib/smartCategorization';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import {
  markSmsTransactionImported,
  resolvePendingSmsTransactionDraft,
} from '@/services/smsTransactionDetectionService';
import { extractGroupParticipantNames } from '@/lib/voiceExpenseParser';
import {
  takeVoiceDraft,
  VOICE_GROUP_DRAFT_KEY,
  VOICE_TRANSACTION_DRAFT_KEY,
  type VoiceGroupDraft,
  type VoiceTransactionDraft,
} from '@/lib/voiceDrafts';

const BUILTIN_CATEGORIES = {
  expense: Object.values(EXPENSE_CATEGORIES as Record<string, any>).map(cat => cat.name as string),
  income: Object.values(INCOME_CATEGORIES as Record<string, any>).map(cat => cat.name as string),
};

const DEFAULT_CATEGORY = {
  expense: BUILTIN_CATEGORIES.expense.includes('Food & Dining') ? 'Food & Dining' : BUILTIN_CATEGORIES.expense[0],
  income: BUILTIN_CATEGORIES.income.includes('Salary') ? 'Salary' : BUILTIN_CATEGORIES.income[0],
};

const accountTypeMeta: Record<string, { icon: React.FC<{ size?: number; className?: string }>; shell: string }> = {
  bank: { icon: CreditCard, shell: 'bg-blue-50 text-blue-600' },
  cash: { icon: Banknote, shell: 'bg-emerald-50 text-emerald-600' },
  wallet: { icon: Wallet, shell: 'bg-violet-50 text-violet-600' },
  upi: { icon: Smartphone, shell: 'bg-orange-50 text-orange-600' },
  credit: { icon: CreditCard, shell: 'bg-rose-50 text-rose-600' },
};

const formatAccountBalance = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v);

type ExpenseEntryMode = 'individual' | 'group' | 'loan';
type LoanEntryType = 'borrowed' | 'lent';

interface GroupParticipantDraft {
  id: string;
  friendId?: number;
  name: string;
  email: string;
  phone: string;
  share: number;
}

const createDraftId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createEmptyParticipant = (seed: Partial<GroupParticipantDraft> = {}): GroupParticipantDraft => ({
  id: createDraftId(),
  name: '',
  email: '',
  phone: '',
  share: 0,
  ...seed,
});

const roundCurrencyAmount = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLoanStatusFromDates = (dueDateInput: string, referenceDate = new Date()) => {
  const dueDate = parseDateInputValue(dueDateInput) ?? new Date(dueDateInput);
  const todayKey = toDateInputValue(referenceDate);
  const dueKey = toDateInputValue(dueDate);
  return dueKey < todayKey ? 'overdue' as const : 'active' as const;
};

interface LoanDraft {
  friendId?: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  dueDate: string;
  interestRate: number;
  notes: string;
}

const createDefaultLoanDraft = (baseDate: string): LoanDraft => ({
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  dueDate: baseDate,
  interestRate: 0,
  notes: '',
});

export function AddTransaction() {
  const { accounts, friends, transactions, setCurrentPage, currency, refreshData } = useApp();
  const { user } = useAuth();
  const defaultDateKey = toLocalDateKey(new Date()) ?? new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState(() => ({
    type: 'expense' as 'expense' | 'income' | 'transfer',
    amount: 0,
    accountId: accounts[0]?.id || 0,
    toAccountId: 0,
    category: DEFAULT_CATEGORY.expense,
    subcategory: '',
    description: '',
    merchant: '',
    date: defaultDateKey,
    taxDetails: {
      cgst: 0,
      sgst: 0,
      igst: 0,
      gstin: '',
      totalTax: 0,
    }
  }));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanDocumentId, setScanDocumentId] = useState<number | null>(null);
  const [amountStr, setAmountStr] = useState(() => '');
  const [subcategoryQuery, setSubcategoryQuery] = useState('');
  const [expenseMode, setExpenseMode] = useState<ExpenseEntryMode>(() => {
    const storedMode = localStorage.getItem('quickExpenseMode');
    return storedMode === 'group' || storedMode === 'loan' ? storedMode : 'individual';
  });
  const [loanType, setLoanType] = useState<LoanEntryType>('borrowed');
  const [loanDraft, setLoanDraft] = useState<LoanDraft>(() =>
    createDefaultLoanDraft(defaultDateKey)
  );
  const [returnPage, setReturnPage] = useState(() => localStorage.getItem('quickBackPage') || 'transactions');
  const [groupName, setGroupName] = useState('');
  const [groupSplitType, setGroupSplitType] = useState<'equal' | 'custom'>('equal');
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipantDraft[]>([]);
  const [manualExpenseCategory, setManualExpenseCategory] = useState(false);
  const [pendingSmsTransactionId, setPendingSmsTransactionId] = useState<number | null>(null);
  const [remoteCategorySuggestion, setRemoteCategorySuggestion] = useState<{
    text: string;
    category: string;
    subcategory: string;
    confidence: number;
  } | null>(null);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customExpenseSubcategories, setCustomExpenseSubcategories] = useState<CustomExpenseSubcategory[]>(() =>
    loadCustomExpenseSubcategories(),
  );

  const dbCustomCategories = useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), []) ?? [];
  const liveCategories = useMemo(() => {
    const customExpense = dbCustomCategories
      .filter((c) => c.type === 'expense' && !BUILTIN_CATEGORIES.expense.includes(c.name))
      .map((c) => c.name);
    const customIncome = dbCustomCategories
      .filter((c) => c.type === 'income' && !BUILTIN_CATEGORIES.income.includes(c.name))
      .map((c) => c.name);
    return {
      expense: [...BUILTIN_CATEGORIES.expense, ...customExpense],
      income: [...BUILTIN_CATEGORIES.income, ...customIncome],
    };
  }, [dbCustomCategories]);

  useEffect(() => {
    const rawFormType = localStorage.getItem('quickFormType');
    if (rawFormType) {
      switchType(rawFormType as any);
      localStorage.removeItem('quickFormType');
    }
  }, []);

  useEffect(() => {
    const rawVoiceTransactionDraft = takeVoiceDraft<VoiceTransactionDraft>(VOICE_TRANSACTION_DRAFT_KEY);
    if (rawVoiceTransactionDraft?.amount) {
      setFormData((prev) => ({
        ...prev,
        type: rawVoiceTransactionDraft.type,
        amount: rawVoiceTransactionDraft.amount,
        category: rawVoiceTransactionDraft.category || DEFAULT_CATEGORY[rawVoiceTransactionDraft.type],
        description: rawVoiceTransactionDraft.description,
        date: rawVoiceTransactionDraft.date || prev.date,
      }));
      setExpenseMode('individual');
      setAmountStr(String(rawVoiceTransactionDraft.amount));
    }

    const rawVoiceGroupDraft = takeVoiceDraft<VoiceGroupDraft>(VOICE_GROUP_DRAFT_KEY);
    if (rawVoiceGroupDraft?.amount) {
      const participantNames = extractGroupParticipantNames(rawVoiceGroupDraft.description || '');
      setFormData((prev) => ({
        ...prev,
        type: 'expense',
        amount: rawVoiceGroupDraft.amount,
        description: rawVoiceGroupDraft.description,
      }));
      setAmountStr(String(rawVoiceGroupDraft.amount));
      setExpenseMode('group');
      setGroupName(rawVoiceGroupDraft.description || 'Voice Group Expense');
      if (participantNames.length > 0) {
        setGroupParticipants(participantNames.map((name) => createEmptyParticipant({ name })));
      }
    }

    localStorage.removeItem('quickExpenseMode');
    localStorage.removeItem('quickBackPage');
  }, []);

  const switchType = (t: 'expense' | 'income' | 'transfer') => {
    setFormData(prev => ({
      ...prev,
      type: t,
      category: t === 'transfer' ? 'Transfer' : DEFAULT_CATEGORY[t as 'expense' | 'income'] || DEFAULT_CATEGORY.expense,
      subcategory: t === 'transfer' ? 'Transfer' : '',
      toAccountId: t === 'transfer' ? (accounts.find(a => a.id !== prev.accountId)?.id || 0) : 0
    }));
    setSubcategoryQuery('');
    setManualExpenseCategory(false);
  };

  const isExpense = formData.type === 'expense';
  const isLoanExpense = isExpense && expenseMode === 'loan';
  const isGroupExpense = isExpense && expenseMode === 'group';
  const selectedAccount = accounts.find(a => a.id === formData.accountId);

  const smartCategoryInput = useMemo(() => {
    if (!isExpense || isLoanExpense) return null;
    const combinedText = [subcategoryQuery, formData.description, formData.merchant]
      .filter(Boolean).join(' ').trim();
    return combinedText.length >= 3 ? combinedText : null;
  }, [subcategoryQuery, formData.description, formData.merchant, isExpense, isLoanExpense]);

  useEffect(() => {
    if (!smartCategoryInput) {
      setRemoteCategorySuggestion(null);
      return;
    }
    const timer = window.setTimeout(() => {
      backendService.categorizeText(smartCategoryInput)
        .then((result) => {
          if (result && result.confidence >= 0.45) {
            setRemoteCategorySuggestion({
              text: smartCategoryInput,
              category: normalizeCategorySelection(result.category, 'expense'),
              subcategory: result.subcategory || '',
              confidence: result.confidence,
            });
          }
        }).catch(() => { });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [smartCategoryInput]);

  const smartCatResult = useMemo(() => {
    if (!smartCategoryInput) return null;
    if (remoteCategorySuggestion?.text === smartCategoryInput) return remoteCategorySuggestion;
    const result = categorizeText(smartCategoryInput);
    return result.confidence >= 0.45 ? result : null;
  }, [remoteCategorySuggestion, smartCategoryInput]);

  const handleAmountChange = (val: string) => {
    setAmountStr(val);
    setFormData(prev => ({ ...prev, amount: parseFloat(val) || 0 }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) { toast.error('Please select an account'); return; }
    if (!formData.amount || formData.amount <= 0) { toast.error('Enter a valid amount'); return; }
    const transactionDate = parseDateInputValue(formData.date) || new Date();

    setIsSubmitting(true);
    try {
      const now = new Date();
      let result: any;

      if (formData.type === 'transfer') {
        const fromAccount = await db.accounts.get(formData.accountId);
        const toAccount = await db.accounts.get(formData.toAccountId);
        if (!fromAccount || !toAccount) { toast.error('Accounts not found'); return; }
        if (fromAccount.id === toAccount.id) { toast.error('Same account transfer'); return; }
        if (fromAccount.balance < formData.amount) { toast.error('Insufficient balance'); return; }

        result = await saveTransactionWithBackendSync({
          type: 'transfer',
          amount: formData.amount,
          accountId: formData.accountId,
          category: 'Transfer',
          subcategory: 'Transfer',
          description: formData.description || `Transfer to ${toAccount.name}`,
          date: transactionDate,
          transferToAccountId: formData.toAccountId,
          transferType: 'self-transfer',
          updatedAt: now,
        });

        await db.accounts.update(formData.accountId, { balance: fromAccount.balance - formData.amount, updatedAt: now });
        await db.accounts.update(formData.toAccountId, { balance: toAccount.balance + formData.amount, updatedAt: now });
        toast.success(`Transferred ${currency} ${formData.amount.toFixed(2)}`);
      } else {
        // Logic for regular Expense/Income/Loan/Group...
        let payload: any = {
          ...formData,
          category: normalizeCategorySelection(formData.category, formData.type as 'expense' | 'income'),
          subcategory: subcategoryQuery || formData.subcategory,
          date: transactionDate,
          expenseMode: expenseMode as any,
          tags: [],
          updatedAt: now,
        };

        if (isExpense && expenseMode === 'group') {
          payload = {
            ...payload,
            groupName: groupName || formData.description || 'New Group Expense',
            groupSplitType,
            participants: groupParticipants.map(p => ({
              friendId: p.friendId,
              name: p.name,
              share: p.share || (formData.amount / (groupParticipants.length || 1)),
            })),
          };
        } else if (isExpense && expenseMode === 'loan') {
          payload = {
            ...payload,
            loanType,
            contactName: loanDraft.contactName,
            dueDate: parseDateInputValue(loanDraft.dueDate) || new Date(),
            interestRate: loanDraft.interestRate,
          };
        }

        result = await saveTransactionWithBackendSync(payload);

        const newBalance = formData.type === 'expense' ? selectedAccount.balance - formData.amount : selectedAccount.balance + formData.amount;
        await db.accounts.update(formData.accountId, { balance: newBalance, updatedAt: now });

        toast.success(`${formData.type === 'expense' ? (expenseMode === 'individual' ? 'Expense' : expenseMode.charAt(0).toUpperCase() + expenseMode.slice(1)) : 'Income'} of ${currency} ${formData.amount.toFixed(2)} recorded`);
      }

      if (result?.id && scanDocumentId) {
        const docService = new DocumentManagementService();
        await docService.linkTransaction(scanDocumentId, result.id);
      }

      refreshData();
      setCurrentPage(returnPage);
    } catch (err) {
      console.error(err);
      toast.error('Failed to record transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const accent = useMemo(() => (
    formData.type === 'income' ? {
      amountCard: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      btn: 'bg-gradient-to-r from-emerald-500 to-teal-600',
      switchShell: 'bg-emerald-500/20'
    } : {
      amountCard: 'bg-gradient-to-br from-rose-500 to-pink-600',
      btn: 'bg-gradient-to-r from-rose-500 to-pink-600',
      switchShell: 'bg-rose-500/20'
    }
  ), [formData.type]);

  const handleScanApply = (scan: ReceiptScanPayload) => {
    const taxObj = {
      cgst: 0,
      sgst: 0,
      igst: 0,
      gstin: '',
      totalTax: scan.taxAmount || 0,
    };

    if (scan.taxBreakdown) {
      scan.taxBreakdown.forEach(t => {
        const name = t.name.toUpperCase();
        if (name.includes('CGST')) taxObj.cgst = t.amount;
        if (name.includes('SGST')) taxObj.sgst = t.amount;
        if (name.includes('IGST')) taxObj.igst = t.amount;
      });
    }

    setFormData(prev => {
      const newDate = scan.date ? toLocalDateKey(scan.date) : null;
      return {
        ...prev,
        amount: scan.amount || prev.amount,
        description: scan.description || scan.merchantName || prev.description,
        merchant: scan.merchantName || prev.merchant,
        date: (newDate || prev.date) as string,
        category: (scan.category || prev.category) as string,
        subcategory: (scan.subcategory || prev.subcategory) as string,
        taxDetails: taxObj,
      };
    });
    setAmountStr((scan.amount || 0).toString());
    setScanDocumentId(scan.scanDocumentId || null);
  };

  const DesktopUI = () => (
    <div className="hidden lg:flex KANAKU-screen-page KANAKU-transaction-entry flex-col h-screen bg-[#F8FAFC] overflow-hidden">
      <header className="h-14 border-b bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentPage(returnPage)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-500 md:hidden">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight">Add Transaction</h1>
        </div>
        <div className="flex items-center bg-slate-100 p-1 rounded-xl">
          {(['expense', 'income', 'transfer'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchType(t)}
              className={cn(
                "px-5 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                formData.type === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowScanner(true)}
            className="flex items-center gap-2 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
          >
            <Camera size={14} />
            <span>Scan Receipt</span>
          </button>
          <button onClick={handleSubmit} disabled={isSubmitting || !formData.amount} className={cn("px-5 py-1.5 rounded-lg text-xs font-bold text-white shadow-lg transition-all flex items-center gap-2", accent.btn)}>
            {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
            <span>Save Transaction</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <section className={cn("rounded-2xl p-5 shadow-xl relative overflow-hidden shrink-0 text-white", accent.amountCard)}>
            <div className="flex justify-between items-start mb-1">
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Transaction Amount</p>
              <div className="flex gap-2">
                <button className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors" title="Attach Document"><AlignLeft size={14} /></button>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white/50">{currency}</span>
              <input type="number" step="0.01" value={amountStr} onChange={(e) => handleAmountChange(e.target.value)} className="bg-transparent text-5xl font-black text-white outline-none placeholder:text-white/20 w-full" placeholder="0.00" autoFocus />
            </div>
          </section>

          <section className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 flex-1 overflow-hidden flex flex-col">
            {isExpense && (
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5 w-fit">
                {(['individual', 'group', 'loan'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setExpenseMode(mode)}
                    className={cn(
                      "px-6 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                      expenseMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Description</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-medium" placeholder="What was this for?" />
                  {smartCatResult && (
                    <div className="mt-2 flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-xl">
                      <Sparkles size={14} className="text-indigo-500" />
                      <span className="text-xs font-bold text-indigo-700">Suggestion: {smartCatResult.category}</span>
                      <button onClick={() => setFormData(prev => ({ ...prev, category: smartCatResult.category }))} className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md ml-auto">Apply</button>
                    </div>
                  )}
                </div>
                {/* Quick Category Chips */}
                {formData.type !== 'transfer' && (
                  <div>
                    <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Quick Category</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(liveCategories[formData.type as 'expense' | 'income'] || []).slice(0, 8).map((cat: string) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, category: cat, subcategory: '' }))}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border",
                            formData.category === cat
                              ? "bg-slate-900 text-white border-slate-900 shadow-md"
                              : "bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100 hover:border-slate-300"
                          )}
                        >
                          <span>{getCategoryCartoonIcon(cat)}</span>
                          <span>{cat}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-slate-500 text-[11px] font-bold mb-1.5">{formData.type === 'transfer' ? 'Internal Note' : 'Merchant / Source'}</label>
                  <input type="text" value={formData.merchant} onChange={(e) => setFormData(prev => ({ ...prev, merchant: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-medium" placeholder="e.g. Starbucks, Client..." />
                </div>
                {isExpense && expenseMode === 'group' && (
                  <div className="animate-in fade-in slide-in-from-top-2 space-y-4">
                    <div>
                      <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Group Name</label>
                      <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full bg-indigo-50/50 border-indigo-100 rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" placeholder="Trip to Goa, Dinner..." />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-slate-500 text-[11px] font-bold uppercase tracking-wider">Participants ({groupParticipants.length})</label>
                        <button onClick={() => setGroupParticipants(prev => [...prev, createEmptyParticipant()])} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"><Plus size={10} /> Add</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {groupParticipants.map((p, idx) => (
                          <div key={p.id} className="bg-indigo-50 px-2 py-1 rounded-lg flex items-center gap-2 border border-indigo-100">
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGroupParticipants(prev => prev.map(item => item.id === p.id ? { ...item, name: val } : item));
                              }}
                              className="bg-transparent border-none text-[11px] font-bold text-indigo-700 w-24 focus:ring-0 p-0"
                              placeholder={`Member ${idx + 1}`}
                            />
                            <button onClick={() => setGroupParticipants(prev => prev.filter(item => item.id !== p.id))} className="text-indigo-400 hover:text-indigo-600"><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {isExpense && expenseMode === 'loan' && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex gap-2 p-1 bg-rose-50 rounded-lg">
                      <button onClick={() => setLoanType('borrowed')} className={cn("flex-1 py-1.5 rounded-md text-[9px] font-black uppercase transition-all", loanType === 'borrowed' ? "bg-white text-rose-600 shadow-sm" : "text-rose-400")}>Borrowed</button>
                      <button onClick={() => setLoanType('lent')} className={cn("flex-1 py-1.5 rounded-md text-[9px] font-black uppercase transition-all", loanType === 'lent' ? "bg-white text-emerald-600 shadow-sm" : "text-emerald-400")}>Lent</button>
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Person Name</label>
                      <input type="text" value={loanDraft.contactName} onChange={(e) => setLoanDraft(prev => ({ ...prev, contactName: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" placeholder="Who?" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Interest (%)</label>
                        <input type="number" value={loanDraft.interestRate} onChange={(e) => setLoanDraft(prev => ({ ...prev, interestRate: parseFloat(e.target.value) || 0 }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" placeholder="0%" />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Due Date</label>
                        <input type="date" value={loanDraft.dueDate} onChange={(e) => setLoanDraft(prev => ({ ...prev, dueDate: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {formData.type === 'transfer' ? (
                  <div>
                    <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Destination Account</label>
                    <select value={formData.toAccountId} onChange={(e) => setFormData(prev => ({ ...prev, toAccountId: parseInt(e.target.value) }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-medium">
                      <option value="0">Select Destination</option>
                      {accounts.filter(a => a.id !== formData.accountId).map(a => <option key={a.id} value={a.id}>{a.name} ({formatAccountBalance(a.balance)})</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Category</label>
                      <div className="grid grid-cols-2 gap-3">
                        <CategoryDropdown options={liveCategories[formData.type as 'expense' | 'income'] || []} value={formData.category} onChange={(val) => setFormData(prev => ({ ...prev, category: val, subcategory: '' }))} className="bg-slate-50 border-none rounded-xl h-[44px]" />
                        <input type="text" value={subcategoryQuery} onChange={(e) => setSubcategoryQuery(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl px-3 h-[44px] text-xs text-slate-900" placeholder="Subcategory..." />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[11px] font-bold mb-1.5">GST Details (India)</label>
                      <div className="grid grid-cols-3 gap-2">
                        <input type="number" step="0.01" value={formData.taxDetails.cgst || ''} onChange={(e) => setFormData(prev => ({ ...prev, taxDetails: { ...prev.taxDetails, cgst: parseFloat(e.target.value) || 0 } }))} className="bg-slate-50 rounded-lg px-2 py-1 text-[10px] font-bold border-none" placeholder="CGST" />
                        <input type="number" step="0.01" value={formData.taxDetails.sgst || ''} onChange={(e) => setFormData(prev => ({ ...prev, taxDetails: { ...prev.taxDetails, sgst: parseFloat(e.target.value) || 0 } }))} className="bg-slate-50 rounded-lg px-2 py-1 text-[10px] font-bold border-none" placeholder="SGST" />
                        <input type="number" step="0.01" value={formData.taxDetails.igst || ''} onChange={(e) => setFormData(prev => ({ ...prev, taxDetails: { ...prev.taxDetails, igst: parseFloat(e.target.value) || 0 } }))} className="bg-slate-50 rounded-lg px-2 py-1 text-[10px] font-bold border-none" placeholder="IGST" />
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-slate-500 text-[11px] font-bold mb-1.5">Date</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-medium" />
                </div>
              </div>
            </div>
            <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
              <div className="text-right ml-auto">
                <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Total Summary</p>
                <p className="text-xl font-black text-slate-900">{currency} {formData.amount.toFixed(2)}</p>
              </div>
            </div>
          </section>
        </div>

        <div className="w-72 flex flex-col gap-4 shrink-0 overflow-hidden">
          <section className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-3">Select {formData.type === 'transfer' ? 'From' : ''} Account</h2>
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-hide space-y-2">
              {accounts.map(acc => (
                <button key={acc.id} onClick={() => setFormData(prev => ({ ...prev, accountId: acc.id || 0 }))} className={cn("w-full flex items-center justify-between p-3 rounded-xl border transition-all", formData.accountId === acc.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-100 bg-white text-slate-700 hover:border-slate-300")}>
                  <div className="text-left">
                    <p className="text-xs font-bold truncate">{acc.name}</p>
                    <p className={cn("text-[10px]", formData.accountId === acc.id ? "text-slate-400" : "text-slate-400")}>{formatAccountBalance(acc.balance)}</p>
                  </div>
                  {formData.accountId === acc.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );

  const MobileUI = () => (
    <div className="flex lg:hidden KANAKU-screen-page KANAKU-transaction-entry flex-col h-[100dvh] bg-white overflow-hidden relative pb-[64px]">
      <div className={cn("p-4 pt-6 rounded-b-2xl shadow-lg relative overflow-hidden shrink-0 text-white", accent.amountCard)}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentPage(returnPage)} className="text-white/80 p-1 md:hidden"><ChevronLeft size={20} /></button>
            <button onClick={() => setShowScanner(true)} className="p-1.5 bg-white/10 rounded-lg"><Camera size={16} /></button>
            <button className="p-1.5 bg-white/10 rounded-lg"><AlignLeft size={16} /></button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.amount}
            className="bg-white text-slate-900 px-5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 shadow-xl transition-all active:scale-95"
          >
            {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Save
          </button>
        </div>
        <div className="mb-3">
          <p className="text-white/60 text-[8px] font-bold uppercase tracking-[0.2em] mb-0.5">{formData.type}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black text-white/40">{currency}</span>
            <input type="number" step="0.01" value={amountStr} onChange={(e) => handleAmountChange(e.target.value)} className="bg-transparent text-3xl font-black text-white outline-none w-full" placeholder="0.00" autoFocus />
          </div>
        </div>
        <div className={cn("flex rounded-lg p-0.5", accent.switchShell)}>
          {(['expense', 'income', 'transfer'] as const).map(t => (
            <button key={t} onClick={() => switchType(t)} className={cn("flex-1 py-1 rounded-md text-[8px] font-black uppercase transition-all", formData.type === t ? "bg-white text-slate-900" : "text-white/70")}>{t}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto scrollbar-hide">
        {/* Mode Selector */}
        {isExpense && (
          <div className="flex gap-1.5 p-1 bg-slate-50 rounded-xl">
            {(['individual', 'group', 'loan'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setExpenseMode(mode)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                  expenseMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {/* Common Fields */}
          <div className="space-y-3">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">Description</p>
              <input type="text" value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" placeholder="What was this for?" />
            </div>

            {/* Mode Specific Fields */}
            {isExpense && expenseMode === 'group' && (
              <div className="animate-in fade-in slide-in-from-top-2 space-y-3">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">Group Name</p>
                  <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full bg-indigo-50/50 border-indigo-100 rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" placeholder="Trip to Goa, Dinner..." />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1 px-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Participants</p>
                    <button onClick={() => setGroupParticipants(prev => [...prev, createEmptyParticipant()])} className="text-[10px] font-bold text-indigo-600 flex items-center gap-1"><Plus size={10} /> Add</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {groupParticipants.map((p, idx) => (
                      <div key={p.id} className="bg-indigo-50 px-2 py-1 rounded-lg flex items-center gap-1.5 border border-indigo-100">
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGroupParticipants(prev => prev.map(item => item.id === p.id ? { ...item, name: val } : item));
                          }}
                          className="bg-transparent border-none text-[10px] font-bold text-indigo-700 w-20 focus:ring-0 p-0"
                          placeholder="Name"
                        />
                        <button onClick={() => setGroupParticipants(prev => prev.filter(item => item.id !== p.id))} className="text-indigo-400"><Trash2 size={10} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isExpense && expenseMode === 'loan' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex gap-2 p-1 bg-rose-50 rounded-lg">
                  <button onClick={() => setLoanType('borrowed')} className={cn("flex-1 py-1.5 rounded-md text-[8px] font-black uppercase transition-all", loanType === 'borrowed' ? "bg-white text-rose-600 shadow-sm" : "text-rose-400")}>Borrowed</button>
                  <button onClick={() => setLoanType('lent')} className={cn("flex-1 py-1.5 rounded-md text-[8px] font-black uppercase transition-all", loanType === 'lent' ? "bg-white text-emerald-600 shadow-sm" : "text-emerald-400")}>Lent</button>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">Person Name</p>
                  <input type="text" value={loanDraft.contactName} onChange={(e) => setLoanDraft(prev => ({ ...prev, contactName: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" placeholder="Who?" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">Interest (%)</p>
                    <input type="number" value={loanDraft.interestRate} onChange={(e) => setLoanDraft(prev => ({ ...prev, interestRate: parseFloat(e.target.value) || 0 }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" placeholder="0%" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">Due Date</p>
                    <input type="date" value={loanDraft.dueDate} onChange={(e) => setLoanDraft(prev => ({ ...prev, dueDate: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-bold" />
                  </div>
                </div>
              </div>
            )}

            {formData.type === 'transfer' ? (
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">To Account</p>
                <select value={formData.toAccountId} onChange={(e) => setFormData(prev => ({ ...prev, toAccountId: parseInt(e.target.value) }))} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-900 font-bold">
                  <option value="0">Select Destination...</option>
                  {accounts.filter(a => a.id !== formData.accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Quick Category Chips  Mobile */}
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Category</p>
                  <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
                    {(liveCategories[formData.type as 'expense' | 'income'] || []).slice(0, 10).map((cat: string) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, category: cat, subcategory: '' }))}
                        className={cn(
                          "flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all border whitespace-nowrap",
                          formData.category === cat
                            ? "bg-slate-900 text-white border-slate-900 shadow-md"
                            : "bg-slate-50 text-slate-600 border-slate-100 active:bg-slate-100"
                        )}
                      >
                        <span>{getCategoryCartoonIcon(cat)}</span>
                        <span>{cat}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2">
                    <CategoryDropdown options={liveCategories[formData.type as 'expense' | 'income'] || []} value={formData.category} onChange={(val) => setFormData(prev => ({ ...prev, category: val, subcategory: '' }))} className="bg-slate-50 border-none rounded-xl h-[40px] font-bold text-xs" />
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">GST / Tax</p>
                  <div className="flex gap-1.5">
                    <input type="number" step="0.01" value={formData.taxDetails.cgst || ''} onChange={(e) => setFormData(prev => ({ ...prev, taxDetails: { ...prev.taxDetails, cgst: parseFloat(e.target.value) || 0 } }))} className="flex-1 bg-slate-50 rounded-lg h-[44px] text-[10px] font-bold border-none text-center" placeholder="CGST" />
                    <input type="number" step="0.01" value={formData.taxDetails.sgst || ''} onChange={(e) => setFormData(prev => ({ ...prev, taxDetails: { ...prev.taxDetails, sgst: parseFloat(e.target.value) || 0 } }))} className="flex-1 bg-slate-50 rounded-lg h-[44px] text-[10px] font-bold border-none text-center" placeholder="SGST" />
                    <input type="number" step="0.01" value={formData.taxDetails.igst || ''} onChange={(e) => setFormData(prev => ({ ...prev, taxDetails: { ...prev.taxDetails, igst: parseFloat(e.target.value) || 0 } }))} className="flex-1 bg-slate-50 rounded-lg h-[44px] text-[10px] font-bold border-none text-center" placeholder="IGST" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">{formData.type === 'transfer' ? 'From' : ''} Account</p>
              <select value={formData.accountId} onChange={(e) => setFormData(prev => ({ ...prev, accountId: parseInt(e.target.value) }))} className="w-full h-[44px] bg-slate-50 rounded-xl px-4 font-bold text-xs">
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">Date</p>
              <input type="date" value={formData.date} onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))} className="w-full h-[44px] bg-slate-50 rounded-xl px-4 font-bold text-[10px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <DesktopUI />
      <MobileUI />
      <AnimatePresence>
        {showScanner && (
          <ReceiptScanner isOpen={showScanner} onClose={() => setShowScanner(false)} initialAccountId={formData.accountId} expenseMode={expenseMode === 'group' ? 'group' : 'individual'} onApplyScan={(scan) => {
            setFormData(prev => ({ ...prev, amount: scan.amount || prev.amount, description: scan.description || prev.description, merchant: scan.merchantName || prev.merchant }));
            setAmountStr(scan.amount ? String(scan.amount) : amountStr);
            setShowScanner(false);
          }} />
        )}
      </AnimatePresence>
    </>
  );
}
