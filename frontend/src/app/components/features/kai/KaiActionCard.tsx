import React, { useState } from 'react';
import {
  ArrowLeftRight,
  CheckSquare,
  Handshake,
  Loader2,
  Pencil,
  PiggyBank,
  Repeat,
  RotateCcw,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { KaiActionKind } from '@kanaku/shared';
import { actionAmount, type KaiExecutedAction } from '@/services/kai/kaiTypes';
import { formatDay, formatMoney, KIND_LABEL } from './kaiFormat';

interface Props {
  action: KaiExecutedAction;
  currency: string;
  onEdit: (action: KaiExecutedAction) => void;
  onDelete: (action: KaiExecutedAction) => void;
  onRetry: (action: KaiExecutedAction) => void;
}

const ICONS: Partial<Record<KaiActionKind, React.ComponentType<{ size?: number; className?: string }>>> = {
  expense: TrendingDown,
  subscription: Repeat,
  income: TrendingUp,
  transfer: ArrowLeftRight,
  loan_borrow: Handshake,
  loan_lend: Handshake,
  goal: Target,
  goal_update: Target,
  investment: PiggyBank,
  group_expense: Users,
  todo: CheckSquare,
};

const TONE: Partial<Record<KaiActionKind, string>> = {
  expense: 'bg-rose-50 text-rose-600',
  subscription: 'bg-rose-50 text-rose-600',
  income: 'bg-emerald-50 text-emerald-600',
  transfer: 'bg-sky-50 text-sky-600',
  loan_borrow: 'bg-amber-50 text-amber-600',
  loan_lend: 'bg-amber-50 text-amber-600',
  goal: 'bg-violet-50 text-violet-600',
  goal_update: 'bg-violet-50 text-violet-600',
  investment: 'bg-indigo-50 text-indigo-600',
  group_expense: 'bg-fuchsia-50 text-fuchsia-600',
  todo: 'bg-teal-50 text-teal-600',
};

function subline(action: KaiExecutedAction): string {
  const e = action.entities;
  switch (action.kind) {
    case 'group_expense':
      return (e.members ?? []).join(' · ') || 'Shared';
    case 'loan_borrow':
      return `From ${e.person ?? '—'} · ${formatDay(e.date)}`;
    case 'loan_lend':
      return `To ${e.person ?? '—'} · ${formatDay(e.date)}`;
    case 'goal':
    case 'goal_update':
      return e.targetDate ? `Target: ${formatDay(e.targetDate)}` : 'No target date yet';
    case 'todo':
      return `${e.dueDate ? `Due ${formatDay(e.dueDate)}` : 'No due date'} · ${e.priority ?? 'medium'} priority`;
    case 'transfer':
      return formatDay(e.date);
    default:
      return [e.category, formatDay(e.date)].filter(Boolean).join(' · ');
  }
}

export const KaiActionCard: React.FC<Props> = ({ action, currency, onEdit, onDelete, onRetry }) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const Icon = ICONS[action.kind] ?? TrendingDown;
  const amount = actionAmount(action);
  const busy = action.status === 'saving';
  const failed = action.status === 'failed';

  return (
    <div
      className={`rounded-2xl border bg-white/95 backdrop-blur-md shadow-2xs px-3.5 py-3 transition-all ${
        failed ? 'border-rose-200' : 'border-slate-100'
      }`}
      data-testid="kai-action-card"
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${TONE[action.kind] ?? 'bg-slate-100 text-slate-600'}`}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Icon size={17} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 truncate">{action.summary}</p>
            {amount !== undefined && (
              <span className="text-sm font-black text-slate-900 shrink-0">{formatMoney(currency, amount)}</span>
            )}
          </div>
          <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
            <span className="text-slate-400">{KIND_LABEL[action.kind]}</span>
            {' · '}
            {subline(action)}
          </p>
          {failed && (
            <p className="text-[11px] font-semibold text-rose-600 mt-1">{action.error ?? 'Could not save this.'}</p>
          )}
          {!failed && action.error && (
            <p className="text-[11px] font-semibold text-amber-600 mt-1">{action.error}</p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 justify-end">
        {action.status === 'saved' && (
          <span className="mr-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Saved
          </span>
        )}
        {busy && <span className="mr-auto text-[10px] font-bold text-slate-400">Saving…</span>}
        {failed && (
          <button
            type="button"
            onClick={() => onRetry(action)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
          >
            <RotateCcw size={12} /> Retry
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(action)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-40 transition-colors cursor-pointer"
        >
          <Pencil size={12} /> Edit
        </button>
        {confirmingDelete ? (
          <>
            <button
              type="button"
              onClick={() => { setConfirmingDelete(false); onDelete(action); }}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Trash2 size={12} /> Delete
          </button>
        )}
      </div>
    </div>
  );
};

export default KaiActionCard;
