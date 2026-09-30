import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { describeApiFailure, failureText, type ApiFailure } from '@/lib/apiFailure';
import { AdminOrder, financeService, formatCoins, formatMoneyMinor } from '@/services/walletService';
import { Card, EmptyState, FailureBanner, LoadMore, LoadingRows, MobileRow, ORDER_TONE, ReasonDialog, ResponsiveRows, StatusBadge, TableScroll, Td, Th, formatDateTime, inputClass } from './financeUi';

/**
 * Coin purchase orders. "Reconcile" asks the provider what happened (it never
 * marks anything paid by itself); "Refund" takes the coins back first and then
 * returns the money through the provider.
 */

const STATUSES = ['', 'CREATED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'];

export const FinancePaymentsTab: React.FC = () => {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ status: '', search: '' });
  const [items, setItems] = useState<AdminOrder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<AdminOrder | null>(null);

  const fetchPage = useCallback(async (after: string | null) => {
    const page = await financeService.orders({ status: query.status, search: query.search.trim(), cursor: after, limit: 25 });
    setItems((prev) => (after ? [...prev, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      await fetchPage(null);
    } catch (err) {
      setFailure(await describeApiFailure(err, 'Payment orders could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { void load(); }, [load]);

  const reconcile = async (order: AdminOrder) => {
    setBusyId(order.id);
    try {
      const { order: after } = await financeService.reconcileOrder(order.id);
      toast.success(`Order is ${after.status.toLowerCase()} according to the provider.`);
      await load();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Reconciliation failed.')));
    } finally {
      setBusyId(null);
    }
  };

  const refund = async (reason: string) => {
    if (!refunding) return;
    try {
      await financeService.refundOrder(refunding.id, reason);
      toast.success('Refund issued and coins reversed.');
      setRefunding(null);
      await load();
    } catch (err) {
      toast.error(failureText(await describeApiFailure(err, 'Refund failed.')));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form className="grid grid-cols-1 sm:grid-cols-3 gap-3" onSubmit={(e) => { e.preventDefault(); setQuery({ status, search }); }}>
          <input className={inputClass} placeholder="Email, name, order or payment ID" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search orders" />
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            {STATUSES.map((s) => <option key={s || 'all'} value={s}>{s || 'All statuses'}</option>)}
          </select>
          <button type="submit" className="py-2.5 rounded-full bg-slate-900 hover:bg-black text-white text-sm font-bold flex items-center justify-center gap-2" data-testid="finance-orders-search">
            <Search size={14} /> Search
          </button>
        </form>
      </Card>

      <FailureBanner failure={failure} onRetry={load} />

      <Card className="overflow-hidden">
        {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState message="No payment orders found." /> : (
          <ResponsiveRows
            list={items.map((o) => (
              <MobileRow
                key={o.id}
                title={o.user.name}
                subtitle={<>{o.package.name} · {formatCoins(o.coins)} · {formatDateTime(o.createdAt)}{o.failureReason && <span className="block text-rose-600">{o.failureReason}</span>}</>}
                value={formatMoneyMinor(o.amountMinor, o.currency)}
                meta={<><StatusBadge tone={ORDER_TONE[o.status] ?? 'neutral'}>{o.status}</StatusBadge><StatusBadge tone="neutral">{o.provider}</StatusBadge>{o.verifiedVia && <StatusBadge tone="neutral">via {o.verifiedVia}</StatusBadge>}</>}
                actions={(
                  <>
                    {!o.creditedAt && o.status !== 'REFUNDED' && (
                      <button type="button" onClick={() => void reconcile(o)} disabled={busyId === o.id} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-50 flex items-center gap-1">
                        <RefreshCw size={12} className={busyId === o.id ? 'animate-spin' : ''} /> Check
                      </button>
                    )}
                    {o.status === 'PAID' && (
                      <button type="button" onClick={() => setRefunding(o)} className="px-3 py-1.5 rounded-full border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-1">
                        <Undo2 size={12} /> Refund
                      </button>
                    )}
                  </>
                )}
              />
            ))}
            table={(
          <TableScroll>
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr><Th>Created</Th><Th>User</Th><Th>Package</Th><Th right>Amount</Th><Th>Status</Th><Th>Provider</Th><Th right>Actions</Th></tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id} className="border-b border-slate-50 last:border-0">
                  <Td className="whitespace-nowrap">{formatDateTime(o.createdAt)}</Td>
                  <Td>
                    <span className="font-bold text-slate-900 block truncate max-w-[180px]">{o.user.name}</span>
                    <span className="text-caption text-slate-500 block truncate max-w-[180px]">{o.user.email}</span>
                  </Td>
                  <Td>{o.package.name} · {formatCoins(o.coins)}</Td>
                  <Td right className="whitespace-nowrap font-bold">{formatMoneyMinor(o.amountMinor, o.currency)}</Td>
                  <Td>
                    <StatusBadge tone={ORDER_TONE[o.status] ?? 'neutral'}>{o.status}</StatusBadge>
                    {o.failureReason && <span className="block text-xs font-semibold text-rose-600 mt-1 max-w-[200px]">{o.failureReason}</span>}
                    {o.verifiedVia && <span className="block text-caption text-slate-400 mt-1">via {o.verifiedVia}</span>}
                  </Td>
                  <Td>
                    <span className="block">{o.provider}</span>
                    <span className="block font-mono text-caption text-slate-400 truncate max-w-[160px]" title={o.providerPaymentId ?? o.providerOrderId ?? ''}>{o.providerPaymentId ?? o.providerOrderId ?? '—'}</span>
                  </Td>
                  <Td right>
                    <div className="flex justify-end gap-2">
                      {!o.creditedAt && o.status !== 'REFUNDED' && (
                        <button type="button" onClick={() => void reconcile(o)} disabled={busyId === o.id} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1" title="Ask the provider for this order's status">
                          <RefreshCw size={12} className={busyId === o.id ? 'animate-spin' : ''} /> Check
                        </button>
                      )}
                      {o.status === 'PAID' && (
                        <button type="button" onClick={() => setRefunding(o)} className="px-3 py-1.5 rounded-full border border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-50 flex items-center gap-1">
                          <Undo2 size={12} /> Refund
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
            )}
          />
        )}
        <LoadMore visible={Boolean(cursor) && !loading} loading={more} onClick={() => {
          setMore(true);
          void fetchPage(cursor).catch(async (err) => setFailure(await describeApiFailure(err, 'More orders could not be loaded.'))).finally(() => setMore(false));
        }} />
      </Card>

      <ReasonDialog
        open={Boolean(refunding)}
        title="Refund this purchase?"
        description={refunding ? `${formatCoins(refunding.coins)} will be removed from ${refunding.user.name}'s wallet, then ${formatMoneyMinor(refunding.amountMinor, refunding.currency)} returned through ${refunding.provider}. If the coins were already spent, nothing is refunded.` : ''}
        confirmLabel="Refund"
        danger
        onCancel={() => setRefunding(null)}
        onConfirm={refund}
      />
    </div>
  );
};
