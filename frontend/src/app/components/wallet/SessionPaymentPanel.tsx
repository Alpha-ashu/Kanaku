import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, Loader2, Lock, Video } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { describeApiFailure, failureText } from '@/lib/apiFailure';
import { describeLifecycle, TONE_CLASSES } from '@/lib/sessionLifecycle';
import { formatCountdown, syncServerClock, useServerNow } from '@/hooks/useServerClock';
import { BookingPaymentState, walletService } from '@/services/walletService';

/**
 * A booking's payment and access state, as the server decides it.
 *
 * Shows the lifecycle ("Payment required", "Session unlocked", "Join session",
 * "Session in progress"…) with a countdown on the SERVER's clock, and the one
 * action that applies. The buttons only ask; the server settles: Pay debits the
 * wallet atomically, and Join is granted only after the access check, which
 * also hands out the video room link.
 */

interface Props {
  bookingId: string;
  viewer: 'client' | 'advisor';
  initialState?: BookingPaymentState | null;
  /** Called after the state changed on the server (paid, expired, etc.). */
  onChanged?: (state: BookingPaymentState) => void;
  compact?: boolean;
}

const REFRESH_MS = 30_000;

export const SessionPaymentPanel: React.FC<Props> = ({ bookingId, viewer, initialState, onChanged, compact }) => {
  const { setCurrentPage } = useApp();
  const [state, setState] = useState<BookingPaymentState | null>(initialState ?? null);
  const [paying, setPaying] = useState(false);
  const [joining, setJoining] = useState(false);
  const now = useServerNow();
  const lastFetch = useRef(0);
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

  const refresh = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const next = await walletService.getBookingPayment(bookingId);
      syncServerClock(next.serverNow);
      setState((prev) => {
        if (prev && (prev.lifecycle !== next.lifecycle || prev.paymentStatus !== next.paymentStatus)) onChangedRef.current?.(next);
        return next;
      });
    } catch {
      // Keep showing the last known state; the next tick retries.
    }
  }, [bookingId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const view = state ? describeLifecycle(state, now) : null;
  const countdownMs = view?.countdownTo ? Date.parse(view.countdownTo) - now : null;

  // A deadline just passed: ask the server what happened rather than guessing.
  useEffect(() => {
    if (countdownMs !== null && countdownMs <= 0 && Date.now() - lastFetch.current > 3000) void refresh();
  }, [countdownMs, refresh]);

  if (!state || state.coinCost <= 0 && state.paymentStatus === 'NOT_REQUIRED' && viewer === 'advisor') {
    return null;
  }

  const pay = async () => {
    setPaying(true);
    try {
      const result = await walletService.payBooking(bookingId);
      syncServerClock(result.state.serverNow);
      setState(result.state);
      onChangedRef.current?.(result.state);
      toast.success(result.alreadyPaid ? 'This session is already paid.' : `Payment successful — ${state.coinCost} coins paid. Session unlocked.`);
    } catch (error) {
      const failure = await describeApiFailure(error, 'Payment failed. Please try again.');
      if (failure.code === 'INSUFFICIENT_COINS') {
        toast.error('Insufficient coins — purchase coins to pay for this session.');
      } else {
        toast.error(failureText(failure));
      }
      void refresh();
    } finally {
      setPaying(false);
    }
  };

  const join = async () => {
    if (!state.sessionId) return;
    setJoining(true);
    try {
      const access = await walletService.getSessionAccess(state.sessionId);
      syncServerClock(access.serverNow);
      setState(access);
      if (!access.canJoin || !access.joinUrl) {
        toast.error('This session is not open yet.');
        return;
      }
      window.open(access.joinUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(failureText(await describeApiFailure(error, 'Could not open the session.')));
    } finally {
      setJoining(false);
    }
  };

  const short = typeof state.walletBalance === 'number' && state.walletBalance < state.coinCost;

  return (
    <div
      className={cn('rounded-2xl border px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-3', view ? TONE_CLASSES[view.tone] : '')}
      data-testid={`session-payment-${bookingId}`}
      aria-live="polite"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold flex items-center gap-1.5">
          {(state.lifecycle === 'AWAITING_PAYMENT' || state.lifecycle === 'PAYMENT_DUE') && <Lock size={13} className="shrink-0" />}
          <span className="truncate">{view?.label}</span>
          {state.coinCost > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 text-2xs font-bold opacity-80 shrink-0">
              <Coins size={11} /> {state.coinCost}
            </span>
          )}
        </p>
        {/* text-xs, not .text-caption: the caption class forces grey, and these lines must take the tone colour. */}
        {!compact && view?.detail && <p className="text-xs font-medium opacity-90 mt-0.5">{view.detail}</p>}
        {view?.countdownTo && countdownMs !== null && countdownMs > 0 && (
          <p className="text-xs font-bold mt-0.5">
            {view.countdownLabel} <span className="font-mono">{formatCountdown(countdownMs)}</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {viewer === 'client' && state.canPay && !short && (
          <button
            type="button"
            onClick={() => void pay()}
            disabled={paying}
            className="px-4 py-2 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
            data-testid={`session-pay-${bookingId}`}
          >
            {paying ? <Loader2 size={13} className="animate-spin" /> : <Coins size={13} />}
            {paying ? 'Processing payment…' : `Pay ${state.coinCost} coins`}
          </button>
        )}
        {viewer === 'client' && state.canPay && short && (
          <button
            type="button"
            onClick={() => setCurrentPage('wallet')}
            className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
            data-testid={`session-buy-coins-${bookingId}`}
          >
            <Coins size={13} /> Purchase coins
          </button>
        )}
        {state.canJoin && state.sessionId && (
          <button
            type="button"
            onClick={() => void join()}
            disabled={joining}
            className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
            data-testid={`session-join-${bookingId}`}
          >
            {joining ? <Loader2 size={13} className="animate-spin" /> : <Video size={13} />}
            {state.lifecycle === 'IN_PROGRESS' ? 'Rejoin' : 'Join session'}
          </button>
        )}
      </div>
    </div>
  );
};
