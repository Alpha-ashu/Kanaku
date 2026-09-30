import type { BookingPaymentState } from '@/services/walletService';

/**
 * How a booking's server-decided state is shown. Pure, so it is tested
 * directly. The server says WHAT the state is; this only chooses words, tone
 * and which deadline a countdown runs to.
 */

export type LifecycleTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface LifecycleView {
  label: string;
  detail?: string;
  tone: LifecycleTone;
  /** ISO time the countdown runs to, and what it counts down to. */
  countdownTo?: string | null;
  countdownLabel?: string;
  /** Short payment note for the badge next to the label. */
  paymentNote?: string;
}

export const describeLifecycle = (state: BookingPaymentState, nowMs: number): LifecycleView => {
  const cost = state.coinCost;
  const short = typeof state.walletBalance === 'number' && state.walletBalance < cost;
  const before = (iso: string | null) => (iso ? nowMs < Date.parse(iso) : false);

  switch (state.lifecycle) {
    case 'REQUESTED':
      return { label: 'Awaiting advisor', detail: 'Your request has been sent.', tone: 'neutral' };
    case 'RESCHEDULE_PROPOSED':
      return { label: 'New time proposed', tone: 'info' };
    case 'REJECTED':
      return { label: 'Declined', tone: 'danger' };
    case 'AWAITING_PAYMENT':
      return {
        label: 'Upcoming session',
        detail: `${cost} coins are due 5 minutes before the start.`,
        tone: 'info',
        countdownTo: state.paymentDueAt,
        countdownLabel: 'Payment due in',
        paymentNote: short ? 'Not enough coins yet' : undefined,
      };
    case 'PAYMENT_DUE':
      return short
        ? {
          label: 'Insufficient coins — purchase coins',
          detail: `You need ${cost} coins; you have ${state.walletBalance}. Buy coins to keep this session.`,
          tone: 'danger',
          countdownTo: state.paymentClosesAt,
          countdownLabel: 'Session expires in',
        }
        : {
          label: 'Payment required',
          detail: `Pay ${cost} coins to unlock the session.`,
          tone: 'warning',
          countdownTo: state.paymentClosesAt,
          countdownLabel: 'Pay within',
        };
    case 'UPCOMING':
      return {
        label: state.paymentStatus === 'PAID' ? 'Session unlocked' : 'Upcoming session',
        detail: state.paymentStatus === 'PAID' ? 'Paid. You can join 5 minutes before the start.' : undefined,
        tone: state.paymentStatus === 'PAID' ? 'success' : 'info',
        countdownTo: state.startsAt,
        countdownLabel: 'Session starts in',
      };
    case 'READY':
      return before(state.startsAt)
        ? { label: 'Join session', tone: 'success', countdownTo: state.startsAt, countdownLabel: 'Session starts in' }
        : { label: 'Join session', tone: 'success', countdownTo: state.endsAt, countdownLabel: 'Session ends in' };
    case 'IN_PROGRESS':
      return { label: 'Session in progress', tone: 'success', countdownTo: state.endsAt, countdownLabel: 'Session ends in' };
    case 'COMPLETED':
      return { label: 'Session completed', tone: 'neutral' };
    case 'MISSED':
      return { label: 'Session not started', detail: 'Paid sessions that never start are refunded automatically.', tone: 'warning' };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        detail: state.paymentStatus === 'REFUNDED' ? 'Your coins were refunded to your wallet.' : undefined,
        tone: 'neutral',
      };
    case 'EXPIRED':
      return { label: 'Expired', detail: 'This session was not paid in time. No coins were charged.', tone: 'neutral' };
    default:
      return { label: 'Session', tone: 'neutral' };
  }
};

export const TONE_CLASSES: Record<LifecycleTone, string> = {
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  info: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
};
