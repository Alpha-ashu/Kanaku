import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLifecycle } from '@/lib/sessionLifecycle';
import { formatCountdown, serverNow, syncServerClock } from '@/hooks/useServerClock';
import type { BookingPaymentState } from '@/services/walletService';

const base: BookingPaymentState = {
  bookingId: 'b1',
  sessionId: 's1',
  lifecycle: 'AWAITING_PAYMENT',
  status: 'accepted',
  paymentStatus: 'UNPAID',
  coinCost: 100,
  serverNow: '2026-10-01T04:00:00.000Z',
  startsAt: '2026-10-01T04:30:00.000Z',
  endsAt: '2026-10-01T05:30:00.000Z',
  paymentDueAt: '2026-10-01T04:25:00.000Z',
  paymentClosesAt: '2026-10-01T04:40:00.000Z',
  joinOpensAt: '2026-10-01T04:25:00.000Z',
  joinClosesAt: '2026-10-01T05:45:00.000Z',
  paidAt: null,
  refundedAt: null,
  canPay: true,
  canJoin: false,
  walletBalance: 500,
};

const at = (iso: string) => Date.parse(iso);

describe('describeLifecycle', () => {
  it('counts down to the payment deadline before the payment window', () => {
    const view = describeLifecycle(base, at('2026-10-01T04:00:00.000Z'));
    expect(view).toMatchObject({ label: 'Upcoming session', countdownTo: base.paymentDueAt, countdownLabel: 'Payment due in' });
  });

  it('asks for payment in the window, or to buy coins when short', () => {
    expect(describeLifecycle({ ...base, lifecycle: 'PAYMENT_DUE' }, at('2026-10-01T04:26:00.000Z'))).toMatchObject({ label: 'Payment required', tone: 'warning' });
    const short = describeLifecycle({ ...base, lifecycle: 'PAYMENT_DUE', walletBalance: 40 }, at('2026-10-01T04:26:00.000Z'));
    expect(short.label).toBe('Insufficient coins — purchase coins');
    expect(short.tone).toBe('danger');
    expect(short.detail).toContain('You need 100 coins; you have 40');
  });

  it('shows unlocked, join and in-progress states with the right countdown', () => {
    const paid = { ...base, paymentStatus: 'PAID' as const, canPay: false };
    expect(describeLifecycle({ ...paid, lifecycle: 'UPCOMING' }, at('2026-10-01T04:10:00.000Z'))).toMatchObject({ label: 'Session unlocked', countdownLabel: 'Session starts in' });
    expect(describeLifecycle({ ...paid, lifecycle: 'READY' }, at('2026-10-01T04:27:00.000Z'))).toMatchObject({ label: 'Join session', countdownLabel: 'Session starts in' });
    expect(describeLifecycle({ ...paid, lifecycle: 'READY' }, at('2026-10-01T04:31:00.000Z'))).toMatchObject({ countdownLabel: 'Session ends in', countdownTo: base.endsAt });
    expect(describeLifecycle({ ...paid, lifecycle: 'IN_PROGRESS' }, at('2026-10-01T04:45:00.000Z'))).toMatchObject({ label: 'Session in progress', countdownTo: base.endsAt });
  });

  it('explains terminal states', () => {
    expect(describeLifecycle({ ...base, lifecycle: 'EXPIRED' }, 0).detail).toMatch(/No coins were charged/);
    expect(describeLifecycle({ ...base, lifecycle: 'CANCELLED', paymentStatus: 'REFUNDED' }, 0).detail).toMatch(/refunded/);
    expect(describeLifecycle({ ...base, lifecycle: 'COMPLETED' }, 0).label).toBe('Session completed');
  });
});

describe('server clock', () => {
  afterEach(() => {
    vi.useRealTimers();
    syncServerClock(new Date().toISOString());
  });

  it('renders countdowns from the server time, not the device clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T04:00:00.000Z'));
    // The device clock is 3 minutes fast relative to the server.
    syncServerClock('2026-10-01T03:57:00.000Z');
    expect(new Date(serverNow()).toISOString()).toBe('2026-10-01T03:57:00.000Z');
    syncServerClock('not a date');
    expect(new Date(serverNow()).toISOString()).toBe('2026-10-01T03:57:00.000Z');
  });

  it('formats countdowns', () => {
    expect(formatCountdown(7 * 60_000 + 32_000)).toBe('07:32');
    expect(formatCountdown(65 * 60_000)).toBe('1h 05m');
    expect(formatCountdown(26 * 3_600_000)).toBe('1d 2h');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});
