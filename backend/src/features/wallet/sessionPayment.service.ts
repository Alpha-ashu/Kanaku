import { prisma } from '../../db/prisma';
import { Prisma } from '../../db/prisma-client';
import { logger } from '../../config/logger';
import { audit } from '../../utils/auditLogger';
import { notify } from '../notifications/notify';
import { normalizeStatus, type BookingActor } from '../bookings/booking.stateMachine';
import { resolveBookingTimes } from '../bookings/bookingTime';
import { WalletError } from './wallet.errors';
import { walletConfig } from './wallet.config';
import { LEDGER_TX_OPTIONS, lockWallets, postEntry, getWalletSummary } from './wallet.service';

/**
 * Paying for an advisor session, and everything that follows from it.
 *
 * Money moves in exactly four ways, each one database transaction that also
 * changes the booking, so the booking and the ledger can never disagree:
 *
 *   pay      client AVAILABLE −cost  +  advisor PENDING +cost   → paymentStatus PAID
 *   refund   client AVAILABLE +x     +  advisor PENDING −x      → REFUNDED (x = policy)
 *   release  advisor PENDING −cost   +  advisor AVAILABLE +cost → earnings spendable
 *   (admin refund after release reverses from the advisor's AVAILABLE instead)
 *
 * The booking row is locked (`SELECT … FOR UPDATE`) first in each, so pay,
 * refund and release on one booking are strictly serial, and the status checks
 * after the lock make every one of them idempotent.
 *
 * Time is always the server's. The client's clock only ever renders a countdown
 * from `serverNow` it was sent.
 */

type Tx = Prisma.TransactionClient;
type BookingRow = NonNullable<Awaited<ReturnType<typeof prisma.bookingRequest.findUnique>>>;

const MINUTE = 60_000;

export type BookingLifecycle =
  | 'REQUESTED'
  | 'RESCHEDULE_PROPOSED'
  | 'REJECTED'
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_DUE'
  | 'UPCOMING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'MISSED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface BookingWindows {
  startsAt: Date;
  endsAt: Date;
  paymentDueAt: Date;
  paymentClosesAt: Date;
  joinOpensAt: Date;
  joinClosesAt: Date;
}

export const bookingWindows = (booking: Pick<BookingRow, 'startsAt' | 'endsAt' | 'proposedDate' | 'proposedTime' | 'duration' | 'timeZone'>): BookingWindows | null => {
  const times = resolveBookingTimes(booking);
  if (!times) return null;
  const { startsAt, endsAt } = times;
  return {
    startsAt,
    endsAt,
    paymentDueAt: new Date(startsAt.getTime() - walletConfig.paymentLeadMinutes * MINUTE),
    paymentClosesAt: new Date(startsAt.getTime() + walletConfig.paymentGraceMinutes * MINUTE),
    joinOpensAt: new Date(startsAt.getTime() - walletConfig.joinEarlyMinutes * MINUTE),
    joinClosesAt: new Date(endsAt.getTime() + walletConfig.joinLateMinutes * MINUTE),
  };
};

const requiresPayment = (booking: Pick<BookingRow, 'paymentStatus' | 'coinCost'>) =>
  booking.paymentStatus !== 'NOT_REQUIRED' && (booking.coinCost ?? 0) > 0;

/** Pure: what the booking looks like at `now`. Used for display and for every access check. */
export const deriveLifecycle = (
  booking: Pick<BookingRow, 'status' | 'paymentStatus' | 'coinCost' | 'startsAt' | 'endsAt' | 'proposedDate' | 'proposedTime' | 'duration' | 'timeZone'>,
  sessionStatus: string | null | undefined,
  now: Date,
): BookingLifecycle => {
  const status = normalizeStatus(booking.status);
  if (status === 'rejected') return 'REJECTED';
  if (status === 'expired') return 'EXPIRED';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'completed' || sessionStatus === 'completed') return 'COMPLETED';
  if (status === 'pending') return 'REQUESTED';
  if (status === 'reschedule') return 'RESCHEDULE_PROPOSED';
  if (sessionStatus === 'cancelled') return 'CANCELLED';
  if (sessionStatus === 'in-progress') return 'IN_PROGRESS';

  const windows = bookingWindows(booking);
  if (!windows) return 'UPCOMING';
  const t = now.getTime();
  if (requiresPayment(booking) && booking.paymentStatus === 'UNPAID') {
    if (t < windows.paymentDueAt.getTime()) return 'AWAITING_PAYMENT';
    if (t < windows.paymentClosesAt.getTime()) return 'PAYMENT_DUE';
    return 'EXPIRED';
  }
  if (t < windows.joinOpensAt.getTime()) return 'UPCOMING';
  if (t <= windows.joinClosesAt.getTime()) return 'READY';
  return 'MISSED';
};

export interface BookingPaymentState {
  bookingId: string;
  sessionId: string | null;
  lifecycle: BookingLifecycle;
  status: string;
  paymentStatus: string;
  coinCost: number;
  serverNow: string;
  startsAt: string | null;
  endsAt: string | null;
  paymentDueAt: string | null;
  paymentClosesAt: string | null;
  joinOpensAt: string | null;
  joinClosesAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  /** The viewer may pay now (client only). */
  canPay: boolean;
  /** The viewer may enter the session now. */
  canJoin: boolean;
  /** Client only: coins available, so the UI can say "insufficient coins". */
  walletBalance?: number;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const describeBookingState = (
  booking: BookingRow,
  session: { id: string; status: string } | null,
  viewerId: string,
  now: Date,
  walletBalance?: number,
): BookingPaymentState => {
  const lifecycle = deriveLifecycle(booking, session?.status, now);
  const windows = bookingWindows(booking);
  const isClient = viewerId === booking.clientId;
  return {
    bookingId: booking.id,
    sessionId: session?.id ?? null,
    lifecycle,
    status: normalizeStatus(booking.status),
    paymentStatus: booking.paymentStatus,
    coinCost: booking.coinCost ?? 0,
    serverNow: now.toISOString(),
    startsAt: iso(windows?.startsAt),
    endsAt: iso(windows?.endsAt),
    paymentDueAt: requiresPayment(booking) ? iso(windows?.paymentDueAt) : null,
    paymentClosesAt: requiresPayment(booking) ? iso(windows?.paymentClosesAt) : null,
    joinOpensAt: iso(windows?.joinOpensAt),
    joinClosesAt: iso(windows?.joinClosesAt),
    paidAt: iso(booking.paidAt),
    refundedAt: iso(booking.refundedAt),
    canPay: isClient && (lifecycle === 'AWAITING_PAYMENT' || lifecycle === 'PAYMENT_DUE'),
    canJoin: lifecycle === 'READY' || lifecycle === 'IN_PROGRESS',
    ...(isClient && walletBalance !== undefined ? { walletBalance } : {}),
  };
};

const lockBooking = async (tx: Tx, bookingId: string) => {
  await tx.$queryRaw`SELECT "id" FROM "BookingRequest" WHERE "id" = ${bookingId} FOR UPDATE`;
  return tx.bookingRequest.findUnique({ where: { id: bookingId } });
};

// ─── Pay ───────────────────────────────────────────────────────────────────────

export interface PayActor {
  kind: 'client' | 'system';
  userId?: string;
}

const payTx = async (tx: Tx, bookingId: string, actor: PayActor, now: Date) => {
  const booking = await lockBooking(tx, bookingId);
  // A client paying someone else's booking is told it does not exist.
  if (!booking || (actor.kind === 'client' && booking.clientId !== actor.userId)) {
    throw new WalletError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
  }
  if (booking.paymentStatus === 'PAID') return { booking, paid: false as const, alreadyPaid: true as const };
  if (normalizeStatus(booking.status) !== 'accepted' || booking.paymentStatus !== 'UNPAID' || !booking.coinCost) {
    throw new WalletError('BOOKING_NOT_PAYABLE', 'This booking cannot be paid for.', 409);
  }
  const windows = bookingWindows(booking);
  if (!windows || now.getTime() >= windows.paymentClosesAt.getTime()) {
    throw new WalletError('PAYMENT_WINDOW_CLOSED', 'The payment window for this session has closed.', 409);
  }

  await lockWallets(tx, [booking.clientId, booking.advisorId]);
  const debit = await postEntry(tx, {
    userId: booking.clientId,
    type: 'SESSION_PAYMENT',
    amount: -booking.coinCost,
    reference: `session:${booking.id}:payment`,
    bookingId: booking.id,
    counterpartyUserId: booking.advisorId,
    description: `Advisor session (${booking.duration} min)`,
    actorId: actor.userId ?? null,
    actorRole: actor.kind,
    userInitiated: true,
  });
  const credit = await postEntry(tx, {
    userId: booking.advisorId,
    type: 'SESSION_EARNING',
    bucket: 'PENDING',
    amount: booking.coinCost,
    reference: `session:${booking.id}:earning`,
    bookingId: booking.id,
    counterpartyUserId: booking.clientId,
    description: `Session earning (${booking.duration} min) — held until completion`,
    actorId: actor.userId ?? null,
    actorRole: actor.kind,
  });
  const updated = await tx.bookingRequest.update({
    where: { id: booking.id },
    data: { paymentStatus: 'PAID', paidAt: now, startsAt: booking.startsAt ?? windows.startsAt, endsAt: booking.endsAt ?? windows.endsAt },
  });
  return { booking: updated, paid: true as const, alreadyPaid: false as const, debit, credit };
};

const announcePayment = (booking: BookingRow, transactionId?: string) => {
  audit({ event: 'wallet.session_paid', userId: booking.clientId, resource: 'BookingRequest', resourceId: booking.id, meta: { coins: booking.coinCost, transactionId } });
  void notify({
    userId: booking.clientId,
    topic: 'wallet',
    type: 'session_payment_success',
    title: 'Session unlocked',
    message: `${booking.coinCost} coins were paid for your advisor session. You can join from 5 minutes before the start.`,
    deepLink: '/book-advisor',
    priority: 'high',
    dedupKey: `session_paid:${booking.id}:client`,
    metadata: { bookingId: booking.id, transactionId },
  });
  void notify({
    userId: booking.advisorId,
    topic: 'wallet',
    type: 'session_payment_received',
    title: 'Session paid',
    message: `A client paid ${booking.coinCost} coins for an upcoming session. Earnings are released when the session is completed.`,
    deepLink: '/advisor-panel',
    dedupKey: `session_paid:${booking.id}:advisor`,
    metadata: { bookingId: booking.id },
  });
};

/** The client pays now. Idempotent: paying a paid booking returns it unchanged. */
export const payForSession = async (bookingId: string, clientId: string, now = new Date()) => {
  const result = await prisma.$transaction((tx) => payTx(tx, bookingId, { kind: 'client', userId: clientId }, now), LEDGER_TX_OPTIONS);
  if (result.paid) announcePayment(result.booking, result.debit?.id);
  return result;
};

// ─── Cancel / refund ──────────────────────────────────────────────────────────

export interface CancelInput {
  actor: BookingActor;
  actorId: string | null;
  reason?: string | null;
  /** Admin override of the refund percentage (0–100). */
  refundPercent?: number;
}

/** The refund policy, in one place. */
export const refundPercentFor = (actor: BookingActor, startsAt: Date | null, now: Date, override?: number): number => {
  if (actor === 'admin' && override !== undefined) return Math.max(0, Math.min(100, Math.round(override)));
  if (actor !== 'client') return 100; // advisor cancelled, admin default, or the system (never started)
  if (!startsAt) return 100;
  const minutesToStart = (startsAt.getTime() - now.getTime()) / MINUTE;
  return minutesToStart >= walletConfig.fullRefundCutoffMinutes ? 100 : walletConfig.lateCancelRefundPercent;
};

const refundTx = async (tx: Tx, booking: BookingRow, percent: number, meta: { actorId: string | null; actorRole: string; reason?: string | null }, now: Date) => {
  const cost = booking.coinCost ?? 0;
  const refund = Math.floor(cost * percent / 100);
  const remainder = cost - refund;
  await lockWallets(tx, [booking.clientId, booking.advisorId]);

  if (refund > 0) {
    await postEntry(tx, {
      userId: booking.clientId,
      type: 'SESSION_REFUND',
      amount: refund,
      reference: `session:${booking.id}:refund`,
      bookingId: booking.id,
      counterpartyUserId: booking.advisorId,
      description: percent === 100 ? 'Session refund' : `Session refund (${percent}%)`,
      reason: meta.reason ?? null,
      actorId: meta.actorId,
      actorRole: meta.actorRole,
    });
    await postEntry(tx, {
      userId: booking.advisorId,
      type: 'EARNING_REVERSAL',
      // Before release the coins are still pending; after it they come back out of available.
      bucket: booking.earningsReleasedAt ? 'AVAILABLE' : 'PENDING',
      amount: -refund,
      reference: `session:${booking.id}:earning-reversal`,
      bookingId: booking.id,
      counterpartyUserId: booking.clientId,
      description: 'Session earning reversed — session refunded',
      reason: meta.reason ?? null,
      actorId: meta.actorId,
      actorRole: meta.actorRole,
    });
  }
  if (remainder > 0 && !booking.earningsReleasedAt) {
    await releaseEntries(tx, booking, remainder, meta);
  }
  return tx.bookingRequest.update({
    where: { id: booking.id },
    data: {
      paymentStatus: refund > 0 ? 'REFUNDED' : booking.paymentStatus,
      refundedAt: refund > 0 ? now : booking.refundedAt,
      earningsReleasedAt: remainder > 0 && !booking.earningsReleasedAt ? now : booking.earningsReleasedAt,
    },
  });
};

const releaseEntries = async (tx: Tx, booking: BookingRow, amount: number, meta: { actorId: string | null; actorRole: string }) => {
  await postEntry(tx, {
    userId: booking.advisorId,
    type: 'EARNING_RELEASE',
    bucket: 'PENDING',
    amount: -amount,
    reference: `session:${booking.id}:release:pending`,
    bookingId: booking.id,
    description: 'Earning released from pending',
    actorId: meta.actorId,
    actorRole: meta.actorRole,
  });
  await postEntry(tx, {
    userId: booking.advisorId,
    type: 'EARNING_RELEASE',
    bucket: 'AVAILABLE',
    amount,
    reference: `session:${booking.id}:release:available`,
    bookingId: booking.id,
    counterpartyUserId: booking.clientId,
    description: `Session earning (${booking.duration} min)`,
    actorId: meta.actorId,
    actorRole: meta.actorRole,
  });
};

/**
 * Cancel a booking and refund whatever the policy says, atomically. Works from
 * any open state; the caller has already checked the actor may cancel it.
 */
export const cancelBookingWithRefund = async (bookingId: string, input: CancelInput, now = new Date()) => {
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId);
    if (!booking) throw new WalletError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    const status = normalizeStatus(booking.status);
    if (!['pending', 'reschedule', 'accepted'].includes(status)) {
      return { booking, changed: false, refundPercent: 0 };
    }
    const windows = bookingWindows(booking);
    let current: BookingRow = booking;
    let refundPercent = 0;
    if (booking.paymentStatus === 'PAID') {
      refundPercent = refundPercentFor(input.actor, windows?.startsAt ?? null, now, input.refundPercent);
      current = await refundTx(tx, booking, refundPercent, { actorId: input.actorId, actorRole: input.actor, reason: input.reason }, now);
    }
    const updated = await tx.bookingRequest.update({
      where: { id: booking.id },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: input.actor,
        cancelReason: input.reason ?? null,
        rescheduleProposedBy: null,
        rescheduleExpiresAt: null,
        paymentStatus: current.paymentStatus,
      },
    });
    await tx.advisorSession.updateMany({ where: { bookingId: booking.id, status: { in: ['scheduled', 'in-progress'] } }, data: { status: 'cancelled' } });
    return { booking: updated, changed: true, refundPercent, paid: booking.paymentStatus === 'PAID' };
  }, LEDGER_TX_OPTIONS);

  if (result.changed && result.paid) {
    audit({ event: 'wallet.session_refunded', userId: input.actorId ?? undefined, resource: 'BookingRequest', resourceId: bookingId, meta: { percent: result.refundPercent, actor: input.actor, coins: result.booking.coinCost } });
    if (result.refundPercent > 0) {
      void notify({
        userId: result.booking.clientId,
        topic: 'wallet',
        type: 'session_refund',
        title: 'Refund processed',
        message: `${Math.floor((result.booking.coinCost ?? 0) * result.refundPercent / 100)} coins were returned to your wallet for a cancelled session.`,
        deepLink: '/wallet',
        priority: 'high',
        dedupKey: `session_refund:${bookingId}`,
      });
    }
  }
  return result;
};

/** Admin refund of a session that already completed (earnings released). */
export const adminRefundCompletedSession = async (bookingId: string, actor: { id: string; role: string }, percent: number, reason: string, now = new Date()) => {
  const result = await prisma.$transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId);
    if (!booking) throw new WalletError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    if (booking.paymentStatus !== 'PAID') throw new WalletError('NOT_REFUNDABLE', 'Only a paid session can be refunded.', 409);
    return refundTx(tx, booking, Math.max(0, Math.min(100, Math.round(percent))), { actorId: actor.id, actorRole: actor.role, reason }, now);
  }, LEDGER_TX_OPTIONS);
  audit({ event: 'wallet.session_refunded', userId: actor.id, resource: 'BookingRequest', resourceId: bookingId, meta: { percent, admin: true } });
  return result;
};

// ─── Complete / release ───────────────────────────────────────────────────────

/** Complete the session and release the advisor's held earnings, atomically. */
export const completeSessionWithRelease = async (sessionId: string, actor: { kind: 'advisor' | 'system'; userId: string | null }, notes?: string, now = new Date()) => {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "AdvisorSession" WHERE "id" = ${sessionId} FOR UPDATE`;
    const session = await tx.advisorSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new WalletError('BOOKING_NOT_FOUND', 'Session not found.', 404);
    if (session.status === 'completed') return { session, changed: false };
    if (session.status !== 'in-progress') throw new WalletError('SESSION_LOCKED', 'Session is not in progress.', 400);

    const updatedSession = await tx.advisorSession.update({
      where: { id: sessionId },
      data: { status: 'completed', endTime: now, ...(notes !== undefined ? { notes } : {}) },
    });
    const booking = await lockBooking(tx, session.bookingId);
    if (booking) {
      await tx.bookingRequest.updateMany({ where: { id: booking.id, status: 'accepted' }, data: { status: 'completed' } });
      if (booking.paymentStatus === 'PAID' && !booking.earningsReleasedAt && booking.coinCost) {
        await releaseEntries(tx, booking, booking.coinCost, { actorId: actor.userId, actorRole: actor.kind });
        await tx.bookingRequest.update({ where: { id: booking.id }, data: { earningsReleasedAt: now } });
      }
    }
    return { session: updatedSession, changed: true, booking };
  }, LEDGER_TX_OPTIONS).then((result) => {
    if (result.changed && result.booking?.paymentStatus === 'PAID') {
      audit({ event: 'wallet.earnings_released', userId: result.booking.advisorId, resource: 'BookingRequest', resourceId: result.booking.id, meta: { coins: result.booking.coinCost } });
      void notify({
        userId: result.booking.advisorId,
        topic: 'wallet',
        type: 'earnings_credited',
        title: 'Earnings credited',
        message: `${result.booking.coinCost} coins from a completed session are now in your available balance.`,
        deepLink: '/advisor-earnings',
        dedupKey: `earnings_released:${result.booking.id}`,
      });
    }
    return result;
  });
};

// ─── Server-clock settlement ──────────────────────────────────────────────────

const expireTx = async (tx: Tx, booking: BookingRow, now: Date, reason: string) => {
  const { count } = await tx.bookingRequest.updateMany({
    where: { id: booking.id, status: { in: ['pending', 'reschedule', 'accepted'] }, paymentStatus: { not: 'PAID' } },
    data: { status: 'expired', expiredAt: now, cancelReason: reason },
  });
  if (count) {
    await tx.advisorSession.updateMany({ where: { bookingId: booking.id, status: 'scheduled' }, data: { status: 'cancelled' } });
  }
  return count > 0;
};

/**
 * Bring one booking up to date with the server clock:
 *   - an unanswered request past its start           → expired
 *   - accepted, unpaid, inside the payment window    → charge now (if coins suffice)
 *   - accepted, unpaid, window closed                → expired (nothing charged)
 * Called by the sweeper, and lazily whenever a booking is opened or joined, so
 * a sleeping server instance cannot leave a session wrongly locked or unlocked.
 */
export const settleBookingIfDue = async (bookingId: string, now = new Date()): Promise<'charged' | 'expired' | 'insufficient' | 'none'> => {
  const booking = await prisma.bookingRequest.findUnique({ where: { id: bookingId } });
  // Rows created before 2026-09-30 carry no startsAt and never required coins.
  // The clock does not act on them: expiring or completing them automatically
  // would rewrite existing records under rules they were never booked under.
  if (!booking || !booking.startsAt) return 'none';
  const status = normalizeStatus(booking.status);
  const windows = bookingWindows(booking);
  if (!windows) return 'none';
  const t = now.getTime();

  if ((status === 'pending' || status === 'reschedule') && t >= windows.startsAt.getTime()) {
    const expired = await prisma.$transaction((tx) => expireTx(tx, booking, now, 'Request was not answered before the session start'), LEDGER_TX_OPTIONS);
    if (expired) {
      audit({ event: 'booking.expired', resource: 'BookingRequest', resourceId: booking.id, meta: { reason: 'unanswered' } });
      void notify({ userId: booking.clientId, topic: 'booking', type: 'booking_expired', title: 'Booking request expired', message: 'Your advisor did not respond before the session time. Nothing was charged.', deepLink: '/book-advisor', dedupKey: `booking_expired:${booking.id}:client` });
    }
    return expired ? 'expired' : 'none';
  }

  if (status !== 'accepted' || booking.paymentStatus !== 'UNPAID' || !booking.coinCost) return 'none';

  if (t >= windows.paymentClosesAt.getTime()) {
    const expired = await prisma.$transaction((tx) => expireTx(tx, booking, now, 'Session was not paid before the deadline'), LEDGER_TX_OPTIONS);
    if (expired) {
      audit({ event: 'booking.expired', resource: 'BookingRequest', resourceId: booking.id, meta: { reason: 'unpaid' } });
      void notify({ userId: booking.clientId, topic: 'booking', type: 'booking_expired', title: 'Session expired', message: 'The session was not paid in time and has expired. No coins were charged.', deepLink: '/book-advisor', priority: 'high', dedupKey: `booking_expired:${booking.id}:client` });
      void notify({ userId: booking.advisorId, topic: 'booking', type: 'booking_expired', title: 'Session expired', message: 'A booked session expired because it was not paid in time.', deepLink: '/advisor-panel', dedupKey: `booking_expired:${booking.id}:advisor` });
    }
    return expired ? 'expired' : 'none';
  }

  if (t >= windows.paymentDueAt.getTime()) {
    try {
      const result = await prisma.$transaction((tx) => payTx(tx, booking.id, { kind: 'system' }, now), LEDGER_TX_OPTIONS);
      if (result.paid) announcePayment(result.booking, result.debit?.id);
      return result.paid ? 'charged' : 'none';
    } catch (error) {
      if (error instanceof WalletError && (error.code === 'INSUFFICIENT_COINS' || error.code === 'WALLET_FROZEN')) {
        void notify({
          userId: booking.clientId,
          topic: 'wallet',
          type: 'session_payment_required',
          title: 'Payment required — insufficient coins',
          message: `Your session needs ${booking.coinCost} coins. Add coins now to keep your booking.`,
          deepLink: '/wallet',
          priority: 'high',
          dedupKey: `session_payment_required:${booking.id}`,
        });
        return 'insufficient';
      }
      if (error instanceof WalletError) return 'none';
      throw error;
    }
  }
  return 'none';
};

/** The session access decision for one user, after settling the booking against the clock. */
export const sessionAccess = async (sessionId: string, userId: string, now = new Date()) => {
  const session = await prisma.advisorSession.findFirst({
    where: { id: sessionId, OR: [{ advisorId: userId }, { clientId: userId }] },
    select: { id: true, status: true, bookingId: true, advisorId: true, clientId: true },
  });
  if (!session) return null;
  await settleBookingIfDue(session.bookingId, now);
  const [booking, fresh] = await Promise.all([
    prisma.bookingRequest.findUnique({ where: { id: session.bookingId } }),
    prisma.advisorSession.findUnique({ where: { id: sessionId }, select: { id: true, status: true } }),
  ]);
  if (!booking || !fresh) return null;
  const wallet = userId === booking.clientId && booking.paymentStatus === 'UNPAID' ? await getWalletSummary(userId) : null;
  const state = describeBookingState(booking, fresh, userId, now, wallet?.availableBalance);
  return { state, role: userId === session.advisorId ? 'advisor' as const : 'client' as const, booking };
};

/** Chat is part of the session: locked while the session is unpaid or over. */
export const chatAllowed = (lifecycle: BookingLifecycle) =>
  ['UPCOMING', 'READY', 'IN_PROGRESS'].includes(lifecycle);

// ─── Sweeper ───────────────────────────────────────────────────────────────────

/**
 * One pass of the session clock. Bounded batches; every step is idempotent, so
 * overlapping runs (two instances, a slow pass) are harmless.
 */
export const runSessionClock = async (now = new Date(), batch = 200) => {
  const horizon = new Date(now.getTime() + walletConfig.paymentLeadMinutes * MINUTE + MINUTE);
  const summary = { charged: 0, expired: 0, insufficient: 0, autoCompleted: 0, refundedUnstarted: 0 };

  // 1. Unpaid accepted sessions at/after their payment deadline, and unanswered
  //    requests past their start. Only rows with a real start instant (legacy
  //    rows are left alone, see settleBookingIfDue), and every condition is
  //    exact — a loose match let rows that were not due yet fill the batch on
  //    every tick, so a session that WAS due was never reached. Earliest first,
  //    so each tick makes progress on the oldest obligations.
  const due = await prisma.bookingRequest.findMany({
    where: {
      startsAt: { not: null },
      OR: [
        { status: 'accepted', paymentStatus: 'UNPAID', startsAt: { lte: horizon } },
        { status: { in: ['pending', 'reschedule'] }, startsAt: { lte: now } },
      ],
    },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: batch,
  });
  for (const { id } of due) {
    try {
      const outcome = await settleBookingIfDue(id, now);
      if (outcome === 'charged') summary.charged += 1;
      else if (outcome === 'expired') summary.expired += 1;
      else if (outcome === 'insufficient') summary.insufficient += 1;
    } catch (error) {
      logger.warn('[session-clock] settle failed', { bookingId: id, error });
    }
  }

  // 2. Sessions left in progress long after their end → complete + release.
  const autoCompleteBefore = new Date(now.getTime() - walletConfig.autoCompleteGraceMinutes * MINUTE);
  const stale = await prisma.advisorSession.findMany({
    where: { status: 'in-progress', booking: { endsAt: { not: null, lt: autoCompleteBefore } } },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: batch,
  });
  for (const { id } of stale) {
    try {
      const r = await completeSessionWithRelease(id, { kind: 'system', userId: null }, undefined, now);
      if (r.changed) summary.autoCompleted += 1;
    } catch (error) {
      logger.warn('[session-clock] auto-complete failed', { sessionId: id, error });
    }
  }

  // 3. Paid sessions never started by the end of their join window → refund (policy).
  if (walletConfig.refundUnstartedSessions) {
    const missedBefore = new Date(now.getTime() - walletConfig.joinLateMinutes * MINUTE);
    const missed = await prisma.bookingRequest.findMany({
      where: { status: 'accepted', paymentStatus: 'PAID', endsAt: { not: null, lt: missedBefore }, session: { status: 'scheduled' } },
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: batch,
    });
    for (const { id } of missed) {
      try {
        const r = await cancelBookingWithRefund(id, { actor: 'system', actorId: null, reason: 'Session was never started' }, now);
        if (r.changed) summary.refundedUnstarted += 1;
      } catch (error) {
        logger.warn('[session-clock] unstarted refund failed', { bookingId: id, error });
      }
    }
  }
  return summary;
};
