import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, BadgeIndianRupee, CalendarCheck, Clock, Hourglass, RefreshCw, TrendingUp } from 'lucide-react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeaderCard } from '@/app/components/ui/PageHeader';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { describeApiFailure, failureText } from '@/lib/apiFailure';
import { syncServerClock } from '@/hooks/useServerClock';
import { EarningsSummary, LEDGER_LABELS, walletService } from '@/services/walletService';

/**
 * Advisor earnings. Every figure is the server's ledger: an earning exists only
 * as a row tied to a paid, completed session, and the advisor has no way to
 * change any of it from here. Clients are not identified — a session reference
 * is enough to trace an earning.
 */

const sessionRef = (bookingId: string | null) => (bookingId ? `#${bookingId.slice(0, 8).toUpperCase()}` : '—');

export const AdvisorEarnings: React.FC = () => {
  const { setCurrentPage } = useApp();
  const [data, setData] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await walletService.getEarnings();
      syncServerClock(summary.serverNow);
      setData(summary);
    } catch (err) {
      setError(failureText(await describeApiFailure(err, 'Earnings could not be loaded.')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cards = [
    { label: 'Available balance', value: data?.availableBalance, icon: BadgeIndianRupee, accent: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pending (held)', value: data?.pendingBalance, icon: Hourglass, accent: 'text-amber-600 bg-amber-50' },
    { label: 'Earned today', value: data?.earned.today, icon: Clock, accent: 'text-indigo-600 bg-indigo-50' },
    { label: 'This week', value: data?.earned.week, icon: TrendingUp, accent: 'text-violet-600 bg-violet-50' },
    { label: 'This month', value: data?.earned.month, icon: TrendingUp, accent: 'text-violet-600 bg-violet-50' },
    { label: 'Total earned', value: data?.earned.total, icon: CalendarCheck, accent: 'text-slate-700 bg-slate-100' },
  ];

  return (
    <CenteredLayout onRefresh={load}>
      <div className="w-full space-y-6 pb-12">
        <PageHeaderCard title="Earnings" subtitle="Coins earned from completed sessions" icon={<BadgeIndianRupee className="w-5 h-5" />}>
          <button
            type="button"
            onClick={() => setCurrentPage('wallet')}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-sm font-bold text-white hover:bg-black"
            data-testid="earnings-withdraw"
          >
            <ArrowDownLeft size={14} /> Withdraw
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            data-testid="earnings-refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </PageHeaderCard>

        {error && (
          <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p className="text-body-sm flex-1">{error}</p>
            <button type="button" onClick={() => void load()} className="text-sm font-bold underline">Retry</button>
          </div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" aria-label="Earnings summary">
          {cards.map(({ label, value, icon: Icon, accent }) => (
            <div key={label} className="p-4 sm:p-5 rounded-[24px] bg-white border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] min-w-0">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-2', accent)}>
                <Icon size={16} />
              </div>
              <p className="text-label text-slate-400 truncate">{label}</p>
              {loading && !data
                ? <div className="h-7 w-20 mt-1 rounded-lg bg-slate-100 animate-pulse" />
                : <p className="text-fin-md text-slate-900">{(value ?? 0).toLocaleString('en-IN')}</p>}
            </div>
          ))}
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4" aria-label="Sessions">
          <div className="p-4 sm:p-5 rounded-[24px] bg-white border border-slate-100">
            <p className="text-label text-slate-400">Completed sessions</p>
            <p className="text-fin-md text-slate-900">{data?.completedSessions ?? 0}</p>
          </div>
          <div className="p-4 sm:p-5 rounded-[24px] bg-white border border-slate-100">
            <p className="text-label text-slate-400">Paid, upcoming</p>
            <p className="text-fin-md text-slate-900">{data?.upcomingPaidSessions ?? 0}</p>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="earnings-history-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="earnings-history-heading" className="text-section-title text-slate-900">Recent earnings</h2>
            <button type="button" onClick={() => setCurrentPage('wallet')} className="text-sm font-bold text-violet-700 hover:underline">
              Full history
            </button>
          </div>
          <div className="rounded-[24px] bg-white border border-slate-100 overflow-hidden">
            {!data || data.recent.length === 0 ? (
              <p className="p-8 text-center text-body text-slate-500">{loading ? 'Loading…' : 'No earnings yet. Earnings appear here when a paid session is completed.'}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recent.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">Session {sessionRef(row.bookingId)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Client •••••• · {LEDGER_LABELS[row.type] ?? row.type}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(row.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn('text-fin-xs', row.amount < 0 ? 'text-rose-600' : 'text-slate-900')}>
                        {row.amount > 0 ? '+' : ''}{row.amount.toLocaleString('en-IN')}
                      </span>
                      <span className={cn(
                        'px-2.5 py-0.5 rounded-full border text-2xs font-bold',
                        row.bucket === 'PENDING' ? 'bg-amber-50 text-amber-800 border-amber-200' : row.amount < 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      )}>
                        {row.bucket === 'PENDING' ? 'Pending' : row.amount < 0 ? 'Reversed' : 'Completed'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-caption text-slate-500">
            Earnings are held as pending until the session is completed, then move to your available balance. Refunds for cancelled sessions reverse the matching earning.
            Released earnings can be withdrawn to your UPI ID or bank account from the Wallet (minimum 300 coins, 1 coin = ₹1).
          </p>
        </section>
      </div>
    </CenteredLayout>
  );
};
