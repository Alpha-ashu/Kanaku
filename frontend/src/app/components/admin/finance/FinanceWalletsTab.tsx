import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Lock, Search, ShieldAlert, Unlock, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { describeApiFailure, failureText, type ApiFailure } from '@/lib/apiFailure';
import { AdminLedgerEntry, AdminWalletRow, LEDGER_LABELS, UserRef, financeService, newRequestKey } from '@/services/walletService';
import { Card, EmptyState, FailureBanner, LoadingRows, MobileRow, ORDER_TONE, ReasonDialog, ResponsiveRows, StatusBadge, TableScroll, Td, Th, formatDateTime, inputClass } from './financeUi';

/**
 * Wallets. Balances are read-only; the only way to change one here is an
 * adjustment, which is a new, reasoned, audited ledger row — never an edit.
 */

interface Detail {
  wallet: { availableBalance: number; pendingBalance: number; status: string };
  consistent: boolean;
  user: UserRef | null;
  transactions: AdminLedgerEntry[];
}

export const FinanceWalletsTab: React.FC = () => {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminWalletRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [statusChange, setStatusChange] = useState<'ACTIVE' | 'FROZEN' | null>(null);
  // One key per adjustment attempt: a double-submit applies once.
  const adjustKey = useRef(newRequestKey());

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const res = await financeService.wallets({ search: query.trim(), page, limit: 20 });
      setRows(res.items);
      setTotalPages(Math.max(1, res.totalPages));
    } catch (err) {
      setFailure(await describeApiFailure(err, 'Wallets could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = useCallback(async (userId: string) => {
    setSelected(userId);
    setDetail(null);
    try {
      setDetail(await financeService.walletDetail(userId));
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Wallet could not be loaded.')));
      setSelected(null);
    }
  }, []);

  const submitAdjust = async (reason: string) => {
    if (!selected) return;
    const amount = Number(adjustAmount);
    try {
      await financeService.adjust(selected, amount, reason, adjustKey.current);
      toast.success(`Adjustment of ${amount > 0 ? '+' : ''}${amount} coins recorded.`);
      adjustKey.current = newRequestKey();
      setAdjustAmount('');
      setAdjusting(false);
      await Promise.all([openDetail(selected), load()]);
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Adjustment failed.')));
    }
  };

  const submitStatus = async (reason: string) => {
    if (!selected || !statusChange) return;
    try {
      await financeService.setWalletStatus(selected, statusChange, reason);
      toast.success(statusChange === 'FROZEN' ? 'Wallet frozen.' : 'Wallet reactivated.');
      setStatusChange(null);
      await Promise.all([openDetail(selected), load()]);
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Status change failed.')));
    }
  };

  const amountValid = /^-?\d+$/.test(adjustAmount.trim()) && Number(adjustAmount) !== 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form className="flex flex-col sm:flex-row gap-3" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search); }}>
          <input className={inputClass} placeholder="Search by name, email or user ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search wallets" />
          <button type="submit" className="px-6 py-2.5 rounded-full bg-slate-900 hover:bg-black text-white text-sm font-bold flex items-center justify-center gap-2">
            <Search size={14} /> Search
          </button>
        </form>
      </Card>

      <FailureBanner failure={failure} onRetry={load} />

      <Card className="overflow-hidden">
        {loading ? <LoadingRows /> : rows.length === 0 ? <EmptyState message="No wallets found." /> : (
          <ResponsiveRows
            list={rows.map((w) => (
              <MobileRow
                key={w.userId}
                title={w.user.name}
                subtitle={`${w.user.email} · ${w.user.role}`}
                value={w.availableBalance.toLocaleString('en-IN')}
                meta={<><StatusBadge tone={ORDER_TONE[w.status] ?? 'neutral'}>{w.status}</StatusBadge>{w.pendingBalance > 0 && <StatusBadge tone="warning">{w.pendingBalance.toLocaleString('en-IN')} held</StatusBadge>}</>}
                actions={<button type="button" onClick={() => void openDetail(w.userId)} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700">Open wallet</button>}
              />
            ))}
            table={(
          <TableScroll>
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr><Th>User</Th><Th right>Available</Th><Th right>Held</Th><Th>Status</Th><Th>Updated</Th><Th right>{''}</Th></tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.userId} className="border-b border-slate-50 last:border-0">
                  <Td>
                    <span className="font-bold text-slate-900 block truncate max-w-[220px]">{w.user.name}</span>
                    <span className="text-caption text-slate-500 block truncate max-w-[220px]">{w.user.email} · {w.user.role}</span>
                  </Td>
                  <Td right className="font-bold">{w.availableBalance.toLocaleString('en-IN')}</Td>
                  <Td right>{w.pendingBalance.toLocaleString('en-IN')}</Td>
                  <Td><StatusBadge tone={ORDER_TONE[w.status] ?? 'neutral'}>{w.status}</StatusBadge></Td>
                  <Td className="whitespace-nowrap">{formatDateTime(w.updatedAt)}</Td>
                  <Td right>
                    <button type="button" onClick={() => void openDetail(w.userId)} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50" data-testid={`finance-wallet-open-${w.userId}`}>
                      Open
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
            )}
          />
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-slate-100 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-4 py-1.5 rounded-full border border-slate-200 font-bold disabled:opacity-40">Previous</button>
            <span className="text-body-sm text-slate-500">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-4 py-1.5 rounded-full border border-slate-200 font-bold disabled:opacity-40">Next</button>
          </div>
        )}
      </Card>

      {selected && (
        <div className="fixed inset-0 z-[110] flex justify-end bg-slate-950/40" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <aside role="dialog" aria-modal="true" aria-label="Wallet detail" className="w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-card-title text-slate-900 truncate">{detail?.user?.name ?? 'Wallet'}</p>
                <p className="text-caption text-slate-500 truncate">{detail?.user?.email ?? selected}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500" aria-label="Close"><X size={18} /></button>
            </div>
            {!detail ? <LoadingRows /> : (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-label text-slate-400">Available</p>
                    <p className="text-fin-md text-slate-900">{detail.wallet.availableBalance.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-label text-slate-400">Held</p>
                    <p className="text-fin-md text-slate-900">{detail.wallet.pendingBalance.toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <p className={cn('text-body-sm flex items-center gap-2', detail.consistent ? 'text-emerald-700' : 'text-rose-700')}>
                  {detail.consistent ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
                  {detail.consistent ? 'Balance matches the ledger.' : 'Balance does NOT match the ledger — investigate before adjusting.'}
                </p>

                <div className="space-y-2">
                  <p className="text-label text-slate-500">Adjust balance</p>
                  <div className="flex gap-2">
                    <input className={inputClass} inputMode="numeric" placeholder="e.g. 50 or -20" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} aria-label="Adjustment coins" data-testid="finance-adjust-amount" />
                    <button type="button" disabled={!amountValid} onClick={() => setAdjusting(true)} className="px-5 rounded-full bg-slate-900 hover:bg-black text-white text-sm font-bold disabled:opacity-40" data-testid="finance-adjust-open">
                      Adjust
                    </button>
                  </div>
                  <p className="text-caption text-slate-500">Creates a new ledger entry with your name and reason. Existing entries are never edited.</p>
                </div>

                <div className="flex gap-2">
                  {detail.wallet.status === 'FROZEN' ? (
                    <button type="button" onClick={() => setStatusChange('ACTIVE')} className="px-4 py-2 rounded-full border border-emerald-200 text-emerald-700 text-sm font-bold hover:bg-emerald-50 flex items-center gap-2"><Unlock size={14} /> Reactivate wallet</button>
                  ) : (
                    <button type="button" onClick={() => setStatusChange('FROZEN')} className="px-4 py-2 rounded-full border border-rose-200 text-rose-700 text-sm font-bold hover:bg-rose-50 flex items-center gap-2"><Lock size={14} /> Freeze wallet</button>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-label text-slate-500">Recent ledger</p>
                  <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
                    {detail.transactions.length === 0 && <li className="p-4 text-body-sm text-slate-500">No transactions.</li>}
                    {detail.transactions.map((t) => (
                      <li key={t.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-body-sm font-bold text-slate-900 truncate">{LEDGER_LABELS[t.type] ?? t.type}{t.bucket === 'PENDING' ? ' (held)' : ''}</p>
                          <p className="text-caption text-slate-500 truncate">{formatDateTime(t.createdAt)} · {t.reason || t.description}</p>
                        </div>
                        <span className={cn('text-fin-xs shrink-0', t.amount > 0 ? 'text-emerald-600' : 'text-slate-900')}>{t.amount > 0 ? '+' : ''}{t.amount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <ReasonDialog
        open={adjusting}
        title={`Adjust by ${Number(adjustAmount) > 0 ? '+' : ''}${adjustAmount} coins?`}
        description="This posts an ADMIN_ADJUSTMENT ledger entry. It cannot be edited or deleted afterwards — a mistake is corrected by another adjustment."
        confirmLabel="Record adjustment"
        onCancel={() => setAdjusting(false)}
        onConfirm={submitAdjust}
      />
      <ReasonDialog
        open={Boolean(statusChange)}
        title={statusChange === 'FROZEN' ? 'Freeze this wallet?' : 'Reactivate this wallet?'}
        description={statusChange === 'FROZEN' ? 'The user will not be able to spend or buy coins. Refunds and credits still arrive.' : 'The user will be able to spend coins again.'}
        confirmLabel={statusChange === 'FROZEN' ? 'Freeze' : 'Reactivate'}
        danger={statusChange === 'FROZEN'}
        onCancel={() => setStatusChange(null)}
        onConfirm={submitStatus}
      />
    </div>
  );
};
