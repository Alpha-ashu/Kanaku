import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Check,
  X,
  Sparkles,
  Calendar,
  Tag,
  Store,
  User,
  Users,
  Target,
  ListTodo,
  PieChart,
  ArrowRightLeft,
  Clock,
  Flag,
  Receipt,
  Wallet,
  ChevronDown,
  Paperclip,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import type { KaiEntityPatch, KaiActionKind } from '@kanaku/shared';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/constants';
import { actionAmount, type KaiExecutedAction } from '@/services/kai/kaiTypes';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { db, type Account } from '@/lib/database';
import { KIND_LABEL } from './kaiFormat';

interface Props {
  action: KaiExecutedAction;
  currency: string;
  accounts?: Account[];
  onSave: (patch: KaiEntityPatch) => void;
  onClose: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const getKindIcon = (kind: KaiActionKind) => {
  switch (kind) {
    case 'expense':
      return <Receipt size={18} />;
    case 'income':
      return <Sparkles size={18} />;
    case 'transfer':
      return <ArrowRightLeft size={18} />;
    case 'loan_borrow':
    case 'loan_lend':
      return <User size={18} />;
    case 'group_expense':
      return <Users size={18} />;
    case 'goal':
    case 'goal_update':
      return <Target size={18} />;
    case 'todo':
      return <ListTodo size={18} />;
    case 'budget':
      return <PieChart size={18} />;
    default:
      return <Receipt size={18} />;
  }
};

export const KaiEditSheet: React.FC<Props> = ({
  action,
  currency,
  accounts: propAccounts,
  onSave,
  onClose,
}) => {
  const e = action.entities;
  const kind = action.kind;
  const isLoan = kind === 'loan_borrow' || kind === 'loan_lend';
  const isGoal = kind === 'goal' || kind === 'goal_update';
  const isTodo = kind === 'todo';
  const isBudget = kind === 'budget';
  const isGroup = kind === 'group_expense';
  const isMoney = !isGoal && !isTodo && !isBudget;

  const [dbAccounts, setDbAccounts] = useState<Account[]>([]);

  useEffect(() => {
    db.accounts
      .filter((a) => !a.deletedAt)
      .toArray()
      .then(setDbAccounts)
      .catch((err) => console.warn('[KaiEdit] Could not load accounts from db', err));
  }, []);

  const availableAccounts = useMemo(() => {
    if (propAccounts && propAccounts.length > 0) return propAccounts;
    return dbAccounts;
  }, [propAccounts, dbAccounts]);

  const categories = useMemo(() => {
    const names = (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => c.name);
    return e.category && !names.includes(e.category) ? [e.category, ...names] : names;
  }, [kind, e.category]);

  const [amount, setAmount] = useState(String(actionAmount(action) ?? e.amount ?? ''));
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(() => {
    if (e.accountId) return e.accountId;
    if (availableAccounts.length > 0 && typeof availableAccounts[0].id === 'number') {
      return availableAccounts[0].id;
    }
    return undefined;
  });

  // Keep selectedAccountId synced if initial accounts loaded after mount
  useEffect(() => {
    if (selectedAccountId === undefined && availableAccounts.length > 0) {
      setSelectedAccountId(e.accountId ?? availableAccounts[0]?.id);
    }
  }, [availableAccounts, e.accountId, selectedAccountId]);

  const [category, setCategory] = useState(e.category ?? categories[0] ?? '');
  const [date, setDate] = useState(e.date ?? todayIso());
  const [note, setNote] = useState(e.description || e.merchant || action.summary || '');
  const [person, setPerson] = useState(e.person ?? '');
  const [loanKind, setLoanKind] = useState<'loan_borrow' | 'loan_lend'>(
    kind === 'loan_lend' ? 'loan_lend' : 'loan_borrow',
  );
  const [members, setMembers] = useState((e.members ?? []).join(', '));
  const [goalName, setGoalName] = useState(e.goalName ?? '');
  const [targetDate, setTargetDate] = useState(e.targetDate ?? '');
  const [title, setTitle] = useState(e.title ?? '');
  const [dueDate, setDueDate] = useState(e.dueDate ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(e.priority ?? 'medium');
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>(e.period ?? 'monthly');
  const [attachment, setAttachment] = useState<string | undefined>(e.attachment);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing transaction attachment if not present in entities
  useEffect(() => {
    if (attachment) return;
    const txRef = action.refs.find((r) => r.table === 'transactions');
    if (txRef && 'localId' in txRef) {
      db.transactions.get(txRef.localId).then((tx) => {
        if (tx?.attachment) {
          setAttachment(tx.attachment);
        }
      }).catch((err) => console.warn('[KaiEdit] Could not load transaction attachment', err));
    }
  }, [action.refs]);

  const handleFileChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Bill copy must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachment(result);
      toast.success('Bill copy attached');
    };
    reader.onerror = () => {
      toast.error('Could not read file');
    };
    reader.readAsDataURL(file);
    ev.target.value = '';
  };

  const handleRemoveAttachment = () => {
    setAttachment('');
    toast.info('Bill copy removed');
  };

  // Handle escape key and lock body scroll
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const patch: KaiEntityPatch = {};
    const n = Number(amount);

    if (isBudget) {
      if (Number.isFinite(n) && n > 0 && n !== e.amount) patch.amount = n;
      if (category && category !== e.category) patch.category = category;
      if (period !== (e.period ?? 'monthly')) patch.period = period;
    } else if (isTodo) {
      if (title.trim() && title.trim() !== e.title) patch.title = title.trim();
      if (dueDate && dueDate !== e.dueDate) patch.dueDate = dueDate;
      if (priority !== e.priority) patch.priority = priority;
    } else if (isGoal) {
      if (goalName.trim() && goalName.trim() !== e.goalName) patch.goalName = goalName.trim();
      if (Number.isFinite(n) && n > 0 && (n !== actionAmount(action) || n !== e.amount)) {
        patch.targetAmount = n;
      }
      if (targetDate && targetDate !== e.targetDate) patch.targetDate = targetDate;
    } else {
      if (Number.isFinite(n) && n > 0 && (n !== e.amount || n !== actionAmount(action))) {
        patch.amount = n;
      }
      if (date && date !== e.date) patch.date = date;
      const cleanNote = note.trim();
      if (cleanNote && (cleanNote !== e.description || cleanNote !== e.merchant)) {
        patch.description = cleanNote;
        patch.merchant = cleanNote;
      }
      if (!isLoan && category && category !== e.category) patch.category = category;
      if (isLoan) {
        if (person.trim() && person.trim() !== e.person) patch.person = person.trim();
        if (loanKind !== kind) patch.kind = loanKind;
      }
      if (isGroup) {
        const list = members.split(/,|\band\b/i).map((m) => m.trim()).filter(Boolean);
        if (list.length > 0 && list.join('|') !== (e.members ?? []).join('|')) {
          patch.members = list;
        }
      }
      if (selectedAccountId && selectedAccountId !== e.accountId) {
        patch.accountId = selectedAccountId;
        const matched = availableAccounts.find((a) => a.id === selectedAccountId);
        if (matched) patch.accountName = matched.name;
      }
      if (attachment !== undefined && attachment !== (e.attachment ?? '')) {
        patch.attachment = attachment;
      }
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    onSave(patch);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 pointer-events-none">
      {/* Dimmed backdrop overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[290] bg-slate-950/55 backdrop-blur-xs pointer-events-auto cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Professional Centered Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        className="relative z-[300] pointer-events-auto w-full max-w-md bg-white rounded-[28px] sm:rounded-[32px] shadow-2xl border border-slate-100 flex flex-col max-h-[min(90vh,620px)] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <form onSubmit={submit} className="flex flex-col h-full min-h-0">
          {/* Clean Modal Header */}
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100/60">
                {getKindIcon(kind)}
              </div>
              <div className="min-w-0">
                <span className="text-2xs font-extrabold uppercase tracking-wider text-purple-600 block">
                  {KIND_LABEL[kind]}
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 truncate tracking-tight">
                  Edit {action.summary}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0"
              aria-label="Close modal"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form Body with Standard Professional Inputs */}
          <div className="px-5 sm:px-6 py-4 space-y-3.5 overflow-y-auto overscroll-contain flex-1">
            {isBudget ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                    value={category}
                    onChange={(ev) => setCategory(ev.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Limit ({currency})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Resets
                    </label>
                    <select
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                      value={period}
                      onChange={(ev) => setPeriod(ev.target.value as 'weekly' | 'monthly' | 'yearly')}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
              </>
            ) : isTodo ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Task Title
                  </label>
                  <input
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                    value={title}
                    onChange={(ev) => setTitle(ev.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Due Date
                    </label>
                    <input
                      type="date"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                      value={dueDate}
                      onChange={(ev) => setDueDate(ev.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Priority
                    </label>
                    <select
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                      value={priority}
                      onChange={(ev) => setPriority(ev.target.value as 'low' | 'medium' | 'high')}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
              </>
            ) : isGoal ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Goal Name
                  </label>
                  <input
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                    value={goalName}
                    onChange={(ev) => setGoalName(ev.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Target ({currency})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Target Date
                    </label>
                    <input
                      type="date"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                      value={targetDate}
                      onChange={(ev) => setTargetDate(ev.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Standard Professional Amount Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {isGroup ? 'Total Bill Amount' : 'Amount'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-600 font-black text-lg select-none">
                      {currency === 'INR' ? '₹' : currency}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={1}
                      className="w-full pl-9 pr-14 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-lg font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                      placeholder="0.00"
                      required
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-2xs font-extrabold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800">
                      {currency}
                    </span>
                  </div>
                </div>

                {/* Account Field */}
                {availableAccounts.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Account
                    </label>
                    <select
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                      value={selectedAccountId ?? ''}
                      onChange={(ev) => setSelectedAccountId(Number(ev.target.value))}
                    >
                      {availableAccounts.map((acc) => {
                        const bal = acc.balance !== undefined
                          ? formatCurrencyAmount(acc.balance, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                          : '';
                        return (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} {bal ? `(${bal})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Loan Kind Switch */}
                {isLoan && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Loan Type
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-100/80 p-1 rounded-2xl">
                      <button
                        type="button"
                        onClick={() => setLoanKind('loan_borrow')}
                        className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                          loanKind === 'loan_borrow'
                            ? 'bg-white text-purple-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Borrowed
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoanKind('loan_lend')}
                        className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-center ${
                          loanKind === 'loan_lend'
                            ? 'bg-white text-purple-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Lent
                      </button>
                    </div>
                  </div>
                )}

                {/* Loan Person */}
                {isLoan && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Person
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                      value={person}
                      onChange={(ev) => setPerson(ev.target.value)}
                      placeholder="e.g. Rahul, Priya"
                      required
                    />
                  </div>
                )}

                {/* Group Participants */}
                {isGroup && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Split With (Participants)
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                      value={members}
                      onChange={(ev) => setMembers(ev.target.value)}
                      placeholder="e.g. Arun, Jijo, Preeti"
                    />
                    <p className="text-2xs text-slate-400 mt-1">Split equally with you</p>
                  </div>
                )}

                {/* Date & Category in 2 Columns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Date
                    </label>
                    <input
                      type="date"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                      value={date}
                      onChange={(ev) => setDate(ev.target.value)}
                    />
                  </div>

                  {isMoney && !isLoan && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Category
                      </label>
                      <select
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all cursor-pointer"
                        value={category}
                        onChange={(ev) => setCategory(ev.target.value)}
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Note / Merchant */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Note / Merchant
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                    placeholder="e.g. Petrol, Starbucks, Grocery"
                  />
                </div>

                {/* Bill Copy Attachment Field */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Bill Copy Attachment
                    </label>
                    <span className="text-2xs font-semibold text-slate-400">Optional</span>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*,.pdf"
                    className="hidden"
                    aria-label="Upload bill copy"
                  />

                  {attachment ? (
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-purple-50/70 border border-purple-200/80 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        {attachment.startsWith('data:image') || attachment.match(/\.(jpg|jpeg|png|webp)($|\?)/i) ? (
                          <img
                            src={attachment}
                            alt="Bill copy preview"
                            className="w-12 h-12 rounded-xl object-cover border border-purple-200 shadow-2xs shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200">
                            <FileText size={22} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-900 truncate block">
                            Bill copy attached
                          </span>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-2xs font-semibold text-purple-700 hover:text-purple-800 hover:underline cursor-pointer"
                          >
                            Change file
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveAttachment}
                        className="w-8 h-8 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200/60 hover:border-rose-200 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs"
                        title="Remove attachment"
                        aria-label="Remove attachment"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-purple-300 bg-slate-50/70 hover:bg-purple-50/40 text-slate-600 hover:text-purple-700 transition-all cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-white group-hover:bg-purple-100 text-slate-500 group-hover:text-purple-600 border border-slate-200/60 flex items-center justify-center transition-all shrink-0">
                        <Paperclip size={15} />
                      </div>
                      <div className="text-left">
                        <span className="text-xs font-bold block text-slate-800 group-hover:text-purple-700">
                          Upload bill or receipt
                        </span>
                        <span className="text-2xs text-slate-400 block">
                          PNG, JPG, PDF up to 10MB
                        </span>
                      </div>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Clean Professional Footer */}
          <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-2xl border border-slate-200/90 bg-white hover:bg-slate-100/80 text-slate-700 font-bold text-sm shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="kai-edit-confirm-button"
              className="h-11 flex-1 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-sm shadow-md shadow-purple-500/25 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Check size={16} strokeWidth={2.6} /> Confirm & Save
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default KaiEditSheet;
