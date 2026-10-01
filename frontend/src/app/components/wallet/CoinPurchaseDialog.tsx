import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Clock, Coins, Loader2, ShieldCheck, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeApiFailure, failureText } from '@/lib/apiFailure';
import { openRazorpayCheckout } from '@/lib/razorpayCheckout';
import { openPaymentPage, rememberPendingPurchase } from '@/lib/pendingPurchase';
import { Capacitor } from '@capacitor/core';
import {
  CoinPackage,
  PurchaseOrder,
  formatCoins,
  formatMoneyMinor,
  newRequestKey,
  walletService,
} from '@/services/walletService';

/**
 * One purchase attempt, start to finish.
 *
 * The dialog never declares a payment successful on its own. It opens the
 * provider's checkout, hands the signed result to the server, and shows
 * "Payment successful" only when the server answers with a PAID order and a
 * ledger transaction id. If that answer is slow (webhook in flight, flaky
 * network) it polls the order; closing the dialog never loses the coins — the
 * server credits them whichever confirmation arrives.
 */

type Phase =
  | { kind: 'starting' }
  | { kind: 'sandbox'; order: PurchaseOrder }
  | { kind: 'checkout'; order: PurchaseOrder }
  | { kind: 'redirecting'; order: PurchaseOrder }
  | { kind: 'verifying'; order: PurchaseOrder }
  | { kind: 'success'; order: PurchaseOrder; transactionId: string | null; balance: number }
  | { kind: 'pending'; order: PurchaseOrder }
  | { kind: 'failed'; message: string; order?: PurchaseOrder };

interface Props {
  pkg: CoinPackage | null;
  /**
   * Re-open on an order already in progress — the user is back from a redirect
   * gateway (PhonePe, Paytm). Only its status is checked; nothing is bought.
   */
  resumeOrderId?: string | null;
  provider?: string;
  onClose: () => void;
  /** Called with the new balance once coins are credited. */
  onCredited: (balance: number) => void;
}

const POLL_INTERVAL_MS = 3000;
const POLL_LIMIT = 20;
/** A payment finished in the system browser can take the user a few minutes. */
const EXTERNAL_POLL_LIMIT = 80;

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const CoinPurchaseDialog: React.FC<Props> = ({ pkg, resumeOrderId, provider, onClose, onCredited }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  // One key per attempt: a retried "Buy" replays the same order server-side.
  const requestKey = useRef(newRequestKey());
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  const settle = useCallback((order: PurchaseOrder, transactionId: string | null, balance: number) => {
    if (order.status === 'PAID') {
      setPhase({ kind: 'success', order, transactionId, balance });
      onCredited(balance);
      return true;
    }
    if (order.status === 'FAILED' || order.status === 'EXPIRED') {
      setPhase({ kind: 'failed', message: order.failureReason || 'The payment did not go through. No coins were charged.', order });
      return true;
    }
    return false;
  }, [onCredited]);

  /** The server has not confirmed yet: ask it again for a while before giving up the spinner. */
  const pollOrder = useCallback(async (order: PurchaseOrder, limit = POLL_LIMIT) => {
    setPhase({ kind: 'verifying', order });
    for (let i = 0; i < limit && !cancelled.current; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const latest = await walletService.getPurchase(order.id);
        if (settle(latest.order, null, latest.availableBalance)) return;
      } catch {
        // keep polling; a transient error must not end the wait
      }
    }
    if (!cancelled.current) setPhase({ kind: 'pending', order });
  }, [settle]);

  const verify = useCallback(async (order: PurchaseOrder, payload: Record<string, string>) => {
    setPhase({ kind: 'verifying', order });
    try {
      const result = await walletService.verifyPurchase(order.id, payload);
      if (!settle(result.order, result.transactionId, result.availableBalance)) await pollOrder(result.order);
    } catch (error) {
      const failure = await describeApiFailure(error, 'We could not confirm this payment yet.');
      if (failure.code === 'PAYMENT_VERIFICATION_FAILED' || failure.noResponse || (failure.status ?? 0) >= 500) {
        await pollOrder(order);
      } else {
        setPhase({ kind: 'failed', message: failureText(failure), order });
      }
    }
  }, [pollOrder, settle]);

  const start = useCallback(async () => {
    if (!pkg) return;
    setPhase({ kind: 'starting' });
    try {
      const { order, checkout } = await walletService.createPurchase(pkg.id, requestKey.current, provider);
      if (settle(order, null, 0)) return;
      if (order.provider === 'sandbox') {
        setPhase({ kind: 'sandbox', order });
        return;
      }
      // Redirect gateways (PhonePe, Paytm): the payment happens on the
      // provider's page; the order settles from the provider's own answer.
      const mode = typeof checkout?.mode === 'string' ? checkout.mode : null;
      if (mode === 'redirect' || mode === 'status-only') {
        const url = typeof checkout?.url === 'string' ? checkout.url : '';
        if (mode === 'redirect' && url) {
          rememberPendingPurchase(order.id);
          if (isNative()) {
            // The app stays open; Capacitor hands the page to the system browser.
            window.open(url, '_blank');
            await pollOrder(order, EXTERNAL_POLL_LIMIT);
          } else {
            setPhase({ kind: 'redirecting', order });
            openPaymentPage(url);
          }
          return;
        }
        await pollOrder(order);
        return;
      }
      if (!checkout) throw new Error('The payment could not be started.');
      setPhase({ kind: 'checkout', order });
      const outcome = await openRazorpayCheckout(checkout);
      if (outcome.status === 'success') {
        await verify(order, outcome.payload);
      } else {
        // Closing the window proves nothing was paid only if the provider agrees;
        // the server keeps checking, so a late capture is still credited.
        await walletService.cancelPurchase(order.id).catch(() => undefined);
        setPhase({ kind: 'failed', message: outcome.lastFailure ? `Payment failed: ${outcome.lastFailure}` : 'Payment cancelled. No coins were charged.', order });
      }
    } catch (error) {
      const failure = await describeApiFailure(error, 'The payment could not be started.');
      setPhase({ kind: 'failed', message: failureText(failure) });
    }
  }, [pkg, provider, pollOrder, settle, verify]);

  /** Back from a redirect gateway: show what the provider decided about the order. */
  const resume = useCallback(async (orderId: string) => {
    setPhase({ kind: 'starting' });
    try {
      const latest = await walletService.getPurchase(orderId);
      if (!settle(latest.order, null, latest.availableBalance)) await pollOrder(latest.order);
    } catch (error) {
      setPhase({ kind: 'failed', message: failureText(await describeApiFailure(error, 'That purchase could not be found.')) });
    }
  }, [pollOrder, settle]);

  useEffect(() => {
    if (pkg) void start();
    else if (resumeOrderId) void resume(resumeOrderId);
    // Start once per opened package / resumed order; retries go through `retry`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg?.id, resumeOrderId]);

  const retry = () => {
    requestKey.current = newRequestKey();
    void start();
  };

  const simulate = async (order: PurchaseOrder, outcome: 'paid' | 'failed') => {
    try {
      const { payload } = await walletService.sandboxPay(order.id, outcome);
      if (outcome === 'failed') {
        setPhase({ kind: 'failed', message: 'Test payment declined. No coins were charged.', order });
        return;
      }
      await verify(order, payload);
    } catch (error) {
      setPhase({ kind: 'failed', message: failureText(await describeApiFailure(error, 'Test payment failed.')), order });
    }
  };

  const busy = phase.kind === 'starting' || phase.kind === 'checkout' || phase.kind === 'verifying' || phase.kind === 'redirecting';
  const open = Boolean(pkg || resumeOrderId);
  const orderInView = 'order' in phase ? phase.order : undefined;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-950/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            role="dialog"
            aria-modal="true"
            aria-label="Buy coins"
            className="bg-white w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                  <Coins size={18} className="text-violet-600" />
                </div>
                <div className="min-w-0">
                  {pkg ? (
                    <>
                      <p className="text-card-title text-slate-900 truncate">{pkg.name} · {formatCoins(pkg.totalCoins)}</p>
                      <p className="text-caption text-slate-500">{formatMoneyMinor(pkg.priceMinor, pkg.currency)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-card-title text-slate-900 truncate">
                        {orderInView ? `Coin purchase · ${formatCoins(orderInView.coins)}` : 'Coin purchase'}
                      </p>
                      <p className="text-caption text-slate-500">
                        {orderInView ? formatMoneyMinor(orderInView.amountMinor, orderInView.currency) : 'Checking your payment'}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={phase.kind === 'checkout' || phase.kind === 'redirecting'}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                aria-label="Close"
                data-testid="coin-purchase-close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 sm:px-6 py-6 space-y-4" aria-live="polite">
              {busy && (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <Loader2 size={28} className="animate-spin text-violet-500" />
                  <p className="text-body font-bold text-slate-900">
                    {phase.kind === 'starting'
                      ? (pkg ? 'Starting secure payment…' : 'Checking your payment…')
                      : phase.kind === 'checkout'
                        ? 'Complete the payment in the payment window'
                        : phase.kind === 'redirecting'
                          ? 'Opening the secure payment page…'
                          : 'Processing payment…'}
                  </p>
                  {phase.kind === 'verifying' && (
                    <p className="text-body-sm text-slate-500">Confirming with the payment provider. This usually takes a few seconds.</p>
                  )}
                </div>
              )}

              {phase.kind === 'sandbox' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-body-sm text-amber-900">
                    Test mode — no real money moves. Choose how the test payment should end.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => void simulate(phase.order, 'paid')}
                      className="py-3 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
                      data-testid="coin-purchase-sandbox-pay"
                    >
                      Pay (test)
                    </button>
                    <button
                      type="button"
                      onClick={() => void simulate(phase.order, 'failed')}
                      className="py-3 rounded-full border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50"
                      data-testid="coin-purchase-sandbox-decline"
                    >
                      Decline (test)
                    </button>
                  </div>
                </div>
              )}

              {phase.kind === 'success' && (
                <div className="flex flex-col items-center text-center gap-2 py-2" data-testid="coin-purchase-success">
                  <CheckCircle2 size={36} className="text-emerald-500" />
                  <p className="text-section-title text-slate-900">Payment successful</p>
                  <p className="text-body text-slate-600">{formatCoins(phase.order.coins)} credited to your wallet.</p>
                  <dl className="w-full mt-3 grid grid-cols-2 gap-2 text-left">
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <dt className="text-label text-slate-400">New balance</dt>
                      <dd className="text-fin-sm text-slate-900">{formatCoins(phase.balance)}</dd>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 min-w-0">
                      <dt className="text-label text-slate-400">Transaction ID</dt>
                      <dd className="text-caption text-slate-700 font-mono truncate" title={phase.transactionId ?? phase.order.id}>
                        {phase.transactionId ?? phase.order.id}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {phase.kind === 'pending' && (
                <div className="flex flex-col items-center text-center gap-2 py-2">
                  <Clock size={32} className="text-amber-500" />
                  <p className="text-card-title text-slate-900">Payment is still being confirmed</p>
                  <p className="text-body-sm text-slate-600">
                    If money left your account, the coins will be added automatically as soon as the provider confirms it. You can close this window.
                  </p>
                </div>
              )}

              {phase.kind === 'failed' && (
                <div className="flex flex-col items-center text-center gap-2 py-2" role="alert">
                  <XCircle size={32} className="text-rose-500" />
                  <p className="text-card-title text-slate-900">Payment failed — try again</p>
                  <p className="text-body-sm text-slate-600">{phase.message}</p>
                </div>
              )}

              <p className="flex items-center justify-center gap-1.5 text-caption text-slate-400">
                <ShieldCheck size={12} /> Coins are added only after the payment provider confirms the payment.
              </p>
            </div>

            <div className="px-5 sm:px-6 pb-6 flex gap-3">
              {phase.kind === 'failed' && pkg && (
                <button
                  type="button"
                  onClick={retry}
                  className="flex-1 py-3 rounded-full bg-slate-900 hover:bg-black text-white text-sm font-bold"
                  data-testid="coin-purchase-retry"
                >
                  Try again
                </button>
              )}
              {(phase.kind === 'success' || phase.kind === 'pending' || phase.kind === 'failed') && (
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    'flex-1 py-3 rounded-full text-sm font-bold',
                    phase.kind === 'failed' ? 'border border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-900 hover:bg-black text-white',
                  )}
                  data-testid="coin-purchase-done"
                >
                  {phase.kind === 'failed' ? 'Close' : 'Done'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
