/**
 * Advisor withdrawals on the wallet page: what can be withdrawn, where it is
 * paid, the request in progress, and past payouts.
 *
 * The server decides everything that matters — the withdrawable amount (earned
 * coins only), the minimum, whether a request is still open. This panel only
 * prevents obviously invalid submissions and shows what the server says.
 *
 * Duplicate-proofing on the request: `useSubmitLock` (one submit in flight), an
 * idempotency key held for the attempt and replaced only after a definite
 * answer, and on the server an advisory lock, the (user, key) unique index and
 * a one-open-request-per-user unique index.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Banknote, CheckCircle2, Clock, Info, Landmark, Loader2, Pencil, Plus, Smartphone, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeApiFailure, failureText } from '@/lib/apiFailure';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import {
  announceWalletChange,
  coinsToMinor,
  formatMoneyMinor,
  newRequestKey,
  walletService,
  type Withdrawal,
  type WithdrawalOverview,
  type WithdrawalStatus,
} from '@/services/walletService';
import { PayoutMethodDialog } from './PayoutMethodDialog';
import { CoinMark } from './CoinMark';

interface WithdrawPanelProps {
  overview: WithdrawalOverview | null;
  loading: boolean;
  error: string | null;
  accountEmail: string;
  /** Reload the overview and the wallet after a change. */
  onChanged: () => void;
}

const STATUS_STYLE: Record<WithdrawalStatus, { label: string; tone: string }> = {
  REQUESTED: { label: 'Requested', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  APPROVED: { label: 'Approved', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  PAID: { label: 'Paid', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Not paid', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-slate-50 text-slate-600 border-slate-200' },
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const StatusPill: React.FC<{ status: WithdrawalStatus }> = ({ status }) => (
  <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full border text-2xs font-bold whitespace-nowrap', STATUS_STYLE[status].tone)}>
    {STATUS_STYLE[status].label}
  </span>
);

/** Requested → Approved → Paid, with the current step highlighted. */
const Progress: React.FC<{ request: Withdrawal }> = ({ request }) => {
  const steps = [
    { label: 'Requested', at: request.createdAt },
    { label: 'Approved', at: request.approvedAt },
    { label: 'Paid', at: request.paidAt },
  ];
  const reached = request.status === 'PAID' ? 3 : request.status === 'APPROVED' ? 2 : 1;
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Withdrawal progress">
      {steps.map((step, index) => {
        const done = index < reached;
        return (
          <li key={step.label} className="min-w-0">
            <div className={cn('h-1.5 rounded-full', done ? 'bg-violet-600' : 'bg-slate-200')} />
            <p className={cn('mt-1.5 text-xs font-bold truncate', done ? 'text-slate-900' : 'text-slate-400')}>{step.label}</p>
            {step.at && done && <p className="text-2xs text-slate-500 truncate">{formatDate(step.at)}</p>}
          </li>
        );
      })}
    </ol>
  );
};

export const WithdrawPanel: React.FC<WithdrawPanelProps> = ({ overview, loading, error, accountEmail, onChanged }) => {
  const lock = useSubmitLock();
  const [amount, setAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [editingMethod, setEditingMethod] = useState(false);
  const requestKey = useRef(newRequestKey());

  const coinValue = overview?.coinValueMinor ?? 100;
  const min = overview?.minCoins ?? 300;
  const withdrawable = overview?.withdrawableCoins ?? 0;
  const max = Math.min(withdrawable, overview?.maxCoins ?? withdrawable);
  const coins = Number(amount);
  const amountValid = Number.isInteger(coins) && coins >= min && coins <= max;

  const blocker = useMemo(() => {
    if (!overview) return '';
    if (!overview.enabled) return 'Withdrawals are paused right now. Please check back later.';
    if (overview.walletStatus === 'FROZEN') return 'Your wallet is on hold, so withdrawals are unavailable until support reviews it.';
    if (withdrawable < min) {
      return `You can withdraw once you have at least ${min.toLocaleString('en-IN')} earned coins (${formatMoneyMinor(coinsToMinor(min, coinValue))}).`;
    }
    return '';
  }, [overview, withdrawable, min, coinValue]);

  const amountHint = (() => {
    if (!amount) return '';
    if (!Number.isInteger(coins) || coins <= 0) return 'Enter a whole number of coins.';
    if (coins < min) return `The minimum withdrawal is ${min.toLocaleString('en-IN')} coins.`;
    if (coins > max) return `You can withdraw up to ${max.toLocaleString('en-IN')} coins right now.`;
    return '';
  })();

  const submit = lock(async () => {
    if (!amountValid) return;
    setBusy(true);
    setActionError('');
    try {
      await walletService.requestWithdrawal(coins, requestKey.current);
      requestKey.current = newRequestKey();
      setAmount('');
      setConfirming(false);
      announceWalletChange();
      onChanged();
    } catch (err) {
      const failure = await describeApiFailure(err, 'Your withdrawal could not be requested. No coins were taken.');
      // The server answered: this attempt is over, the next one is new. A
      // network failure keeps the key, so a retry is recognised as the same.
      if (failure.status) requestKey.current = newRequestKey();
      setActionError(failureText(failure));
      setConfirming(false);
      if (failure.code === 'WITHDRAWAL_ALREADY_OPEN' || failure.code === 'WITHDRAWAL_EXCEEDS_EARNINGS') onChanged();
    } finally {
      setBusy(false);
    }
  });

  const cancel = lock(async (id: string) => {
    setBusy(true);
    setActionError('');
    try {
      await walletService.cancelWithdrawal(id);
      announceWalletChange();
      onChanged();
    } catch (err) {
      setActionError(failureText(await describeApiFailure(err, 'The withdrawal could not be cancelled.')));
      onChanged();
    } finally {
      setBusy(false);
    }
  });

  const method = overview?.payoutMethod ?? null;
  const open = overview?.open ?? null;
  const history = (overview?.recent ?? []).filter((r) => r.id !== open?.id);

  return (
    <section id="withdraw" className="space-y-3 scroll-mt-28" aria-labelledby="withdraw-heading" data-testid="withdraw-panel">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 id="withdraw-heading" className="text-section-title text-slate-900">Withdraw earnings</h2>
          <p className="text-body-sm text-slate-500">1 coin = {formatMoneyMinor(coinValue)} · minimum {min.toLocaleString('en-IN')} coins</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p className="text-body-sm flex-1">{error}</p>
        </div>
      )}

      <div className="rounded-[24px] sm:rounded-[28px] bg-white border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.10)] overflow-hidden">
        {/* Figures */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          {[
            { label: 'Withdrawable', value: withdrawable, sub: formatMoneyMinor(coinsToMinor(withdrawable, coinValue)), testId: 'withdrawable-coins', strong: true },
            { label: 'Minimum', value: min, sub: formatMoneyMinor(coinsToMinor(min, coinValue)) },
            { label: 'Paid out', value: overview?.paidOut.coins ?? 0, sub: formatMoneyMinor(overview?.paidOut.amountMinor ?? 0) },
          ].map((item) => (
            <div key={item.label} className="p-3 sm:p-5 min-w-0">
              <p className="text-2xs sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate">{item.label}</p>
              {loading && !overview ? (
                <div className="h-7 w-16 mt-1 rounded-lg bg-slate-100 animate-pulse" />
              ) : (
                <p className={cn('mt-0.5 font-black tracking-tight truncate tabular-nums', item.strong ? 'text-xl sm:text-2xl text-violet-700' : 'text-lg sm:text-xl text-slate-900')} data-testid={item.testId}>
                  {item.value.toLocaleString('en-IN')}
                </p>
              )}
              <p className="text-xs font-semibold text-slate-500 truncate">{item.sub}</p>
            </div>
          ))}
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Payout method */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
              {method?.method === 'BANK' ? <Landmark size={18} /> : <Smartphone size={18} />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Paid to</p>
              <p className="text-sm font-bold text-slate-900 truncate" data-testid="payout-label">
                {method ? method.label : 'No UPI ID or bank account yet'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingMethod(true)}
              disabled={!overview}
              data-testid="payout-edit"
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {method ? <Pencil size={13} /> : <Plus size={13} />} {method ? 'Change' : 'Add'}
            </button>
          </div>

          {/* The request in progress, or the form */}
          {open ? (
            <div className="space-y-4 p-4 rounded-2xl border border-violet-100 bg-violet-50/40" data-testid="withdraw-open">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Withdrawal in progress</p>
                  <p className="text-xl font-black text-slate-900 tabular-nums">{formatMoneyMinor(open.amountMinor, open.currency)}</p>
                  <p className="text-xs text-slate-500 truncate">{open.coins.toLocaleString('en-IN')} coins · to {open.payoutLabel}</p>
                </div>
                <StatusPill status={open.status} />
              </div>
              <Progress request={open} />
              {open.status === 'REQUESTED' ? (
                <button
                  type="button"
                  onClick={() => void cancel(open.id)}
                  disabled={busy}
                  data-testid="withdraw-cancel"
                  className="flex items-center gap-1.5 text-sm font-bold text-rose-700 hover:underline disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Cancel request
                </button>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Clock size={13} /> Approved — our team is paying it now. It can no longer be cancelled.
                </p>
              )}
            </div>
          ) : blocker ? (
            <p className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900" data-testid="withdraw-blocker">
              <Info size={16} className="shrink-0 mt-0.5" /> {blocker}
            </p>
          ) : !method ? (
            <p className="flex items-start gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
              <Info size={16} className="shrink-0 mt-0.5" /> Add your UPI ID or bank account to request a withdrawal.
            </p>
          ) : confirming ? (
            <div className="space-y-3 p-4 rounded-2xl border border-violet-200 bg-violet-50/50" data-testid="withdraw-confirm">
              <p className="text-sm text-slate-700">
                Withdraw <span className="font-bold text-slate-900">{coins.toLocaleString('en-IN')} coins</span> and receive{' '}
                <span className="font-bold text-slate-900">{formatMoneyMinor(coinsToMinor(coins, coinValue))}</span> to{' '}
                <span className="font-bold text-slate-900">{method.label}</span>?
              </p>
              <p className="text-xs text-slate-500">The coins leave your wallet now and come back if the payout cannot be made.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="flex-1 py-2.5 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  data-testid="withdraw-confirm-button"
                  className="flex-1 py-2.5 rounded-full bg-slate-900 text-sm font-bold text-white hover:bg-black disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />} Confirm
                </button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (amountValid) setConfirming(true);
              }}
              noValidate
            >
              <label htmlFor="withdraw-amount" className="block text-sm font-medium text-slate-700">Coins to withdraw</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <CoinMark size="xs" className="absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="withdraw-amount"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 9)); setActionError(''); }}
                    inputMode="numeric"
                    placeholder={`${min.toLocaleString('en-IN')} – ${max.toLocaleString('en-IN')}`}
                    autoComplete="off"
                    data-testid="withdraw-amount"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-3 text-base font-bold text-slate-900 tabular-nums focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!amountValid || busy}
                  data-testid="withdraw-submit"
                  className="shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-slate-900 text-sm font-bold text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Withdraw <ArrowRight size={15} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[min, Math.round(max / 2), max]
                  .filter((v, i, all) => v >= min && v <= max && all.indexOf(v) === i)
                  .map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(String(v))}
                      className={cn(
                        'px-3 py-1.5 rounded-full border text-xs font-bold transition-colors',
                        coins === v ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      {v === max ? `Max ${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN')}
                    </button>
                  ))}
                {amountValid && (
                  <span className="text-sm font-semibold text-emerald-700" data-testid="withdraw-receive">
                    You receive {formatMoneyMinor(coinsToMinor(coins, coinValue))}
                  </span>
                )}
              </div>
              {amountHint && <p className="text-xs font-semibold text-amber-700">{amountHint}</p>}
            </form>
          )}

          {actionError && <p role="alert" data-testid="withdraw-error" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</p>}

          <p className="flex items-start gap-2 text-xs text-slate-500">
            <Info size={14} className="shrink-0 mt-0.5" />
            Only coins earned from completed sessions can be withdrawn. Coins you buy can be used for sessions only.
            Our team pays approved requests to your UPI ID or bank account and records the payment reference here.
          </p>
        </div>

        {/* History */}
        {history.length > 0 && (
          <ul className="border-t border-slate-100 divide-y divide-slate-100" aria-label="Past withdrawals">
            {history.map((w) => (
              <li key={w.id} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', w.status === 'PAID' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                  {w.status === 'PAID' ? <CheckCircle2 size={16} /> : <Banknote size={16} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 tabular-nums">{formatMoneyMinor(w.amountMinor, w.currency)} <span className="font-semibold text-slate-400">· {w.coins.toLocaleString('en-IN')} coins</span></p>
                  <p className="text-xs text-slate-500 truncate">{formatDate(w.paidAt ?? w.rejectedAt ?? w.cancelledAt ?? w.createdAt)} · {w.payoutLabel}</p>
                  {w.payoutReference && <p className="text-xs text-slate-600 truncate">Ref: <span className="font-mono">{w.payoutReference}</span></p>}
                  {w.status === 'REJECTED' && w.decisionNote && <p className="text-xs text-rose-700">{w.decisionNote}</p>}
                </div>
                <StatusPill status={w.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editingMethod && (
        <PayoutMethodDialog
          accountEmail={accountEmail}
          current={method}
          onClose={() => setEditingMethod(false)}
          onSaved={() => { setEditingMethod(false); onChanged(); }}
        />
      )}
    </section>
  );
};

export default WithdrawPanel;
