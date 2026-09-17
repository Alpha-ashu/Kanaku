import React, { useEffect, useMemo, useState } from 'react';
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
  ChevronDown,
} from 'lucide-react';
import type { KaiEntityPatch, KaiActionKind } from '@kanaku/shared';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/constants';
import { actionAmount, type KaiExecutedAction } from '@/services/kai/kaiTypes';
import { KIND_LABEL } from './kaiFormat';

interface Props {
  action: KaiExecutedAction;
  currency: string;
  onSave: (patch: KaiEntityPatch) => void;
  onClose: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const getKindIcon = (kind: KaiActionKind) => {
  switch (kind) {
    case 'expense':
      return <Receipt size={20} />;
    case 'income':
      return <Sparkles size={20} />;
    case 'transfer':
      return <ArrowRightLeft size={20} />;
    case 'loan_borrow':
    case 'loan_lend':
      return <User size={20} />;
    case 'group_expense':
      return <Users size={20} />;
    case 'goal':
    case 'goal_update':
      return <Target size={20} />;
    case 'todo':
      return <ListTodo size={20} />;
    case 'budget':
      return <PieChart size={20} />;
    default:
      return <Receipt size={20} />;
  }
};

export const KaiEditSheet: React.FC<Props> = ({ action, currency, onSave, onClose }) => {
  const e = action.entities;
  const kind = action.kind;
  const isLoan = kind === 'loan_borrow' || kind === 'loan_lend';
  const isGoal = kind === 'goal' || kind === 'goal_update';
  const isTodo = kind === 'todo';
  const isBudget = kind === 'budget';
  const isGroup = kind === 'group_expense';
  const isMoney = !isGoal && !isTodo && !isBudget;

  const categories = useMemo(() => {
    const names = (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => c.name);
    return e.category && !names.includes(e.category) ? [e.category, ...names] : names;
  }, [kind, e.category]);

  const [amount, setAmount] = useState(String(actionAmount(action) ?? e.amount ?? ''));
  const [category, setCategory] = useState(e.category ?? categories[0] ?? '');
  const [date, setDate] = useState(e.date ?? todayIso());
  const [note, setNote] = useState(e.description || e.merchant || action.summary || '');
  const [person, setPerson] = useState(e.person ?? '');
  const [loanKind, setLoanKind] = useState<'loan_borrow' | 'loan_lend'>(kind === 'loan_lend' ? 'loan_lend' : 'loan_borrow');
  const [members, setMembers] = useState((e.members ?? []).join(', '));
  const [goalName, setGoalName] = useState(e.goalName ?? '');
  const [targetDate, setTargetDate] = useState(e.targetDate ?? '');
  const [title, setTitle] = useState(e.title ?? '');
  const [dueDate, setDueDate] = useState(e.dueDate ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(e.priority ?? 'medium');
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>(e.period ?? 'monthly');

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
      if (Number.isFinite(n) && n > 0 && (n !== actionAmount(action) || n !== e.amount)) patch.targetAmount = n;
      if (targetDate && targetDate !== e.targetDate) patch.targetDate = targetDate;
    } else {
      if (Number.isFinite(n) && n > 0 && (n !== e.amount || n !== actionAmount(action))) patch.amount = n;
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
        if (list.length > 0 && list.join('|') !== (e.members ?? []).join('|')) patch.members = list;
      }
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    onSave(patch);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
      {/* High z-index dimmed backdrop overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[290] bg-slate-950/65 backdrop-blur-md pointer-events-auto cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Proper Floating Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 350 }}
        className="relative z-[300] pointer-events-auto w-full max-w-md bg-white rounded-[28px] sm:rounded-[32px] shadow-[0_25px_70px_-15px_rgba(15,23,42,0.35),0_0_0_1px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col max-h-[calc(100dvh-2.5rem)] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <form onSubmit={submit} className="flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100/90 flex items-center justify-between gap-3 shrink-0 bg-gradient-to-b from-slate-50/60 to-white">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-500/15 via-purple-500/10 to-indigo-500/15 border border-purple-200/60 flex items-center justify-center text-purple-600 shadow-2xs shrink-0">
                {getKindIcon(kind)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-black text-[10px] uppercase tracking-wider border border-purple-200/60">
                    <Sparkles size={10} className="text-purple-600" /> {KIND_LABEL[kind]}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 truncate mt-0.5 tracking-tight">
                  Edit {action.summary}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100/80 hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Body */}
          <div className="px-5 sm:px-6 py-4 space-y-3.5 overflow-y-auto overscroll-contain flex-1">
            {isBudget ? (
              <>
                <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    <PieChart size={13} className="text-purple-500" /> Category
                  </label>
                  <div className="relative">
                    <select
                      className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none cursor-pointer pr-6 appearance-none"
                      value={category}
                      onChange={(ev) => setCategory(ev.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                      Limit ({currency})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                      required
                    />
                  </div>
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      <Clock size={13} className="text-purple-500" /> Resets
                    </label>
                    <div className="relative">
                      <select
                        className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none cursor-pointer pr-6 appearance-none"
                        value={period}
                        onChange={(ev) => setPeriod(ev.target.value as 'weekly' | 'monthly' | 'yearly')}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                      <ChevronDown size={15} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </>
            ) : isTodo ? (
              <>
                <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    <ListTodo size={13} className="text-purple-500" /> Task Title
                  </label>
                  <input
                    className="w-full text-sm font-semibold text-slate-900 bg-transparent outline-none"
                    value={title}
                    onChange={(ev) => setTitle(ev.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      <Calendar size={13} className="text-purple-500" /> Due Date
                    </label>
                    <input
                      type="date"
                      className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none cursor-pointer"
                      value={dueDate}
                      onChange={(ev) => setDueDate(ev.target.value)}
                    />
                  </div>
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      <Flag size={13} className="text-purple-500" /> Priority
                    </label>
                    <div className="relative">
                      <select
                        className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none cursor-pointer pr-6 appearance-none"
                        value={priority}
                        onChange={(ev) => setPriority(ev.target.value as 'low' | 'medium' | 'high')}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <ChevronDown size={15} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </>
            ) : isGoal ? (
              <>
                <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    <Target size={13} className="text-purple-500" /> Goal Name
                  </label>
                  <input
                    className="w-full text-sm font-semibold text-slate-900 bg-transparent outline-none"
                    value={goalName}
                    onChange={(ev) => setGoalName(ev.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                      Target ({currency})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                    />
                  </div>
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      <Calendar size={13} className="text-purple-500" /> Target Date
                    </label>
                    <input
                      type="date"
                      className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none cursor-pointer"
                      value={targetDate}
                      onChange={(ev) => setTargetDate(ev.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Monetary Hero Amount Card */}
                <div className="rounded-2xl p-4 bg-gradient-to-br from-purple-50/70 via-indigo-50/30 to-white border border-purple-200/80 shadow-2xs focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-purple-700/90">
                      {isGroup ? 'Total Bill Amount' : 'Amount'}
                    </label>
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-purple-100/90 text-purple-800 tracking-wider">
                      {currency}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-2xl sm:text-3xl font-black text-purple-600 mr-1.5 select-none">
                      {currency === 'INR' ? '₹' : currency}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={1}
                      className="w-full text-2xl sm:text-3xl font-black text-slate-900 placeholder:text-slate-300 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={amount}
                      onChange={(ev) => setAmount(ev.target.value)}
                      placeholder="0.00"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {isLoan && (
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100/90 border border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => setLoanKind('loan_borrow')}
                      className={`rounded-xl py-2 text-xs font-black transition-all cursor-pointer ${
                        loanKind === 'loan_borrow'
                          ? 'bg-white text-purple-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Borrowed
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoanKind('loan_lend')}
                      className={`rounded-xl py-2 text-xs font-black transition-all cursor-pointer ${
                        loanKind === 'loan_lend'
                          ? 'bg-white text-purple-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Lent
                    </button>
                  </div>
                )}

                {isLoan && (
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      <User size={13} className="text-purple-500" /> Person
                    </label>
                    <input
                      type="text"
                      className="w-full text-sm font-semibold text-slate-900 placeholder:text-slate-400 bg-transparent outline-none"
                      value={person}
                      onChange={(ev) => setPerson(ev.target.value)}
                      placeholder="Person name"
                      required
                    />
                  </div>
                )}

                {isGroup && (
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      <Users size={13} className="text-purple-500" /> Split With (Participants)
                    </label>
                    <input
                      type="text"
                      className="w-full text-sm font-semibold text-slate-900 placeholder:text-slate-400 bg-transparent outline-none"
                      value={members}
                      onChange={(ev) => setMembers(ev.target.value)}
                      placeholder="Arun, Jijo, Preeti"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Split equally with you</p>
                  </div>
                )}

                {/* Date and Category Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      <Calendar size={13} className="text-purple-500" /> Date
                    </label>
                    <input
                      type="date"
                      className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none cursor-pointer"
                      value={date}
                      onChange={(ev) => setDate(ev.target.value)}
                    />
                  </div>

                  {isMoney && !isLoan && (
                    <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        <Tag size={13} className="text-purple-500" /> Category
                      </label>
                      <div className="relative">
                        <select
                          className="w-full text-sm font-bold text-slate-900 bg-transparent outline-none cursor-pointer pr-6 appearance-none"
                          value={category}
                          onChange={(ev) => setCategory(ev.target.value)}
                        >
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={15} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Note / Merchant */}
                <div className="rounded-2xl p-3.5 border border-slate-200/80 bg-slate-50/60 hover:bg-white focus-within:bg-white focus-within:border-purple-500 focus-within:ring-4 focus-within:ring-purple-500/10 transition-all">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    <Store size={13} className="text-purple-500" /> Note / Merchant
                  </label>
                  <input
                    type="text"
                    className="w-full text-sm font-semibold text-slate-900 placeholder:text-slate-400 bg-transparent outline-none"
                    value={note}
                    onChange={(ev) => setNote(ev.target.value)}
                    placeholder="e.g. Petrol, Starbucks, Grocery"
                  />
                </div>
              </>
            )}
          </div>

          {/* Premium Actions Footer */}
          <div className="px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-12 px-5 sm:px-6 rounded-2xl border border-slate-200/80 bg-white hover:bg-slate-100/80 text-slate-700 font-bold text-sm shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="kai-edit-confirm-button"
              className="h-12 flex-1 rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-[0_10px_25px_-5px_rgba(124,58,237,0.45)] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer hover:shadow-[0_14px_28px_-5px_rgba(124,58,237,0.55)]"
            >
              <Check size={18} strokeWidth={2.8} /> Confirm & Save
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default KaiEditSheet;
