import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownLeft, Banknote, CalendarCheck, Hourglass, IndianRupee, Loader2, Lock, Plus, RefreshCw, RotateCcw,
  SlidersHorizontal, Sparkles, TrendingUp, Undo2, Wallet as WalletIcon,
} from 'lucide-react';
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
  WithdrawalOverview,
  announceWalletChange,
  coinsToMinor,
  formatCoins,
  formatMoneyMinor,
  walletService,
} from '@/services/walletService';
import { CoinPurchaseDialog } from './CoinPurchaseDialog';
import { CoinMark } from './CoinMark';
import { WithdrawPanel } from './WithdrawPanel';
import { takePendingPurchase } from '@/lib/pendingPurchase';

/**
 * The account holder's coin wallet: balance, buying coins, advisor
 * withdrawals, and every movement.
 *
 * All figures come from the server's ledger. Nothing here is cached as the
 * truth — the balance shown after a purchase is the one the server returned.
 */

const BASE_FILTERS: Array<{ id: LedgerType | ''; label: string }> = [
  { id: '', label: 'All' },
  { id: 'PAYMENT_CREDIT', label: 'Purchases' },
  { id: 'SESSION_PAYMENT', label: 'Sessions' },
  { id: 'SESSION_REFUND', label: 'Refunds' },
  { id: 'EARNING_RELEASE', label: 'Earnings' },
  { id: 'ADMIN_ADJUSTMENT', label: 'Adjustments' },
];

/** Icon and colour per ledger movement, so the list reads at a glance. */
const ENTRY_STYLE: Record<LedgerType, { icon: React.ElementType; tone: string }> = {
  PAYMENT_CREDIT: { icon: IndianRupee, tone: 'bg-amber-50 text-amber-600' },
  SESSION_PAYMENT: { icon: CalendarCheck, tone: 'bg-violet-50 text-violet-600' },
  SESSION_EARNING: { icon: Hourglass, tone: 'bg-amber-50 text-amber-600' },
  EARNING_RELEASE: { icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-600' },
  SESSION_REFUND: { icon: RotateCcw, tone: 'bg-sky-50 text-sky-600' },
  EARNING_REVERSAL: { icon: RotateCcw, tone: 'bg-rose-50 text-rose-600' },
  PURCHASE_REVERSAL: { icon: RotateCcw, tone: 'bg-rose-50 text-rose-600' },
  ADMIN_ADJUSTMENT: { icon: SlidersHorizontal, tone: 'bg-slate-100 text-slate-600' },
  WITHDRAWAL: { icon: Banknote, tone: 'bg-indigo-50 text-indigo-600' },
  WITHDRAWAL_REVERSAL: { icon: Undo2, tone: 'bg-sky-50 text-sky-600' },
};

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

const cardClass = 'rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.10)]';

const scrollToSection = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const WalletPage: React.FC = () => {
  const { setCurrentPage } = useApp();
  const { role, user } = useAuth();
  const isAdvisor = role === 'advisor';
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<LedgerType | ''>('');
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalOverview | null>(null);
  const [withdrawalsError, setWithdrawalsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<CoinPackage | null>(null);
  const [payWith, setPayWith] = useState<string | undefined>(undefined);
  // Back from a redirect gateway (PhonePe / Paytm): show that order's outcome.
  const [resumeOrderId, setResumeOrderId] = useState<string | null>(() => takePendingPurchase());

  const filters = useMemo(
    () => (isAdvisor ? [...BASE_FILTERS, { id: 'WITHDRAWAL' as const, label: 'Withdrawals' }] : BASE_FILTERS),
    [isAdvisor],
  );

  const loadTransactions = useCallback(async (type: LedgerType | '', cursor: string | null) => {
    const page = await walletService.getTransactions({ type, cursor });
    setTransactions((prev) => (cursor ? [...prev, ...page.items] : page.items));
    setNextCursor(page.nextCursor);
  }, []);

  // Withdrawals load on their own: a failure there must not blank the wallet.
  const loadWithdrawals = useCallback(async () => {
    if (!isAdvisor) return;
    setWithdrawalsError(null);
    try {
      setWithdrawals(await walletService.getWithdrawals());
    } catch (err) {
      setWithdrawalsError(failureText(await describeApiFailure(err, 'Withdrawals could not be loaded.')));
    }
  }, [isAdvisor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, offer, orders] = await Promise.all([
        walletService.getWallet(),
        walletService.getPackages(),
        walletService.listPurchases(),
        loadWithdrawals(),
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
  }, [filter, loadTransactions, loadWithdrawals]);

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
    announceWalletChange();
  }, []);

  const closePurchase = () => {
    setBuying(null);
    setResumeOrderId(null);
    void load();
  };

  const selectedProvider = providers.some((p) => p.id === payWith) ? payWith : providers[0]?.id;

  const frozen = wallet?.status === 'FROZEN';
  const purchasesOn = Boolean(wallet?.purchasesEnabled) && packages.length > 0 && !frozen;
  const coinValue = wallet?.coinValueMinor ?? 100;
  const available = wallet?.availableBalance ?? 0;
  const pending = wallet?.pendingBalance ?? 0;

  // Most coins per rupee — a fact about the packages, not a recommendation.
  const bestValueId = useMemo(() => {
    if (packages.length < 2) return null;
    const ratio = (p: CoinPackage) => p.totalCoins / p.priceMinor;
    const best = packages.reduce((a, b) => (ratio(b) > ratio(a) ? b : a));
    return packages.filter((p) => ratio(p) === ratio(best)).length === 1 ? best.id : null;
  }, [packages]);

  return (
    <CenteredLayout onRefresh={load}>
      <div className="max-w-5xl mx-auto w-full space-y-6 pb-12">
        <PageHeaderCard
          title="Wallet"
          subtitle="KANAKU coins for advisor sessions"
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
              <p className="text-sm font-bold">Something went wrong</p>
              <p className="text-sm">{error}</p>
            </div>
            <button type="button" onClick={() => void load()} className="text-sm font-bold underline shrink-0">Retry</button>
          </div>
        )}

        {frozen && (
          <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900">
            <Lock size={18} className="shrink-0 mt-0.5" />
            <p className="text-sm">This wallet is on hold. You cannot spend, buy or withdraw coins until support reviews it.</p>
          </div>
        )}

        {/* Balance */}
        <section
          aria-label="Balance"
          className="relative overflow-hidden rounded-[24px] sm:rounded-[28px] bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 p-5 sm:p-7 text-white shadow-[0_18px_40px_-18px_rgba(109,40,217,0.65)]"
        >
          <span className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
          <span className="pointer-events-none absolute -left-16 -bottom-20 h-48 w-48 rounded-full bg-indigo-300/20 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* Sized explicitly: .text-label/.text-caption set their own grey, which would override white here. */}
              <p className="text-xs sm:text-sm font-semibold text-white/75">Available coins</p>
              {loading && !wallet ? (
                <div className="h-10 sm:h-12 mt-1 w-36 rounded-xl bg-white/20 animate-pulse" />
              ) : (
                <p className="mt-0.5 flex items-center gap-2 text-4xl sm:text-5xl font-black tracking-tight tabular-nums" data-testid="wallet-available">
                  {available.toLocaleString('en-IN')}
                </p>
              )}
              <p className="text-xs sm:text-sm font-medium text-white/75 mt-1">
                Worth {formatMoneyMinor(coinsToMinor(available, coinValue))} · 1 coin = {formatMoneyMinor(coinValue)}
              </p>
            </div>
            <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border border-white/25 bg-white/15 flex items-center justify-center shrink-0">
              <CoinMark size="lg" />
            </span>
          </div>

          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            {(isAdvisor || pending > 0) && (
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold" data-testid="wallet-pending">
                {pending.toLocaleString('en-IN')} pending earnings
              </span>
            )}
            {isAdvisor && withdrawals && (
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                {withdrawals.withdrawableCoins.toLocaleString('en-IN')} withdrawable
              </span>
            )}
            {withdrawals?.open && (
              <span className="rounded-full bg-amber-300/30 px-3 py-1 text-xs font-bold">
                {withdrawals.open.coins.toLocaleString('en-IN')} in withdrawal
              </span>
            )}
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2">
            {purchasesOn && (
              <button
                type="button"
                onClick={() => scrollToSection('buy-coins')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white text-sm font-bold text-violet-700 shadow-sm hover:bg-violet-50 active:scale-95 transition"
                data-testid="wallet-buy-cta"
              >
                <Plus size={15} /> Buy coins
              </button>
            )}
            {isAdvisor && (
              <>
                <button
                  type="button"
                  onClick={() => scrollToSection('withdraw')}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/15 border border-white/25 text-sm font-bold text-white hover:bg-white/25 active:scale-95 transition"
                  data-testid="wallet-withdraw-cta"
                >
                  <ArrowDownLeft size={15} /> Withdraw
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage('advisor-earnings')}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/15 border border-white/25 text-sm font-bold text-white hover:bg-white/25 active:scale-95 transition"
                >
                  <TrendingUp size={15} /> Earnings
                </button>
              </>
            )}
          </div>
        </section>

        {isAdvisor && (
          <WithdrawPanel
            overview={withdrawals}
            loading={loading}
            error={withdrawalsError}
            accountEmail={user?.email ?? ''}
            onChanged={() => void load()}
          />
        )}

        {/* Buy coins */}
        <section id="buy-coins" className="space-y-3 scroll-mt-28" aria-labelledby="buy-coins-heading">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h2 id="buy-coins-heading" className="text-section-title text-slate-900">Buy coins</h2>
              <p className="text-body-sm text-slate-500">Use coins to pay for sessions with verified advisors.</p>
            </div>
            {purchasesOn && providers.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap" role="radiogroup" aria-label="Pay with">
                <span className="text-sm font-semibold text-slate-600">Pay with</span>
                {providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedProvider === p.id}
                    onClick={() => setPayWith(p.id)}
                    data-testid={`wallet-pay-with-${p.id}`}
                    className={cn(
                      'px-3 py-1.5 rounded-full border text-xs font-bold transition-colors',
                      selectedProvider === p.id
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    {p.displayName.split(' (')[0]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!loading && !purchasesOn && (
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
              {frozen ? 'Purchases are unavailable while the wallet is on hold.' : 'Coin purchases are not available right now. Please check back later.'}
            </div>
          )}
          {purchasesOn && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setBuying(pkg)}
                  className={cn(
                    cardClass,
                    'relative text-left p-4 sm:p-5 flex flex-col gap-3 min-w-0 transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg active:scale-[0.98]',
                    bestValueId === pkg.id && 'border-violet-300 ring-2 ring-violet-100',
                  )}
                  data-testid={`wallet-package-${pkg.code}`}
                >
                  {bestValueId === pkg.id && (
                    <span className="absolute -top-2.5 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-600 text-white text-2xs font-bold shadow-sm">
                      <Sparkles size={11} /> Best value
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-sm font-bold text-slate-500 truncate">{pkg.name}</span>
                    <CoinMark size="md" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 tabular-nums">{pkg.totalCoins.toLocaleString('en-IN')}</p>
                    <p className="text-xs font-semibold text-slate-500">coins</p>
                  </div>
                  {pkg.bonusCoins > 0 && (
                    <span className="self-start px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-2xs font-bold">
                      includes +{pkg.bonusCoins.toLocaleString('en-IN')} bonus
                    </span>
                  )}
                  <span className="mt-auto flex items-center justify-center py-2 rounded-full bg-slate-900 text-white text-sm font-bold">
                    {formatMoneyMinor(pkg.priceMinor, pkg.currency)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Activity */}
        <section className="space-y-3" aria-labelledby="wallet-transactions-heading">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 id="wallet-transactions-heading" className="text-section-title text-slate-900">Activity</h2>
            <div className="flex gap-1.5 overflow-x-auto max-w-full pb-1 scrollbar-hide" role="tablist" aria-label="Filter transactions">
              {filters.map((f) => (
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

          <div className={cn(cardClass, 'overflow-hidden')}>
            {loading && transactions.length === 0 ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-10 text-center">
                <CoinMark size="lg" className="mx-auto opacity-60" />
                <p className="text-sm font-bold text-slate-700 mt-3">No activity yet</p>
                <p className="text-xs text-slate-500 mt-0.5">Purchases, session payments and earnings will show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100" data-testid="wallet-activity">
                {transactions.map((t) => {
                  const style = ENTRY_STYLE[t.type] ?? ENTRY_STYLE.ADMIN_ADJUSTMENT;
                  const Icon = style.icon;
                  const details = t.reason || t.description;
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                      <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', style.tone)}>
                        <Icon size={17} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{LEDGER_LABELS[t.type] ?? t.type}</p>
                        <p className="text-xs text-slate-500 truncate" title={details}>
                          {formatDate(t.createdAt)}
                          {details && details !== LEDGER_LABELS[t.type] ? ` · ${details}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('text-sm font-black tabular-nums', t.amount > 0 ? 'text-emerald-600' : 'text-slate-900')}>
                          {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('en-IN')}
                        </p>
                        <p className="text-2xs font-semibold text-slate-400">
                          {t.bucket === 'PENDING' ? 'pending' : `bal ${t.availableAfter.toLocaleString('en-IN')}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
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
            <ul className={cn(cardClass, 'divide-y divide-slate-100 overflow-hidden')}>
              {purchases.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                  <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <IndianRupee size={17} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">{formatCoins(o.coins)} · {formatMoneyMinor(o.amountMinor, o.currency)}</p>
                    <p className="text-xs text-slate-500 truncate">{formatDate(o.createdAt)} · {o.provider}</p>
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
        resumeOrderId={buying ? null : resumeOrderId}
        provider={selectedProvider}
        onClose={closePurchase}
        onCredited={onCredited}
      />
    </CenteredLayout>
  );
};
