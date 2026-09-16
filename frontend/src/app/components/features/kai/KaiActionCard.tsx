import React, { useState } from 'react';
import { CheckCircle2, Loader2, Pencil, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import type { KaiActionKind } from '@kanaku/shared';
import { actionAmount, type KaiExecutedAction } from '@/services/kai/kaiTypes';
import { formatCurrencyAmount } from '@/lib/currencyUtils';
import { formatDay, KIND_LABEL } from './kaiFormat';

interface Props {
  action: KaiExecutedAction;
  currency: string;
  onEdit: (action: KaiExecutedAction) => void;
  onDelete: (action: KaiExecutedAction) => void;
  onRetry: (action: KaiExecutedAction) => void;
}

const TITLE: Partial<Record<KaiActionKind, string>> = {
  expense: 'New expense',
  income: 'New income',
  subscription: 'New subscription',
  transfer: 'Transfer',
  loan_borrow: 'Money borrowed',
  loan_lend: 'Money lent',
  goal: 'New goal',
  goal_update: 'Goal update',
  investment: 'New investment',
  group_expense: 'Group expense',
  todo: 'New reminder',
  budget: 'Budget',
};

type Row = { label: string; value?: string | null };

/** The details a person would check before trusting the saved record, per kind. */
function detailRows(action: KaiExecutedAction, currency: string): Row[] {
  const e = action.entities;
  const amount = actionAmount(action);
  const money = amount !== undefined
    ? formatCurrencyAmount(amount, currency, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : null;
  const category = [e.category, e.subcategory].filter(Boolean).join(' › ') || null;

  switch (action.kind) {
    case 'goal':
    case 'goal_update':
      return [
        { label: 'Goal', value: e.goalName || e.description || action.summary },
        { label: 'Target', value: money },
        { label: 'Target date', value: e.targetDate ? formatDay(e.targetDate) : 'Not set' },
      ];
    case 'transfer':
      return [
        { label: 'Amount', value: money },
        { label: 'To', value: e.person || e.merchant || e.description },
        { label: 'Date', value: formatDay(e.date) },
      ];
    case 'loan_borrow':
    case 'loan_lend':
      return [
        { label: 'Amount', value: money },
        { label: action.kind === 'loan_borrow' ? 'From' : 'To', value: e.person || '—' },
        { label: 'Date', value: formatDay(e.date) },
      ];
    case 'group_expense':
      return [
        { label: 'Amount', value: money },
        { label: 'For', value: e.description || action.summary },
        { label: 'With', value: e.members?.length ? e.members.join(', ') : 'Shared' },
        { label: 'Split', value: e.splitType === 'custom' ? 'Custom' : 'Equally' },
      ];
    case 'todo':
      return [
        { label: 'Task', value: e.title || e.description || action.summary },
        { label: 'Due', value: e.dueDate ? formatDay(e.dueDate) : 'No due date' },
        { label: 'Priority', value: e.priority ? e.priority.charAt(0).toUpperCase() + e.priority.slice(1) : 'Medium' },
      ];
    case 'budget':
      return [
        { label: 'Category', value: e.category || e.description },
        { label: 'Limit', value: money },
        { label: 'Resets', value: e.period ? e.period.charAt(0).toUpperCase() + e.period.slice(1) : 'Monthly' },
      ];
    case 'investment':
      return [
        { label: 'Amount', value: money },
        { label: 'Asset', value: e.description || action.summary },
        { label: 'Date', value: formatDay(e.date) },
      ];
    default:
      return [
        { label: 'Amount', value: money },
        { label: 'Category', value: category },
        { label: 'Merchant', value: e.merchant || (e.description && e.description !== e.category ? e.description : null) },
        { label: 'Paid with', value: e.paymentMethod },
        { label: 'Repeats', value: action.kind === 'subscription' ? e.recurrence : null },
        { label: 'Date', value: formatDay(e.date) },
      ];
  }
}

export const KaiActionCard: React.FC<Props> = ({ action, currency, onEdit, onDelete, onRetry }) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const busy = action.status === 'saving';
  const failed = action.status === 'failed';
  const rows = detailRows(action, currency).filter((row) => row.value);

  return (
    <div
      className={`rounded-[24px] border bg-white/95 backdrop-blur-md shadow-[0_10px_30px_-8px_rgba(112,144,176,0.22)] p-4 sm:p-5 transition-all ${
        failed ? 'border-rose-200' : 'border-slate-100'
      }`}
      data-testid="kai-action-card"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-purple-700 min-w-0">
          <Sparkles size={13} className="shrink-0" />
          <span className="truncate">{TITLE[action.kind] ?? KIND_LABEL[action.kind]}</span>
        </p>
        {action.status === 'saved' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-2xs font-bold text-emerald-700 shrink-0">
            <CheckCircle2 size={11} /> Saved
          </span>
        )}
        {busy && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-2xs font-bold text-slate-500 shrink-0">
            <Loader2 size={11} className="animate-spin" /> Saving…
          </span>
        )}
        {failed && (
          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-2xs font-bold text-rose-700 shrink-0">Not saved</span>
        )}
      </div>

      <dl className="mt-2 divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-slate-400 shrink-0">{row.label}</dt>
            <dd className="text-sm font-bold text-slate-900 text-right truncate">{row.value}</dd>
          </div>
        ))}
      </dl>

      {failed && <p className="mt-1 text-xs font-semibold text-rose-600">{action.error ?? 'Could not save this.'}</p>}
      {!failed && action.error && <p className="mt-1 text-xs font-semibold text-amber-600">{action.error}</p>}

      <div className="mt-3 flex items-center gap-2">
        {failed && (
          <button
            type="button"
            onClick={() => onRetry(action)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-sm font-bold text-white bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] shadow-md shadow-purple-500/25 transition-all cursor-pointer active:scale-95"
          >
            <RotateCcw size={14} /> Retry
          </button>
        )}
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={() => { setConfirmingDelete(false); onDelete(action); }}
              className="flex-1 h-10 rounded-full text-sm font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer active:scale-95"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="flex-1 h-10 rounded-full text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer active:scale-95"
            >
              Keep
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onEdit(action)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-sm font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-40 ${
                failed
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'text-white bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] shadow-md shadow-purple-500/25'
              }`}
            >
              <Pencil size={14} /> Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-full text-sm font-bold bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40 transition-colors cursor-pointer active:scale-95"
            >
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default KaiActionCard;
