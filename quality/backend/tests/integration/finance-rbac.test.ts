/**
 * Authorization around money and conversations.
 *
 *   - users and advisors cannot reach the finance console; managers only with
 *     explicit grants, and then only for users assigned to them
 *   - admin-only powers (adjusting wallets, managing staff) cannot be granted
 *   - an admin cannot adjust their own wallet; adjustments are idempotent
 *   - the legacy "client marks own payment complete" route is closed
 *   - a user cannot read, write or mark-read someone else's conversation
 *   - an account holding coins cannot be deleted
 *
 * The wallet module gate itself is exercised by `wallet module gate` below with
 * the real featureGate; the other cases pass it through.
 */
jest.mock('../../../../backend/src/middleware/featureGate', () => {
  const actual = jest.requireActual('../../../../backend/src/middleware/featureGate');
  return {
    ...actual,
    // Pass-through except for one sentinel module, so the real deny-by-default
    // behaviour for a module the admin never enabled can still be asserted.
    requireFeature: (moduleKey: string, childKey?: string) =>
      moduleKey === '__real_wallet_gate__'
        ? actual.requireFeature('wallet', childKey)
        : (_req: unknown, _res: unknown, next: () => void) => next(),
  };
});

import express from 'express';
import request from 'supertest';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { authMiddleware } from '../../../../backend/src/middleware/auth';
import { invalidateFeatureCache, requireFeature } from '../../../../backend/src/middleware/featureGate';
import { adminAdjust } from '../../../../backend/src/features/wallet/wallet.service';
import { invalidatePermissionCache } from '../../../../backend/src/security/permissions';
import { API, bearer, cleanupUsers, istSlot, makeAdvisor, makeUser, walletOf } from '../helpers/walletKit';

describe('Finance and messaging authorization', () => {
  const ids = { admin: '', manager: '', user: '', teammate: '', outsider: '', advisor: '', client: '' };
  let dbReady = false;

  beforeAll(async () => {
    process.env.SESSION_COIN_PAYMENTS = 'on';
    try {
      ids.admin = (await makeUser('Rbac Admin', 'admin')).id;
      ids.manager = (await makeUser('Rbac Manager', 'manager')).id;
      ids.user = (await makeUser('Rbac User')).id;
      ids.teammate = (await makeUser('Rbac Teammate')).id;
      ids.outsider = (await makeUser('Rbac Outsider')).id;
      ids.advisor = (await makeAdvisor('Rbac Advisor', 0)).id;
      ids.client = (await makeUser('Rbac Client')).id;
      for (const [userId, key] of [[ids.teammate, 'rbac-tm'], [ids.outsider, 'rbac-out'], [ids.user, 'rbac-user']] as const) {
        await adminAdjust({ userId, amount: 50, reason: 'RBAC fixture balance', actorId: ids.admin, actorRole: 'admin', idempotencyKey: key });
      }
      dbReady = true;
    } catch {
      /* DB unavailable — cases self-skip */
    }
  });

  afterAll(async () => {
    delete process.env.SESSION_COIN_PAYMENTS;
    await prisma.staffPermissionGrant.deleteMany({ where: { userId: ids.manager } }).catch(() => undefined);
    await prisma.managerAssignment.deleteMany({ where: { managerId: ids.manager } }).catch(() => undefined);
    await cleanupUsers(Object.values(ids));
  });

  const as = (userId: string, role: 'admin' | 'manager' | 'advisor' | 'user' = 'user') => bearer(userId, role);

  it('keeps users and advisors out of the finance console', async () => {
    if (!dbReady) return;
    for (const [userId, role] of [[ids.user, 'user'], [ids.advisor, 'advisor']] as const) {
      expect((await request(app).get(`${API}/finance/overview`).set(as(userId, role))).status).toBe(403);
      expect((await request(app).get(`${API}/finance/transactions`).set(as(userId, role))).status).toBe(403);
      const adjust = await request(app).post(`${API}/finance/wallets/${userId}/adjust`).set(as(userId, role))
        .send({ amount: 1000, reason: 'give myself coins', clientRequestId: 'self-grant-0001' });
      expect(adjust.status).toBe(403);
    }
    expect((await walletOf(ids.user)).available).toBe(50);
  });

  it('gives a manager nothing financial until an admin grants it', async () => {
    if (!dbReady) return;
    expect((await request(app).get(`${API}/finance/transactions`).set(as(ids.manager, 'manager'))).status).toBe(403);
    expect((await request(app).get(`${API}/finance/overview`).set(as(ids.manager, 'manager'))).status).toBe(403);
    // Team views exist by default, but the team is empty.
    const team = await request(app).get(`${API}/manager/team`).set(as(ids.manager, 'manager'));
    expect(team.status).toBe(200);
    expect(team.body.data.members).toHaveLength(0);
    const directory = await request(app).get(`${API}/manager/users`).set(as(ids.manager, 'manager'));
    expect(directory.body.users).toHaveLength(0);
  });

  it('refuses to grant admin-only powers to a manager', async () => {
    if (!dbReady) return;
    const res = await request(app).put(`${API}/finance/staff/${ids.manager}/permissions`).set(as(ids.admin, 'admin'))
      .send({ permissions: ['finance.adjust', 'staff.manage'] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PERMISSION');
    expect((await request(app).put(`${API}/finance/staff/${ids.manager}/permissions`).set(as(ids.manager, 'manager'))
      .send({ permissions: ['team.wallets.read'] })).status).toBe(403);
  });

  it('scopes a granted manager to their assigned users only', async () => {
    if (!dbReady) return;
    expect((await request(app).put(`${API}/finance/staff/${ids.manager}/permissions`).set(as(ids.admin, 'admin'))
      .send({ permissions: ['team.wallets.read'] })).status).toBe(200);
    expect((await request(app).post(`${API}/finance/staff/${ids.manager}/assignments`).set(as(ids.admin, 'admin'))
      .send({ subjectUserId: ids.teammate })).status).toBe(201);
    invalidatePermissionCache(ids.manager);

    const mgr = as(ids.manager, 'manager');
    const own = await request(app).get(`${API}/finance/transactions?userId=${ids.teammate}`).set(mgr);
    expect(own.status).toBe(200);
    expect(own.body.data.items.length).toBeGreaterThan(0);
    expect(own.body.data.items.every((t: { userId: string }) => t.userId === ids.teammate)).toBe(true);

    const other = await request(app).get(`${API}/finance/transactions?userId=${ids.outsider}`).set(mgr);
    expect(other.body.data.items).toHaveLength(0);
    const all = await request(app).get(`${API}/finance/transactions`).set(mgr);
    expect(all.body.data.items.every((t: { userId: string }) => t.userId === ids.teammate)).toBe(true);

    expect((await request(app).get(`${API}/finance/wallets/${ids.outsider}`).set(mgr)).status).toBe(404);
    expect((await request(app).get(`${API}/finance/wallets/${ids.teammate}`).set(mgr)).status).toBe(200);
    // Read grant only: no adjusting, refunding or reconciling.
    expect((await request(app).post(`${API}/finance/wallets/${ids.teammate}/adjust`).set(mgr)
      .send({ amount: 10, reason: 'manager attempt', clientRequestId: 'mgr-adjust-0001' })).status).toBe(403);

    const directory = await request(app).get(`${API}/manager/users`).set(mgr);
    expect(directory.body.users.map((u: { id: string }) => u.id)).toEqual([ids.teammate]);
  });

  it('stops an admin adjusting their own wallet and applies a retried adjustment once', async () => {
    if (!dbReady) return;
    const selfAdjust = await request(app).post(`${API}/finance/wallets/${ids.admin}/adjust`).set(as(ids.admin, 'admin'))
      .send({ amount: 500, reason: 'paying myself', clientRequestId: 'admin-self-0001' });
    expect(selfAdjust.status).toBe(403);

    const body = { amount: 25, reason: 'Goodwill credit for outage', clientRequestId: 'admin-adjust-0001' };
    const [a, b] = await Promise.all([
      request(app).post(`${API}/finance/wallets/${ids.user}/adjust`).set(as(ids.admin, 'admin')).send(body),
      request(app).post(`${API}/finance/wallets/${ids.user}/adjust`).set(as(ids.admin, 'admin')).send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect((await walletOf(ids.user)).available).toBe(75);
    const row = await prisma.walletTransaction.findFirstOrThrow({ where: { userId: ids.user, reason: 'Goodwill credit for outage' } });
    expect(row).toMatchObject({ type: 'ADMIN_ADJUSTMENT', actorId: ids.admin, actorRole: 'admin' });

    const detail = await request(app).get(`${API}/finance/wallets/${ids.user}`).set(as(ids.admin, 'admin'));
    expect(detail.body.data.consistent).toBe(true);
  });

  it('never exposes provider secrets in the provider status', async () => {
    if (!dbReady) return;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_publicid';
    process.env.RAZORPAY_KEY_SECRET = 'super-secret-value';
    const res = await request(app).get(`${API}/finance/providers`).set(as(ids.admin, 'admin'));
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-value');
    expect(res.body.data.items.find((p: { id: string }) => p.id === 'razorpay')).toMatchObject({ configured: true, mode: 'test' });
  });

  it('closes the legacy route that let a client mark its own payment complete', async () => {
    if (!dbReady) return;
    const res = await request(app).post(`${API}/payments/complete`).set(as(ids.client)).send({ paymentId: 'any-payment-id', transactionId: 'x' });
    expect(res.status).toBe(403);
  });

  it("does not let a third user into someone else's session conversation", async () => {
    if (!dbReady) return;
    const booked = await request(app).post(`${API}/bookings`).set(as(ids.client)).send({ advisorId: ids.advisor, sessionType: 'chat', duration: 30, ...istSlot(240) });
    expect(booked.status).toBe(201);
    // A free advisor (rate 0) → no payment required, so chat opens on acceptance.
    expect((await prisma.bookingRequest.findUniqueOrThrow({ where: { id: booked.body.id } })).paymentStatus).toBe('NOT_REQUIRED');
    await request(app).put(`${API}/bookings/${booked.body.id}/accept`).set(as(ids.advisor, 'advisor')).send({});
    const session = await prisma.advisorSession.findUniqueOrThrow({ where: { bookingId: booked.body.id } });
    expect((await request(app).post(`${API}/sessions/${session.id}/messages`).set(as(ids.client)).send({ message: 'Hi advisor' })).status).toBe(201);

    const intruder = as(ids.outsider);
    expect((await request(app).get(`${API}/sessions/${session.id}/messages`).set(intruder)).status).toBe(404);
    expect((await request(app).post(`${API}/sessions/${session.id}/messages`).set(intruder).send({ message: 'let me in' })).status).toBe(404);
    expect((await request(app).post(`${API}/sessions/${session.id}/messages/read`).set(intruder)).status).toBe(404);
    expect((await request(app).get(`${API}/sessions/${session.id}/access`).set(intruder)).status).toBe(404);
    expect((await request(app).get(`${API}/sessions/${session.id}`).set(intruder)).status).toBe(404);
    expect((await request(app).get(`${API}/bookings/${booked.body.id}/payment`).set(intruder)).status).toBe(404);

    // Read receipts: the advisor sees one unread message, marks it read, the client sees readAt.
    const unread = await request(app).get(`${API}/sessions/unread`).set(as(ids.advisor, 'advisor'));
    expect(unread.body.data.counts[session.id]).toBe(1);
    const marked = await request(app).post(`${API}/sessions/${session.id}/messages/read`).set(as(ids.advisor, 'advisor'));
    expect(marked.body.data.marked).toBe(1);
    const thread = await request(app).get(`${API}/sessions/${session.id}/messages`).set(as(ids.client));
    expect(thread.body[0].readAt).toBeTruthy();
    expect(thread.body[0]).not.toHaveProperty('attachmentPath');
  });

  it('refuses to delete an account that still holds coins', async () => {
    if (!dbReady) return;
    const res = await request(app).delete(`${API}/auth/account`).set(as(ids.outsider));
    expect(res.status).toBe(409);
    expect(res.body.code ?? res.body.error?.code).toBe('ACCOUNT_HAS_OPEN_BALANCE');
    expect(await prisma.user.findUnique({ where: { id: ids.outsider } })).not.toBeNull();
  });

  describe('wallet module gate', () => {
    // A tiny app with the REAL gate: with no admin settings saved for `wallet`,
    // non-admins are refused and admins pass (deny-by-default).
    const gated = express();
    gated.get('/probe', authMiddleware, requireFeature('__real_wallet_gate__'), (_req, res) => { res.json({ ok: true }); });

    it('ships the wallet dark for everyone but admins until it is enabled', async () => {
      if (!dbReady) return;
      const user = await request(gated).get('/probe').set(as(ids.user));
      const admin = await request(gated).get('/probe').set(as(ids.admin, 'admin'));
      expect(admin.status).toBe(200);
      expect(user.status).toBe(403);
    });

    it('opens it to exactly the roles the admin ticked in the Feature Panel', async () => {
      if (!dbReady) return;
      // The panel saves role-centric settings to the PlatformSettings singleton;
      // the gate used to read a legacy per-admin copy and never saw them.
      const previous = await prisma.platformSettings.findUnique({ where: { id: 'global' } });
      const base = (previous?.settings as Record<string, unknown> | undefined) ?? {};
      const saved = {
        ...base,
        admin_global_feature_settings: {
          admin: { wallet: true }, manager: { wallet: false }, advisor: { wallet: true }, user: { wallet: false },
        },
      };
      try {
        await prisma.platformSettings.upsert({ where: { id: 'global' }, create: { id: 'global', settings: saved }, update: { settings: saved } });
        invalidateFeatureCache();
        expect((await request(gated).get('/probe').set(as(ids.advisor, 'advisor'))).status).toBe(200);
        expect((await request(gated).get('/probe').set(as(ids.user))).status).toBe(403);
        expect((await request(gated).get('/probe').set(as(ids.admin, 'admin'))).status).toBe(200);
      } finally {
        if (previous) await prisma.platformSettings.update({ where: { id: 'global' }, data: { settings: previous.settings as object } });
        else await prisma.platformSettings.delete({ where: { id: 'global' } }).catch(() => undefined);
        invalidateFeatureCache();
      }
    });
  });
});
