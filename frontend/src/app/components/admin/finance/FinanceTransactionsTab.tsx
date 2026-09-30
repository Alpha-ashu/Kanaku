import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeApiFailure, type ApiFailure } from '@/lib/apiFailure';
import { AdminLedgerEntry, LEDGER_LABELS, LedgerType, financeService } from '@/services/walletService';
import { Card, EmptyState, FailureBanner, LoadMore, LoadingRows, MobileRow, ResponsiveRows, StatusBadge, TableScroll, Td, Th, formatDateTime, inputClass } from './financeUi';

/** Every ledger row, searchable. Read-only: corrections are adjustments, never edits. */

const TYPES = Object.keys(LEDGER_LABELS) as LedgerType[];

interface Filters {
  userId: string;
  type: string;
  bookingId: string;
  paymentOrderId: string;
  reference: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { userId: '', type: '', bookingId: '', paymentOrderId: '', reference: '', from: '', to: '' };

const toIso = (date: string, endOfDay = false) => (date ? new Date(`${date}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString() : undefined);

export const FinanceTransactionsTab: React.FC<{ initialUserId?: string }> = ({ initialUserId }) => {
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, userId: initialUserId ?? '' });
  const [applied, setApplied] = useState<Filters>({ ...EMPTY, userId: initialUserId ?? '' });
  const [items, setItems] = useState<AdminLedgerEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  // Phones: the seven filters start folded away.
  const [showFilters, setShowFilters] = useState(false);

  const fetchPage = useCallback(async (f: Filters, after: string | null) => {
    const page = await financeService.transactions({
      userId: f.userId.trim(),
      type: f.type,
      bookingId: f.bookingId.trim(),
      paymentOrderId: f.paymentOrderId.trim(),
      reference: f.reference.trim(),
      from: toIso(f.from),
      to: toIso(f.to, true),
      cursor: after,
      limit: 25,
    });
    setItems((prev) => (after ? [...prev, ...page.items] : page.items));
    setCursor(page.nextCursor);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      await fetchPage(applied, null);
    } catch (err) {
      setFailure(await describeApiFailure(err, 'Transactions could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [applied, fetchPage]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    setMore(true);
    try {
      await fetchPage(applied, cursor);
    } catch (err) {
      setFailure(await describeApiFailure(err, 'More transactions could not be loaded.'));
    } finally {
      setMore(false);
    }
  };

  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => setShowFilters((v) => !v)} className="md:hidden w-full py-2.5 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700" aria-expanded={showFilters}>
        {showFilters ? 'Hide filters' : 'Filters'}
      </button>
      <Card className={cn('p-4', !showFilters && 'hidden md:block')}>
        <form
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}
        >
          <input className={inputClass} placeholder="User ID" value={filters.userId} onChange={set('userId')} aria-label="User ID" />
          <select className={inputClass} value={filters.type} onChange={set('type')} aria-label="Type">
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{LEDGER_LABELS[t]}</option>)}
          </select>
          <input className={inputClass} placeholder="Booking ID" value={filters.bookingId} onChange={set('bookingId')} aria-label="Booking ID" />
          <input className={inputClass} placeholder="Payment order ID" value={filters.paymentOrderId} onChange={set('paymentOrderId')} aria-label="Payment order ID" />
          <input className={inputClass} placeholder="Reference contains" value={filters.reference} onChange={set('reference')} aria-label="Reference" />
          <input className={inputClass} type="date" value={filters.from} onChange={set('from')} aria-label="From date" />
          <input className={inputClass} type="date" value={filters.to} onChange={set('to')} aria-label="To date" />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 py-2.5 rounded-full bg-slate-900 hover:bg-black text-white text-sm font-bold flex items-center justify-center gap-2" data-testid="finance-tx-search">
              <Search size={14} /> Search
            </button>
            <button type="button" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); }} className="px-4 py-2.5 rounded-full border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Clear</button>
          </div>
        </form>
      </Card>

      <FailureBanner failure={failure} onRetry={load} />

      <Card className="overflow-hidden">
        {loading ? <LoadingRows /> : items.length === 0 ? <EmptyState message="No transactions match these filters." /> : (
          <ResponsiveRows
            list={items.map((t) => (
              <MobileRow
                key={t.id}
                title={`${LEDGER_LABELS[t.type] ?? t.type}${t.bucket === 'PENDING' ? ' (held)' : ''}`}
                subtitle={<>{t.user.name} · {formatDateTime(t.createdAt)}<span className="block">{t.reason || t.description}</span></>}
                value={<span className={t.amount > 0 ? 'text-emerald-600' : 'text-slate-900'}>{t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('en-IN')}</span>}
                meta={<><StatusBadge tone="neutral">Balance {t.availableAfter.toLocaleString('en-IN')}</StatusBadge><span className="font-mono text-2xs text-slate-400 truncate max-w-full">{t.reference}</span></>}
              />
            ))}
            table={(
          <TableScroll>
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr><Th>Date</Th><Th>User</Th><Th>Type</Th><Th>Details</Th><Th right>Amount</Th><Th right>Balance after</Th><Th>Reference</Th></tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0">
                  <Td className="whitespace-nowrap">{formatDateTime(t.createdAt)}</Td>
                  <Td>
                    <span className="font-bold text-slate-900 block truncate max-w-[180px]">{t.user.name}</span>
                    <span className="text-caption text-slate-500 block truncate max-w-[180px]">{t.user.email || t.userId}</span>
                  </Td>
                  <Td className="whitespace-nowrap font-bold">{LEDGER_LABELS[t.type] ?? t.type}{t.bucket === 'PENDING' && <span className="text-2xs text-slate-400"> · pending</span>}</Td>
                  <Td className="max-w-[240px]" title={t.reason || t.description}>
                    <span className="line-clamp-2">{t.reason || t.description}</span>
                    {t.actorRole && t.type === 'ADMIN_ADJUSTMENT' && <span className="text-caption text-slate-400 block">by {t.actorRole}</span>}
                  </Td>
                  <Td right className={cn('whitespace-nowrap font-bold', t.amount > 0 ? 'text-emerald-600' : 'text-slate-900')}>{t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('en-IN')}</Td>
                  <Td right className="whitespace-nowrap">{t.availableAfter.toLocaleString('en-IN')}{t.pendingAfter ? <span className="text-caption text-slate-400"> / {t.pendingAfter} held</span> : null}</Td>
                  <Td className="font-mono text-caption text-slate-500 max-w-[200px] truncate" title={t.reference}>{t.reference}</Td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
            )}
          />
        )}
        <LoadMore visible={Boolean(cursor) && !loading} loading={more} onClick={() => void loadMore()} />
      </Card>
    </div>
  );
};
