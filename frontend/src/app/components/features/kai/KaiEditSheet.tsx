import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { KaiEntityPatch } from '@kanaku/shared';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/constants';
import { actionAmount, type KaiExecutedAction } from '@/services/kai/kaiTypes';
import { KIND_LABEL } from './kaiFormat';

interface Props {
  action: KaiExecutedAction;
  currency: string;
  onSave: (patch: KaiEntityPatch) => void;
  onClose: () => void;
}

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100';
const label = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';

const todayIso = () => new Date().toISOString().slice(0, 10);

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

  const [amount, setAmount] = useState(String(actionAmount(action) ?? ''));
  const [category, setCategory] = useState(e.category ?? categories[0] ?? '');
  const [date, setDate] = useState(e.date ?? todayIso());
  const [note, setNote] = useState(e.description ?? '');
  const [person, setPerson] = useState(e.person ?? '');
  const [loanKind, setLoanKind] = useState<'loan_borrow' | 'loan_lend'>(kind === 'loan_lend' ? 'loan_lend' : 'loan_borrow');
  const [members, setMembers] = useState((e.members ?? []).join(', '));
  const [goalName, setGoalName] = useState(e.goalName ?? '');
  const [targetDate, setTargetDate] = useState(e.targetDate ?? '');
  const [title, setTitle] = useState(e.title ?? '');
  const [dueDate, setDueDate] = useState(e.dueDate ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(e.priority ?? 'medium');
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'yearly'>(e.period ?? 'monthly');

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
      if (Number.isFinite(n) && n > 0 && n !== actionAmount(action)) patch.targetAmount = n;
      if (targetDate && targetDate !== e.targetDate) patch.targetDate = targetDate;
    } else {
      if (Number.isFinite(n) && n > 0 && n !== e.amount) patch.amount = n;
      if (date && date !== e.date) patch.date = date;
      if (note.trim() && note.trim() !== e.description) patch.description = note.trim();
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

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-2xs" onClick={onClose} />
      <motion.form
        onSubmit={submit}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed left-0 right-0 bottom-0 z-50 max-w-md mx-auto bg-white rounded-t-3xl shadow-2xl px-4 pt-3 pb-6 space-y-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-purple-600">{KIND_LABEL[kind]}</p>
            <h3 className="text-base font-black text-slate-900">Edit {action.summary}</h3>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {isBudget ? (
          <>
            <div>
              <label className={label}>Category</label>
              <select className={field} value={category} onChange={(ev) => setCategory(ev.target.value)}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Limit ({currency})</label>
                <input type="number" inputMode="decimal" min={1} className={field} value={amount} onChange={(ev) => setAmount(ev.target.value)} required />
              </div>
              <div>
                <label className={label}>Resets</label>
                <select className={field} value={period} onChange={(ev) => setPeriod(ev.target.value as 'weekly' | 'monthly' | 'yearly')}>
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
              <label className={label}>Task</label>
              <input className={field} value={title} onChange={(ev) => setTitle(ev.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Due date</label>
                <input type="date" className={field} value={dueDate} onChange={(ev) => setDueDate(ev.target.value)} />
              </div>
              <div>
                <label className={label}>Priority</label>
                <select className={field} value={priority} onChange={(ev) => setPriority(ev.target.value as 'low' | 'medium' | 'high')}>
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
              <label className={label}>Goal name</label>
              <input className={field} value={goalName} onChange={(ev) => setGoalName(ev.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Target amount ({currency})</label>
                <input type="number" inputMode="decimal" min={1} className={field} value={amount} onChange={(ev) => setAmount(ev.target.value)} />
              </div>
              <div>
                <label className={label}>Target date</label>
                <input type="date" className={field} value={targetDate} onChange={(ev) => setTargetDate(ev.target.value)} />
              </div>
            </div>
          </>
        ) : (
          <>
            {isLoan && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setLoanKind('loan_borrow')} className={`rounded-xl py-2 text-sm font-bold border transition-colors cursor-pointer ${loanKind === 'loan_borrow' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-700 border-slate-200'}`}>Borrowed</button>
                <button type="button" onClick={() => setLoanKind('loan_lend')} className={`rounded-xl py-2 text-sm font-bold border transition-colors cursor-pointer ${loanKind === 'loan_lend' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-700 border-slate-200'}`}>Lent</button>
              </div>
            )}
            {isLoan && (
              <div>
                <label className={label}>Person</label>
                <input className={field} value={person} onChange={(ev) => setPerson(ev.target.value)} required />
              </div>
            )}
            {isGroup && (
              <div>
                <label className={label}>Participants (comma separated)</label>
                <input className={field} value={members} onChange={(ev) => setMembers(ev.target.value)} placeholder="Arun, Jijo, Preeti" />
                <p className="text-[11px] text-slate-500 mt-1">Split equally with you</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>{isGroup ? 'Total amount' : 'Amount'} ({currency})</label>
                <input type="number" inputMode="decimal" min={1} className={field} value={amount} onChange={(ev) => setAmount(ev.target.value)} required />
              </div>
              <div>
                <label className={label}>Date</label>
                <input type="date" className={field} value={date} onChange={(ev) => setDate(ev.target.value)} />
              </div>
            </div>
            {isMoney && !isLoan && (
              <div>
                <label className={label}>Category</label>
                <select className={field} value={category} onChange={(ev) => setCategory(ev.target.value)}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={label}>Note</label>
              <input className={field} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="What was it for?" />
            </div>
          </>
        )}

        <button type="submit" className="w-full rounded-2xl bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] text-white text-sm font-black py-3 shadow-md shadow-purple-500/25 active:scale-[0.99] transition-transform cursor-pointer">
          Save changes
        </button>
      </motion.form>
    </>
  );
};

export default KaiEditSheet;
