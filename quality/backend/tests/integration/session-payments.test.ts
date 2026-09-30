/**
 * Advisor sessions paid in coins — booking to earnings, on the server clock.
 *
 *   - the price comes from the advisor's rate; a tampered `amount` is ignored
 *   - a session can only be paid once accepted, by its own client, once
 *   - pay = client −cost and advisor pending +cost, atomically
 *   - chat and the session stay locked until paid; start only inside the window
 *   - at T−5 the clock charges automatically; an unpaid session expires
 *     uncharged; an unanswered request expires at its start
 *   - cancel refunds by policy; the advisor cancelling refunds in full;
 *     a paid session never started is refunded
 *   - completion releases the advisor's earnings
 *   - every wallet always equals its ledger
 */
jest.mock('../../../../backend/src/middleware/featureGate', () => ({
  ...jest.requireActual('../../../../backend/src/middleware/featureGate'),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { adminAdjust } from '../../../../backend/src/features/wallet/wallet.service';
import { runSessionClock } from '../../../../backend/src/features/wallet/sessionPayment.service';
import { drainNotifications } from '../../../../backend/src/features/notifications/notify';
import { API, bearer, cleanupUsers, istSlot, ledgerOf, makeAdvisor, makeUser, walletOf } from '../helpers/walletKit';

const RATE = 600; // ₹600/h → 600 coins for 60 minutes at 1 coin = ₹1

describe('Session payments', () => {
  const ids = { admin: '', advisor: '', client: '', broke: '', stranger: '' };
  let dbReady = false;

  beforeAll(async () => {
    process.env.SESSION_COIN_PAYMENTS = 'on';
    try {
      ids.admin = (await makeUser('Pay Admin', 'admin')).id;
      ids.advisor = (await makeAdvisor('Pay Advisor', RATE)).id;
      ids.client = (await makeUser('Pay Client')).id;
      ids.broke = (await makeUser('Broke Client')).id;
      ids.stranger = (await makeUser('Pay Stranger')).id;
      dbReady = true;
    } catch {
      /* DB unavailable — cases self-skip */
    }
  });

  afterAll(async () => {
    delete process.env.SESSION_COIN_PAYMENTS;
    delete process.env.SESSION_LATE_CANCEL_REFUND_PERCENT;
    await cleanupUsers(Object.values(ids));
  });

  const topUp = (userId: string, amount: number, key: string) =>
    adminAdjust({ userId, amount, reason: 'Test top-up for session payments', actorId: ids.admin, actorRole: 'admin', idempotencyKey: key });

  const book = (clientId: string, minutesFromNow: number, extra: Record<string, unknown> = {}) =>
    request(app).post(`${API}/bookings`).set(bearer(clientId)).send({
      advisorId: ids.advisor, sessionType: 'video', duration: 60, ...istSlot(minutesFromNow), ...extra,
    });

  const accept = (bookingId: string) => request(app).put(`${API}/bookings/${bookingId}/accept`).set(bearer(ids.advisor, 'advisor')).send({});
  const pay = (bookingId: string, userId = ids.client) => request(app).post(`${API}/bookings/${bookingId}/pay`).set(bearer(userId));
  const state = (bookingId: string, userId = ids.client) => request(app).get(`${API}/bookings/${bookingId}/payment`).set(bearer(userId));
  const sessionOf = (bookingId: string) => prisma.advisorSession.findUniqueOrThrow({ where: { bookingId } });

  const expectLedgerConsistent = async (userId: string) => {
    const [wallet, ledger] = await Promise.all([walletOf(userId), ledgerOf(userId)]);
    expect(ledger.available).toBe(wallet.available);
    expect(ledger.pending).toBe(wallet.pending);
  };

  let far = ''; // booking 3 hours out

  it('prices the session on the server and ignores a tampered amount', async () => {
    if (!dbReady) return;
    const res = await book(ids.client, 180, { amount: 1 });
    expect(res.status).toBe(201);
    far = res.body.id;
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: far } });
    expect(Number(row.amount)).toBe(RATE);
    expect(row.coinCost).toBe(RATE);
    expect(row.paymentStatus).toBe('UNPAID');
    expect(row.timeZone).toBe('Asia/Kolkata');
    expect(row.startsAt!.getTime()).toBeGreaterThan(Date.now() + 170 * 60_000);
    expect(row.endsAt!.getTime() - row.startsAt!.getTime()).toBe(60 * 60_000);
  });

  it('refuses payment before the advisor accepts, and from anyone but the client', async () => {
    if (!dbReady) return;
    expect((await pay(far)).body.code).toBe('BOOKING_NOT_PAYABLE');
    expect((await accept(far)).status).toBe(200);
    expect((await pay(far, ids.stranger)).status).toBe(404);
    expect((await state(far, ids.stranger)).status).toBe(404);
    expect((await pay(far, ids.advisor)).status).toBe(404);
  });

  it('keeps an unpaid session locked and says why when coins are short', async () => {
    if (!dbReady) return;
    const s = await state(far);
    expect(s.body.data).toMatchObject({ lifecycle: 'AWAITING_PAYMENT', canPay: true, canJoin: false, coinCost: RATE, walletBalance: 0 });
    expect(Date.parse(s.body.data.paymentDueAt)).toBe(Date.parse(s.body.data.startsAt) - 5 * 60_000);

    const session = await sessionOf(far);
    const chat = await request(app).post(`${API}/sessions/${session.id}/messages`).set(bearer(ids.client)).send({ message: 'hello before paying' });
    expect(chat.status).toBe(423);
    expect(chat.body.code).toBe('SESSION_LOCKED');

    const short = await pay(far);
    expect(short.status).toBe(409);
    expect(short.body.code).toBe('INSUFFICIENT_COINS');
    expect(await walletOf(ids.advisor)).toMatchObject({ available: 0, pending: 0 });
  });

  it('charges once for a double-tapped payment: client −cost, advisor pending +cost', async () => {
    if (!dbReady) return;
    await topUp(ids.client, 1000, 'session-topup-1');
    const [a, b] = await Promise.all([pay(far), pay(far)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.data.alreadyPaid, b.body.data.alreadyPaid].sort()).toEqual([false, true]);
    expect(await walletOf(ids.client)).toMatchObject({ available: 400 });
    expect(await walletOf(ids.advisor)).toMatchObject({ available: 0, pending: RATE });
    const rows = await prisma.walletTransaction.findMany({ where: { bookingId: far } });
    expect(rows.map((r) => r.type).sort()).toEqual(['SESSION_EARNING', 'SESSION_PAYMENT']);

    const s = (await state(far)).body.data;
    expect(s).toMatchObject({ paymentStatus: 'PAID', lifecycle: 'UPCOMING', canJoin: false, canPay: false });
  });

  it('unlocks chat once paid, but not the session before its window', async () => {
    if (!dbReady) return;
    const session = await sessionOf(far);
    const chat = await request(app).post(`${API}/sessions/${session.id}/messages`).set(bearer(ids.client)).send({ message: 'see you then' });
    expect(chat.status).toBe(201);
    const start = await request(app).post(`${API}/sessions/${session.id}/start`).set(bearer(ids.advisor, 'advisor'));
    expect(start.status).toBe(423);
    expect(start.body.lifecycle).toBe('UPCOMING');
    const access = await request(app).get(`${API}/sessions/${session.id}/access`).set(bearer(ids.client));
    expect(access.body.data).toMatchObject({ canJoin: false, lifecycle: 'UPCOMING', role: 'client' });
  });

  it('refunds in full when the client cancels well ahead', async () => {
    if (!dbReady) return;
    const res = await request(app).put(`${API}/bookings/${far}/cancel`).set(bearer(ids.client)).send({ reason: 'Plans changed' });
    expect(res.status).toBe(200);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: far } });
    expect(row).toMatchObject({ status: 'cancelled', paymentStatus: 'REFUNDED', cancelledBy: 'client' });
    expect((await sessionOf(far)).status).toBe('cancelled');
    expect(await walletOf(ids.client)).toMatchObject({ available: 1000 });
    expect(await walletOf(ids.advisor)).toMatchObject({ available: 0, pending: 0 });
    // A second cancel changes nothing.
    expect((await request(app).put(`${API}/bookings/${far}/cancel`).set(bearer(ids.client)).send({})).status).toBe(400);
    expect(await walletOf(ids.client)).toMatchObject({ available: 1000 });
  });

  it('pays, starts, completes and releases the earnings for a session starting now', async () => {
    if (!dbReady) return;
    const booked = await book(ids.client, 3);
    expect(booked.status).toBe(201);
    const id = booked.body.id;
    await accept(id);
    // Already past the T−5 deadline and the client has coins: merely opening the
    // booking settles it on the server clock (no timer needed), so it is paid
    // and ready, and an explicit pay is answered as a replay.
    expect((await state(id)).body.data).toMatchObject({ lifecycle: 'READY', paymentStatus: 'PAID', canJoin: true });
    const replay = await pay(id);
    expect(replay.status).toBe(200);
    expect(replay.body.data.alreadyPaid).toBe(true);
    expect(await prisma.walletTransaction.count({ where: { bookingId: id, type: 'SESSION_PAYMENT' } })).toBe(1);

    const session = await sessionOf(id);
    const started = await request(app).post(`${API}/sessions/${session.id}/start`).set(bearer(ids.advisor, 'advisor'));
    expect(started.status).toBe(200);
    expect((await request(app).get(`${API}/sessions/${session.id}/access`).set(bearer(ids.client))).body.data.lifecycle).toBe('IN_PROGRESS');

    const done = await request(app).post(`${API}/sessions/${session.id}/complete`).set(bearer(ids.advisor, 'advisor')).send({ notes: 'Good session' });
    expect(done.status).toBe(200);
    expect(await walletOf(ids.advisor)).toMatchObject({ available: RATE, pending: 0 });
    expect(await walletOf(ids.client)).toMatchObject({ available: 400 });
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('completed');
    expect(row.earningsReleasedAt).toBeTruthy();

    const earnings = await request(app).get(`${API}/wallet/earnings`).set(bearer(ids.advisor, 'advisor'));
    expect(earnings.body.data).toMatchObject({ availableBalance: RATE, pendingBalance: 0, completedSessions: 1 });
    expect(earnings.body.data.earned.total).toBe(RATE);
    expect(earnings.body.data.earned.today).toBe(RATE);
    // The advisor's view of the earning does not identify the client.
    expect(JSON.stringify(earnings.body.data.recent)).not.toContain(ids.client);
  });

  it('charges automatically at the payment deadline when coins suffice', async () => {
    if (!dbReady) return;
    await topUp(ids.client, RATE, 'session-topup-auto');
    expect((await walletOf(ids.client)).available).toBe(400 + RATE);
    const id = (await book(ids.client, 4)).body.id;
    await accept(id);
    const summary = await runSessionClock(new Date());
    expect(summary.charged).toBeGreaterThanOrEqual(1);
    expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id } })).paymentStatus).toBe('PAID');
    expect((await walletOf(ids.client)).available).toBe(400);
    // Notifications are sent fire-and-forget; wait for them before counting.
    await drainNotifications();
    expect(await prisma.notification.count({ where: { userId: ids.client, type: 'session_payment_success' } })).toBeGreaterThanOrEqual(1);

    // Settle it so later cases start from known balances (default late policy refunds in full).
    await request(app).put(`${API}/bookings/${id}/cancel`).set(bearer(ids.client)).send({});
    expect((await walletOf(ids.client)).available).toBe(400 + RATE);
  });

  it('expires an unpaid session after its window, charging nothing, and warns first', async () => {
    if (!dbReady) return;
    const id = (await book(ids.broke, 3)).body.id;
    await accept(id);
    await runSessionClock(new Date());
    await drainNotifications();
    expect(await prisma.notification.count({ where: { userId: ids.broke, type: 'session_payment_required' } })).toBe(1);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.paymentStatus).toBe('UNPAID');

    await runSessionClock(new Date(row.startsAt!.getTime() + 11 * 60_000));
    const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({ status: 'expired', paymentStatus: 'UNPAID' });
    expect((await sessionOf(id)).status).toBe('cancelled');
    expect(await walletOf(ids.broke)).toMatchObject({ available: 0 });
    expect((await pay(id, ids.broke)).body.code).toBe('BOOKING_NOT_PAYABLE');
  });

  it('is not starved by bookings that are not due, and leaves legacy rows alone', async () => {
    if (!dbReady) return;
    // A crowd the clock must skip: legacy rows (no startsAt, created before
    // coin payments) and requests starting tomorrow.
    const crowd = await Promise.all(Array.from({ length: 6 }, (_, i) => prisma.bookingRequest.create({
      data: {
        clientId: ids.broke, advisorId: ids.advisor, sessionType: 'video', proposedDate: new Date(Date.now() - 3600_000),
        proposedTime: '09:00', duration: 60, amount: 0, status: 'pending',
        ...(i % 2 === 0 ? {} : { startsAt: new Date(Date.now() + 24 * 3600_000 + i * 60_000) }),
      },
    })));
    await topUp(ids.client, RATE, 'session-topup-starve');
    const due = (await book(ids.client, 4)).body.id;
    await accept(due);

    // A batch of 2 would have been filled by the crowd before the fix.
    await runSessionClock(new Date(), 2);
    expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id: due } })).paymentStatus).toBe('PAID');
    for (const row of crowd) {
      expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('pending');
    }
    await prisma.bookingRequest.deleteMany({ where: { id: { in: crowd.map((r) => r.id) } } });
    // Settle it so later cases keep known balances.
    await request(app).put(`${API}/bookings/${due}/cancel`).set(bearer(ids.client)).send({});
  });

  it('expires a request nobody answered before it started', async () => {
    if (!dbReady) return;
    const id = (await book(ids.broke, 2)).body.id;
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    await runSessionClock(new Date(row.startsAt!.getTime() + 60_000));
    expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id } })).status).toBe('expired');
  });

  it('refunds a paid session that was never started', async () => {
    if (!dbReady) return;
    await topUp(ids.client, RATE, 'session-topup-2');
    const before = await walletOf(ids.client);
    const id = (await book(ids.client, 3)).body.id;
    await accept(id);
    const paid = await pay(id);
    expect({ status: paid.status, body: paid.body }).toMatchObject({ status: 200 });
    expect((await walletOf(ids.client)).available).toBe(before.available - RATE);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    await runSessionClock(new Date(row.endsAt!.getTime() + 16 * 60_000));
    const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({ status: 'cancelled', paymentStatus: 'REFUNDED', cancelledBy: 'system' });
    expect((await walletOf(ids.client)).available).toBe(before.available);
  });

  it('refunds in full when the advisor cancels, and by policy when the client cancels late', async () => {
    if (!dbReady) return;
    await topUp(ids.client, 2 * RATE, 'session-topup-3');
    const start = await walletOf(ids.client);
    const advisorStart = await walletOf(ids.advisor);

    const byAdvisor = (await book(ids.client, 30)).body.id;
    await accept(byAdvisor);
    await pay(byAdvisor);
    const session = await sessionOf(byAdvisor);
    const cancelled = await request(app).post(`${API}/sessions/${session.id}/cancel`).set(bearer(ids.advisor, 'advisor')).send({ reason: 'Unwell' });
    expect(cancelled.status).toBe(200);
    expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id: byAdvisor } })).status).toBe('cancelled');
    expect((await walletOf(ids.client)).available).toBe(start.available);

    process.env.SESSION_LATE_CANCEL_REFUND_PERCENT = '50';
    const late = (await book(ids.client, 20)).body.id;
    await accept(late);
    await pay(late);
    await request(app).put(`${API}/bookings/${late}/cancel`).set(bearer(ids.client)).send({});
    delete process.env.SESSION_LATE_CANCEL_REFUND_PERCENT;
    expect((await walletOf(ids.client)).available).toBe(start.available - RATE / 2);
    expect((await walletOf(ids.advisor)).available).toBe(advisorStart.available + RATE / 2);
    expect((await walletOf(ids.advisor)).pending).toBe(advisorStart.pending);
  });

  it('keeps every wallet equal to its ledger', async () => {
    if (!dbReady) return;
    for (const userId of [ids.client, ids.advisor, ids.broke]) await expectLedgerConsistent(userId);
  });
});
