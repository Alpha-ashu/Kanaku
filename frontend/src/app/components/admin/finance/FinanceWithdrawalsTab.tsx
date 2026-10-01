import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BadgeCheck, Ban, Copy, Eye, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { describeApiFailure, failureText, type ApiFailure } from '@/lib/apiFailure';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { AdminWithdrawal, PayoutDetails, financeService, formatMoneyMinor } from '@/services/walletService';
import {
  Card, EmptyState, FailureBanner, LoadMore, LoadingRows, MobileRow, ReasonDialog, ResponsiveRows, StatusBadge, TableScroll, Td, Th, formatDateTime, inputClass,
} from './financeUi';

/**
 * Advisor withdrawal requests. KANAKU pays them by hand:
 *
 *   1. Approve — locks the request (the advisor can no longer cancel it).
 *   2. View account, pay it from the business bank / UPI app.
 *   3. Mark paid with the UTR / UPI reference — the advisor sees it.
 *
 * Reject at any point before paid returns the coins to the advisor. Viewing the
 * full account is recorded in the audit trail; lists only show it masked.
 */

const STATUSES: Array<{ id: string; label: string }> = [
  { id: 'OPEN', label: 'Needs action' },
  { id: 'REQUESTED', label: 'Requested' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'PAID', label: 'Paid' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: '', label: 'All' },
];

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  REQUESTED: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'danger', CANCELLED: 'neutral',
};

/** Payout account changed within this long before the request: worth a second look. */
const RECENT_CHANGE_MS = 72 * 60 * 60_000;

const recentlyChanged = (w: AdminWithdrawal) =>
  Boolean(w.payoutMethodChangedAt) && Math.abs(new Date(w.createdAt).getTime() - new Date(w.payoutMethodChangedAt!).getTime()) < RECENT_CHANGE_MS;

const copy = async (value: string, label: string) => {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy — select it instead.');
  }
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; busy?: boolean }> = ({ title, onClose, children, busy }) =>
  createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] p-5 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-card-title text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 disabled:opacity-40">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
    <div className="flex-1 min-w-0">
      <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn('text-sm font-bold text-slate-900 break-all', mono && 'font-mono tracking-wide')}>{value}</p>
    </div>
    <button type="button" onClick={() => void copy(value, label)} className="shrink-0 w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50" aria-label={`Copy ${label}`}>
      <Copy size={14} />
    </button>
  </div>
);

export const FinanceWithdrawalsTab: React.FC = () => {
  const lock = useSubmitLock();
  const [status, setStatus] = useState('OPEN');
  const [items, setItems] = useState<AdminWithdrawal[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<{ row: AdminWithdrawal; details: PayoutDetails | null; error?: string } | null>(null);
  const [paying, setPaying] = useState<AdminWithdrawal | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null);

  const fetchPage = useCallback(async (after: string | null) => {
    const page = await financeService.withdrawals({ status, cursor: after, limit: 25 });
    setItems((prev) => (after ? [...prev, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      await fetchPage(null);
    } catch (err) {
      setFailure(await describeApiFailure(err, 'Withdrawals could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    setMore(true);
    try {
      await fetchPage(cursor);
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'More withdrawals could not be loaded.')));
    } finally {
      setMore(false);
    }
  };

  const reveal = async (row: AdminWithdrawal) => {
    setRevealing({ row, details: null });
    try {
      const { details } = await financeService.withdrawalPayoutDetails(row.id);
      setRevealing({ row, details });
    } catch (err) {
      setRevealing({ row, details: null, error: failureText(await describeApiFailure(err, 'The payout account could not be shown.')) });
    }
  };

  const approve = lock(async (row: AdminWithdrawal) => {
    setBusyId(row.id);
    try {
      await financeService.approveWithdrawal(row.id);
      toast.success('Approved. Pay it, then mark it paid with the reference.');
      await load();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'The withdrawal could not be approved.')));
      await load();
    } finally {
      setBusyId(null);
    }
  });

  const markPaid = lock(async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!paying || reference.trim().length < 4) return;
    setBusyId(paying.id);
    try {
      await financeService.markWithdrawalPaid(paying.id, reference.trim(), note.trim());
      toast.success('Marked as paid. The advisor has been told.');
      setPaying(null);
      setReference('');
      setNote('');
      await load();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'The withdrawal could not be marked as paid.')));
    } finally {
      setBusyId(null);
    }
  });

  const reject = async (reason: string) => {
    if (!rejecting) return;
    try {
      await financeService.rejectWithdrawal(rejecting.id, reason);
      toast.success('Rejected. The coins are back in the advisor’s wallet.');
      setRejecting(null);
      await load();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'The withdrawal could not be rejected.')));
    }
  };

  const actions = (w: AdminWithdrawal) => {
    if (w.status !== 'REQUESTED' && w.status !== 'APPROVED') return null;
    const busy = busyId === w.id;
    return (
      <div className="flex flex-wrap gap-1.5 justify-end">
        <button type="button" onClick={() => void reveal(w)} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50" data-testid={`withdrawal-reveal-${w.id}`}>
          <Eye size={13} /> Account
        </button>
        {w.status === 'REQUESTED' ? (
          <button type="button" onClick={() => void approve(w)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-900 text-xs font-bold text-white hover:bg-black disabled:opacity-50" data-testid={`withdrawal-approve-${w.id}`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />} Approve
          </button>
        ) : (
          <button type="button" onClick={() => { setPaying(w); setReference(''); setNote(''); }} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50" data-testid={`withdrawal-paid-${w.id}`}>
            <Send size={13} /> Mark paid
          </button>
        )}
        <button type="button" onClick={() => setRejecting(w)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50" data-testid={`withdrawal-reject-${w.id}`}>
          <Ban size={13} /> Reject
        </button>
      </div>
    );
  };

  const changedFlag = (w: AdminWithdrawal) => recentlyChanged(w) && (w.status === 'REQUESTED' || w.status === 'APPROVED') ? (
    <span className="inline-flex items-center gap-1 text-2xs font-bold text-amber-700" title={`Payout details changed ${formatDateTime(w.payoutMethodChangedAt)}`}>
      <AlertTriangle size={11} /> details changed recently
    </span>
  ) : null;

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <select className={cn(inputClass, 'sm:max-w-xs')} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {STATUSES.map((s) => <option key={s.id || 'all'} value={s.id}>{s.label}</option>)}
        </select>
        <p className="text-xs text-slate-500 flex-1">Approve, pay from the business account, then mark paid with the UTR / UPI reference. Rejecting returns the coins.</p>
        <button type="button" onClick={() => void load()} disabled={loading} className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </Card>

      <FailureBanner failure={failure} onRetry={() => void load()} />

      {!failure && (
        <Card className="overflow-hidden">
          {loading && items.length === 0 ? <LoadingRows /> : items.length === 0 ? (
            <EmptyState message={status === 'OPEN' ? 'No withdrawals waiting. New requests appear here.' : 'No withdrawals match.'} />
          ) : (
            <ResponsiveRows
              table={(
                <TableScroll>
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr><Th>Requested</Th><Th>Advisor</Th><Th right>Amount</Th><Th>Pay to</Th><Th>Status</Th><Th right>Actions</Th></tr>
                  </thead>
                  <tbody>
                    {items.map((w) => (
                      <tr key={w.id} className="border-b border-slate-50 last:border-0" data-testid={`withdrawal-row-${w.id}`}>
                        <Td className="whitespace-nowrap">{formatDateTime(w.createdAt)}</Td>
                        <Td>
                          <p className="font-bold text-slate-900">{w.user.name}</p>
                          <p className="text-xs text-slate-500">{w.user.email}</p>
                        </Td>
                        <Td right className="whitespace-nowrap">
                          <p className="font-bold text-slate-900">{formatMoneyMinor(w.amountMinor, w.currency)}</p>
                          <p className="text-xs text-slate-500">{w.coins.toLocaleString('en-IN')} coins</p>
                        </Td>
                        <Td>
                          <p className="whitespace-nowrap">{w.payoutLabel}</p>
                          {changedFlag(w)}
                        </Td>
                        <Td>
                          <StatusBadge tone={TONE[w.status] ?? 'neutral'}>{w.status}</StatusBadge>
                          {w.payoutReference && <p className="text-xs text-slate-500 mt-1 font-mono">{w.payoutReference}</p>}
                          {w.status === 'REJECTED' && w.decisionNote && <p className="text-xs text-rose-700 mt-1 max-w-[220px]">{w.decisionNote}</p>}
                        </Td>
                        <Td right>{actions(w)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableScroll>
              )}
              list={items.map((w) => (
                <MobileRow
                  key={w.id}
                  title={w.user.name}
                  subtitle={<>{formatDateTime(w.createdAt)} · {w.payoutLabel}</>}
                  value={<span className="text-slate-900">{formatMoneyMinor(w.amountMinor, w.currency)}</span>}
                  meta={<><StatusBadge tone={TONE[w.status] ?? 'neutral'}>{w.status}</StatusBadge>{changedFlag(w)}{w.payoutReference && <span className="text-xs font-mono text-slate-500">{w.payoutReference}</span>}</>}
                  actions={actions(w)}
                />
              ))}
            />
          )}
          <LoadMore visible={Boolean(cursor)} loading={more} onClick={() => void loadMore()} />
        </Card>
      )}

      {revealing && (
        <Modal title="Payout account" onClose={() => setRevealing(null)}>
          <p className="text-sm text-slate-600">
            {formatMoneyMinor(revealing.row.amountMinor, revealing.row.currency)} to {revealing.row.user.name}. This view is recorded in the audit trail.
          </p>
          {recentlyChanged(revealing.row) && (
            <p className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              These details were changed on {formatDateTime(revealing.row.payoutMethodChangedAt)}, close to this request. Confirm with the advisor before paying.
            </p>
          )}
          {revealing.error ? (
            <p role="alert" className="text-sm text-rose-700">{revealing.error}</p>
          ) : !revealing.details ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : revealing.details.method === 'UPI' ? (
            <DetailRow label="UPI ID" value={revealing.details.upiId} mono />
          ) : (
            <div className="space-y-2">
              <DetailRow label="Account holder" value={revealing.details.accountHolder} />
              <DetailRow label="Account number" value={revealing.details.accountNumber} mono />
              <DetailRow label="IFSC" value={revealing.details.ifsc} mono />
            </div>
          )}
        </Modal>
      )}

      {paying && (
        <Modal title="Mark as paid" onClose={() => setPaying(null)} busy={busyId === paying.id}>
          <form onSubmit={markPaid} className="space-y-3">
            <p className="text-sm text-slate-600">
              Record the payment of <span className="font-bold text-slate-900">{formatMoneyMinor(paying.amountMinor, paying.currency)}</span> to {paying.payoutLabel}. The advisor sees the reference.
            </p>
            <label className="block">
              <span className="text-label text-slate-500">UTR / UPI reference</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={cn(inputClass, 'mt-1 font-mono')} placeholder="e.g. 412345678901" autoComplete="off" data-testid="withdrawal-reference" />
            </label>
            <label className="block">
              <span className="text-label text-slate-500">Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={cn(inputClass, 'mt-1')} placeholder="e.g. IMPS from HDFC current account" autoComplete="off" maxLength={500} />
            </label>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setPaying(null)} disabled={busyId === paying.id} className="flex-1 py-2.5 rounded-full border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={busyId === paying.id || reference.trim().length < 4} className="flex-1 py-2.5 rounded-full bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2" data-testid="withdrawal-paid-confirm">
                {busyId === paying.id && <Loader2 size={14} className="animate-spin" />} Mark paid
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ReasonDialog
        open={Boolean(rejecting)}
        title="Reject withdrawal"
        description={rejecting ? `${formatMoneyMinor(rejecting.amountMinor, rejecting.currency)} for ${rejecting.user.name}. The ${rejecting.coins.toLocaleString('en-IN')} coins go back to the advisor's wallet, and they see your reason.` : ''}
        confirmLabel="Reject and return coins"
        danger
        onCancel={() => setRejecting(null)}
        onConfirm={reject}
      />
    </div>
  );
};

export default FinanceWithdrawalsTab;
