import React, { useState } from 'react';
import { AlertTriangle, Inbox, Loader2, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiFailure } from '@/lib/apiFailure';

/** Shared building blocks for the finance console tabs. */

export const Section: React.FC<{ title: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, actions, children }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2 className="text-section-title text-slate-900">{title}</h2>
      {actions}
    </div>
    {children}
  </section>
);

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('rounded-[24px] bg-white border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]', className)}>{children}</div>
);

/** A failed load. 403 is shown as "no permission" rather than as an error. */
export const FailureBanner: React.FC<{ failure: ApiFailure | null; onRetry?: () => void }> = ({ failure, onRetry }) => {
  if (!failure) return null;
  if (failure.status === 403) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
        <ShieldOff size={18} className="shrink-0 mt-0.5" />
        <p className="text-body-sm">You do not have permission to view this. An administrator can grant access.</p>
      </div>
    );
  }
  return (
    <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
      <p className="text-body-sm flex-1">
        {failure.message}
        {failure.requestId && <span className="opacity-70"> (Ref: {failure.requestId.slice(0, 8)})</span>}
      </p>
      {onRetry && <button type="button" onClick={onRetry} className="text-sm font-bold underline shrink-0">Retry</button>}
    </div>
  );
};

export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-8 text-center">
    <Inbox size={28} className="mx-auto text-slate-300" />
    <p className="text-body text-slate-500 mt-2">{message}</p>
  </div>
);

export const LoadingRows: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="p-5 space-y-3" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-9 rounded-xl bg-slate-100 animate-pulse" />)}
  </div>
);

const BADGE_TONES: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};

export const StatusBadge: React.FC<{ tone: keyof typeof BADGE_TONES; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full border text-2xs font-bold whitespace-nowrap', BADGE_TONES[tone])}>{children}</span>
);

export const ORDER_TONE: Record<string, keyof typeof BADGE_TONES> = {
  PAID: 'success', CREATED: 'warning', FAILED: 'danger', EXPIRED: 'neutral', CANCELLED: 'neutral', REFUNDED: 'info',
  PROCESSED: 'success', IGNORED: 'neutral', REJECTED: 'danger', RECEIVED: 'warning', ACTIVE: 'success', FROZEN: 'danger',
};

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const Th: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th scope="col" className={cn('px-4 py-3 text-label text-slate-400 whitespace-nowrap', right && 'text-right')}>{children}</th>
);

export const Td: React.FC<{ children: React.ReactNode; right?: boolean; className?: string; title?: string }> = ({ children, right, className, title }) => (
  <td title={title} className={cn('px-4 py-3 text-body-sm text-slate-700 align-top', right && 'text-right', className)}>{children}</td>
);

/** Horizontal scroll inside the card only — never the page. */
export const TableScroll: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left min-w-[720px]">{children}</table>
  </div>
);

/**
 * The table on tablet/desktop, a stacked list on phones — a wide table squeezed
 * into 375px shows two columns and hides the amounts behind a sideways swipe.
 */
export const ResponsiveRows: React.FC<{ table: React.ReactNode; list: React.ReactNode }> = ({ table, list }) => (
  <>
    <div className="hidden md:block">{table}</div>
    <ul className="md:hidden divide-y divide-slate-100">{list}</ul>
  </>
);

/** One row of the phone list: title/subtitle on the left, value and badges on the right. */
export const MobileRow: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; value?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode }> = ({ title, subtitle, value, meta, actions }) => (
  <li className="px-4 py-3 space-y-2">
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-900 truncate">{title}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-0.5 break-words">{subtitle}</div>}
      </div>
      {value && <div className="text-sm font-bold text-right shrink-0">{value}</div>}
    </div>
    {meta && <div className="flex flex-wrap items-center gap-1.5">{meta}</div>}
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </li>
);

export const LoadMore: React.FC<{ visible: boolean; loading: boolean; onClick: () => void }> = ({ visible, loading, onClick }) =>
  visible ? (
    <div className="flex justify-center p-3 border-t border-slate-100">
      <button type="button" onClick={onClick} disabled={loading} className="px-5 py-2 rounded-full border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
        {loading && <Loader2 size={14} className="animate-spin" />} Load more
      </button>
    </div>
  ) : null;

export const inputClass = 'w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200';

/**
 * Money actions always ask for a reason, which is recorded on the ledger row /
 * audit entry. The confirm button stays disabled until one is given.
 */
export const ReasonDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
  children?: React.ReactNode;
}> = ({ open, title, description, confirmLabel, danger, onCancel, onConfirm, children }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-6">
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-6 space-y-4 shadow-2xl">
        <div>
          <h3 className="text-card-title text-slate-900">{title}</h3>
          <p className="text-body-sm text-slate-600 mt-1">{description}</p>
        </div>
        {children}
        <label className="block">
          <span className="text-label text-slate-500">Reason (recorded in the audit trail)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={cn(inputClass, 'mt-1 resize-none')} placeholder="At least 5 characters" data-testid="finance-reason-input" />
        </label>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="flex-1 py-2.5 rounded-full border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || reason.trim().length < 5}
            className={cn('flex-1 py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2', danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-black')}
            data-testid="finance-reason-confirm"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
