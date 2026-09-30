import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Coins, Loader2, Lock, RefreshCw, Wallet as WalletIcon } from 'lucide-react';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { PageHeaderCard } from '@/app/components/ui/PageHeader';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { describeApiFailure, failureText } from '@/lib/apiFailure';
import { syncServerClock } from '@/hooks/useServerClock';
import {
  CoinPackage,
  LEDGER_LABELS,
  LedgerEntry,
  LedgerType,
  ProviderOption,
  PurchaseOrder,
  WalletSummary,
  formatCoins,
  formatMoneyMinor,
  walletService,
} from '@/services/walletService';
import { CoinPurchaseDialog } from './CoinPurchaseDialog';

/**
 * The account holder's coin wallet: balance, buying coins, and every movement.
 *
 * All figures come from the server's ledger. Nothing here is cached as the
 * truth — the balance shown after a purchase is the one the server returned.
 */

const FILTERS: Array<{ id: LedgerType | ''; label: string }> = [
  { id: '', label: 'All' },
  { id: 'PAYMENT_CREDIT', label: 'Purchases' },
  { id: 'SESSION_PAYMENT', label: 'Sessions' },
  { id: 'SESSION_REFUND', label: 'Refunds' },
  { id: 'EARNING_RELEASE', label: 'Earnings' },
  { id: 'ADMIN_ADJUSTMENT', label: 'Adjustments' },
];

const ORDER_BADGE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CREATED: 'bg-amber-50 text-amber-800 border-amber-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  EXPIRED: 'bg-slate-50 text-slate-600 border-slate-200',
  CANCELLED: 'bg-slate-50 text-slate-600 border-slate-200',
  REFUNDED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

const ORDER_LABEL: Record<string, string> = {
  PAID: 'Completed', CREATED: 'Pending', FAILED: 'Failed', EXPIRED: 'Expired', CANCELLED: 'Cancelled', REFUNDED: 'Refunded',
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const WalletPage: React.FC = () => {
  const { setCurrentPage } = useApp();
  const { role } = useAuth();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<LedgerType | ''>('');
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<CoinPackage | null>(null);

  const loadTransactions = useCallback(async (type: LedgerType | '', cursor: string | null) => {
    const page = await walletService.getTransactions({ type, cursor });
    setTransactions((prev) => (cursor ? [...prev, ...page.items] : page.items));
    setNextCursor(page.nextCursor);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, offer, orders] = await Promise.all([
        walletService.getWallet(),
        walletService.getPackages(),
        walletService.listPurchases(),
      ]);
      syncServerClock(summary.serverNow);
      setWallet(summary);
      setPackages(offer.packages);
      setProviders(offer.providers);
      setPurchases(orders.items);
      await loadTransactions(filter, null);
    } catch (err) {
      setError(failureText(await describeApiFailure(err, 'Your wallet could not be loaded.')));
    } finally {
      setLoading(false);
    }
  }, [filter, loadTransactions]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      await loadTransactions(filter, nextCursor);
    } catch (err) {
      setError(failureText(await describeApiFailure(err, 'More transactions could not be loaded.')));
    } finally {
      setLoadingMore(false);
    }
  };

  const onCredited = useCallback((balance: number) => {
    setWallet((prev) => (prev ? { ...prev, availableBalance: balance } : prev));
  }, []);

  const closePurchase = () => {
    setBuying(null);
    void load();
  };

  const frozen = wallet?.status === 'FROZEN';
  const purchasesOn = Boolean(wallet?.purchasesEnabled) && packages.length > 0 && !frozen;

  return (
    <CenteredLayout onRefresh={load}>
      <div className="max-w-5xl mx-auto w-full space-y-6 pb-12">
        <PageHeaderCard
          title="Wallet"
          subtitle="Coins for advisor sessions"
          icon={<WalletIcon className="w-5 h-5" />}
        >
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            data-testid="wallet-refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </PageHeaderCard>

        {error && (
          <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-body font-bold">Something went wrong</p>
              <p className="text-body-sm">{error}</p>
            </div>
            <button type="button" onClick={() => void load()} className="text-sm font-bold underline shrink-0">Retry</button>
          </div>
        )}

        {frozen && (
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900">
            <Lock size={18} className="shrink-0 mt-0.5" />
            <p className="text-body-sm">This wallet is on hold. You cannot spend or buy coins until support reviews it.</p>
          </div>
        )}

        {/* Balances */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-label="Balances">
          <div className="p-5 sm:p-6 rounded-[28px] bg-gradient-to-br from-[#7B4CFF] to-[#4A9EFF] text-white shadow-lg">
            {/* Sized explicitly: .text-label/.text-caption set their own grey, which would override white here. */}
            <p className="text-2xs font-bold uppercase tracking-wider text-white/85">Available coins</p>
            {loading && !wallet ? (
              <div className="h-10 mt-2 w-32 rounded-xl bg-white/20 animate-pulse" />
            ) : (
              <p className="text-fin-xl mt-1" data-testid="wallet-available">{(wallet?.availableBalance ?? 0).toLocaleString('en-IN')}</p>
            )}
            <p className="text-xs font-semibold text-white/85 mt-1">1 coin = {formatMoneyMinor(wallet?.coinValueMinor ?? 100)}</p>
          </div>
          {(role === 'advisor' || (wallet?.pendingBalance ?? 0) > 0) && (
            <div className="p-5 sm:p-6 rounded-[28px] bg-white border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
              <p className="text-label text-slate-400">Pending earnings</p>
              <p className="text-fin-lg text-slate-900 mt-1" data-testid="wallet-pending">{(wallet?.pendingBalance ?? 0).toLocaleString('en-IN')}</p>
              <p className="text-caption text-slate-500 mt-1">Released to your balance when each session is completed.</p>
              {role === 'advisor' && (
                <button type="button" onClick={() => setCurrentPage('advisor-earnings')} className="mt-3 text-sm font-bold text-violet-700 hover:underline">
                  View earnings
                </button>
              )}
            </div>
          )}
        </section>

        {/* Buy coins */}
        <section className="space-y-3" aria-labelledby="buy-coins-heading">
          <h2 id="buy-coins-heading" className="text-section-title text-slate-900">Purchase coins</h2>
          {!loading && !purchasesOn && (
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-body-sm text-slate-600">
              {frozen ? 'Purchases are unavailable while the wallet is on hold.' : 'Coin purchases are not available right now. Please check back later.'}
            </div>
          )}
          {purchasesOn && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setBuying(pkg)}
                  className="text-left p-4 sm:p-5 rounded-[24px] bg-white border border-slate-100 hover:border-violet-300 hover:shadow-lg transition-all flex flex-col gap-2 min-w-0"
                  data-testid={`wallet-package-${pkg.code}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Coins size={16} className="text-violet-600 shrink-0" />
                    <span className="text-card-title text-slate-900 truncate">{pkg.name}</span>
                  </div>
                  <span className="text-fin-md text-slate-900">{pkg.totalCoins.toLocaleString('en-IN')}</span>
                  {pkg.bonusCoins > 0 && (
                    <span className="self-start px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-2xs font-bold">
                      +{pkg.bonusCoins} bonus
                    </span>
                  )}
                  <span className="mt-auto text-body font-bold text-violet-700">{formatMoneyMinor(pkg.priceMinor, pkg.currency)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Transactions */}
        <section className="space-y-3" aria-labelledby="wallet-transactions-heading">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 id="wallet-transactions-heading" className="text-section-title text-slate-900">Recent transactions</h2>
            <div className="flex gap-1.5 overflow-x-auto max-w-full pb-1" role="tablist" aria-label="Filter transactions">
              {FILTERS.map((f) => (
                <button
                  key={f.id || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors',
                    filter === f.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] bg-white border border-slate-100 overflow-hidden">
            {loading && transactions.length === 0 ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-8 text-center">
                <Coins size={28} className="mx-auto text-slate-300" />
                <p className="text-body text-slate-500 mt-2">No transactions yet.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <table className="hidden md:table w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th scope="col" className="px-5 py-3 text-label text-slate-400">Date</th>
                      <th scope="col" className="px-5 py-3 text-label text-slate-400">Type</th>
                      <th scope="col" className="px-5 py-3 text-label text-slate-400">Details</th>
                      <th scope="col" className="px-5 py-3 text-label text-slate-400 text-right">Amount</th>
                      <th scope="col" className="px-5 py-3 text-label text-slate-400 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 text-body-sm text-slate-600 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                        <td className="px-5 py-3 text-body-sm font-bold text-slate-900">{LEDGER_LABELS[t.type] ?? t.type}</td>
                        <td className="px-5 py-3 text-body-sm text-slate-600 max-w-[280px] truncate" title={t.reason || t.description}>{t.reason || t.description}</td>
                        <td className={cn('px-5 py-3 text-fin-xs text-right whitespace-nowrap', t.amount > 0 ? 'text-emerald-600' : 'text-slate-900')}>
                          {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('en-IN')}
                          {t.bucket === 'PENDING' && <span className="ml-1 text-2xs text-slate-400 font-bold">pending</span>}
                        </td>
                        <td className="px-5 py-3 text-body-sm text-slate-500 text-right">{t.availableAfter.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Mobile list */}
                <ul className="md:hidden divide-y divide-slate-100">
                  {transactions.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', t.amount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600')}>
                        {t.amount > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-bold text-slate-900 truncate">{LEDGER_LABELS[t.type] ?? t.type}</p>
                        <p className="text-caption text-slate-500 truncate">{formatDate(t.createdAt)}{t.bucket === 'PENDING' ? ' · pending' : ''}</p>
                      </div>
                      <span className={cn('text-fin-xs shrink-0', t.amount > 0 ? 'text-emerald-600' : 'text-slate-900')}>
                        {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('en-IN')}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          {nextCursor && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="px-5 py-2 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore && <Loader2 size={14} className="animate-spin" />} Load more
              </button>
            </div>
          )}
        </section>

        {/* Purchase history */}
        {purchases.length > 0 && (
          <section className="space-y-3" aria-labelledby="wallet-purchases-heading">
            <h2 id="wallet-purchases-heading" className="text-section-title text-slate-900">Payment history</h2>
            <ul className="rounded-[24px] bg-white border border-slate-100 divide-y divide-slate-100 overflow-hidden">
              {purchases.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-bold text-slate-900">{formatCoins(o.coins)} · {formatMoneyMinor(o.amountMinor, o.currency)}</p>
                    <p className="text-caption text-slate-500 truncate">{formatDate(o.createdAt)} · {o.provider}</p>
                  </div>
                  <span className={cn('px-2.5 py-1 rounded-full border text-2xs font-bold shrink-0', ORDER_BADGE[o.status] ?? ORDER_BADGE.EXPIRED)}>
                    {ORDER_LABEL[o.status] ?? o.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <CoinPurchaseDialog
        pkg={buying}
        provider={providers[0]?.id}
        onClose={closePurchase}
        onCredited={onCredited}
      />
    </CenteredLayout>
  );
};
