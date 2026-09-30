/**
 * Pure rules behind session payments: the lifecycle a booking is in at a given
 * server time, the refund policy, coin pricing and wall-clock → instant
 * conversion. No database.
 */
import { deriveLifecycle, refundPercentFor } from '../../../../backend/src/features/wallet/sessionPayment.service';
import { sessionCoinCost, sessionPrice } from '../../../../backend/src/features/wallet/wallet.config';
import { resolveBookingTimes, zonedWallClockToInstant } from '../../../../backend/src/features/bookings/bookingTime';

const MIN = 60_000;
const start = new Date('2026-10-01T04:30:00.000Z'); // 10:00 IST

const booking = (overrides: Record<string, unknown> = {}) => ({
  status: 'accepted',
  paymentStatus: 'UNPAID',
  coinCost: 100,
  startsAt: start,
  endsAt: new Date(start.getTime() + 60 * MIN),
  proposedDate: new Date('2026-10-01T10:00:00.000Z'),
  proposedTime: '10:00',
  duration: 60,
  timeZone: 'Asia/Kolkata',
  ...overrides,
}) as Parameters<typeof deriveLifecycle>[0];

const at = (minutesFromStart: number) => new Date(start.getTime() + minutesFromStart * MIN);

describe('deriveLifecycle (server clock)', () => {
  it('walks an unpaid session through the 5-minute rule', () => {
    expect(deriveLifecycle(booking(), 'scheduled', at(-60))).toBe('AWAITING_PAYMENT');
    expect(deriveLifecycle(booking(), 'scheduled', at(-5))).toBe('PAYMENT_DUE');
    expect(deriveLifecycle(booking(), 'scheduled', at(9))).toBe('PAYMENT_DUE');
    expect(deriveLifecycle(booking(), 'scheduled', at(10))).toBe('EXPIRED');
  });

  it('opens a paid session only inside its join window', () => {
    const paid = booking({ paymentStatus: 'PAID' });
    expect(deriveLifecycle(paid, 'scheduled', at(-6))).toBe('UPCOMING');
    expect(deriveLifecycle(paid, 'scheduled', at(-5))).toBe('READY');
    expect(deriveLifecycle(paid, 'scheduled', at(75))).toBe('READY');
    expect(deriveLifecycle(paid, 'scheduled', at(76))).toBe('MISSED');
    expect(deriveLifecycle(paid, 'in-progress', at(30))).toBe('IN_PROGRESS');
  });

  it('never unlocks a session because of a session status the booking does not back', () => {
    // Unpaid bookings stay locked however the session row reads.
    expect(deriveLifecycle(booking(), 'scheduled', at(0))).not.toBe('READY');
    expect(deriveLifecycle(booking({ status: 'cancelled', paymentStatus: 'PAID' }), 'in-progress', at(0))).toBe('CANCELLED');
    expect(deriveLifecycle(booking({ status: 'expired' }), 'scheduled', at(0))).toBe('EXPIRED');
    expect(deriveLifecycle(booking({ status: 'pending' }), null, at(0))).toBe('REQUESTED');
  });

  it('treats free sessions (no coin cost) as payable-free but still time-locked', () => {
    const free = booking({ paymentStatus: 'NOT_REQUIRED', coinCost: null });
    expect(deriveLifecycle(free, 'scheduled', at(-30))).toBe('UPCOMING');
    expect(deriveLifecycle(free, 'scheduled', at(0))).toBe('READY');
  });
});

describe('refundPercentFor', () => {
  const now = at(0).getTime();
  it('refunds the advisor, system and admin-default cases in full', () => {
    expect(refundPercentFor('advisor', start, new Date(now))).toBe(100);
    expect(refundPercentFor('system', start, new Date(now))).toBe(100);
    expect(refundPercentFor('admin', start, new Date(now))).toBe(100);
  });
  it('lets an admin choose, clamped to 0–100', () => {
    expect(refundPercentFor('admin', start, new Date(now), 40)).toBe(40);
    expect(refundPercentFor('admin', start, new Date(now), 400)).toBe(100);
    expect(refundPercentFor('admin', start, new Date(now), -5)).toBe(0);
  });
  it('applies the late-cancel percentage to a client inside the cutoff', () => {
    process.env.SESSION_LATE_CANCEL_REFUND_PERCENT = '50';
    expect(refundPercentFor('client', start, at(-120))).toBe(100);
    expect(refundPercentFor('client', start, at(-30))).toBe(50);
    delete process.env.SESSION_LATE_CANCEL_REFUND_PERCENT;
    expect(refundPercentFor('client', start, at(-30))).toBe(100);
  });
});

describe('pricing', () => {
  it('derives coins and price from the hourly rate, pro-rated and rounded up', () => {
    expect(sessionCoinCost(600, 60)).toBe(600);
    expect(sessionCoinCost(600, 30)).toBe(300);
    expect(sessionCoinCost(1000, 45)).toBe(750);
    expect(sessionCoinCost(999, 20)).toBe(333);
    expect(sessionCoinCost(1, 20)).toBe(1); // never rounds a paid session down to free
    expect(sessionCoinCost(0, 60)).toBe(0);
    expect(sessionCoinCost(null, 60)).toBe(0);
    expect(sessionPrice(1000, 45)).toBe(750);
  });
});

describe('booking time', () => {
  it('converts the IST wall clock to the right instant', () => {
    expect(zonedWallClockToInstant('2026-10-01', '10:00', 'Asia/Kolkata')?.toISOString()).toBe('2026-10-01T04:30:00.000Z');
  });
  it('handles a zone with DST on both sides of the change', () => {
    // 2026-03-29 01:30 does not exist in London; 12:00 that day is BST (UTC+1).
    expect(zonedWallClockToInstant('2026-03-29', '12:00', 'Europe/London')?.toISOString()).toBe('2026-03-29T11:00:00.000Z');
    expect(zonedWallClockToInstant('2026-01-15', '12:00', 'Europe/London')?.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });
  it('falls back to the default zone for an invalid one, and rejects garbage', () => {
    expect(zonedWallClockToInstant('2026-10-01', '10:00', 'Not/AZone')?.toISOString()).toBe('2026-10-01T04:30:00.000Z');
    expect(zonedWallClockToInstant('2026-13-01', '10:00', 'Asia/Kolkata')).toBeNull();
    expect(zonedWallClockToInstant('2026-10-01', '25:00', 'Asia/Kolkata')).toBeNull();
  });
  it('resolves legacy rows (no startsAt) in Asia/Kolkata', () => {
    const legacy = resolveBookingTimes({ proposedDate: new Date('2026-10-01T10:00:00.000Z'), proposedTime: '10:00', duration: 45 });
    expect(legacy?.startsAt.toISOString()).toBe('2026-10-01T04:30:00.000Z');
    expect(legacy?.endsAt.toISOString()).toBe('2026-10-01T05:15:00.000Z');
  });
});
