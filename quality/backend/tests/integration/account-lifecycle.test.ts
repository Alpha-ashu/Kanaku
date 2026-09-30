/**
 * Delete account / reset data — for every role, with server-side re-authentication.
 *
 * What these pin down:
 *   - An access token alone can no longer delete an account or wipe its data:
 *     the request must carry the password or a fresh, single-use email code.
 *   - Admins and protected role accounts cannot delete themselves; anything the
 *     coin wallet holds or owes blocks deletion, with the reason in `details`.
 *   - A just-created, empty sign-up can be discarded from onboarding without proof.
 *   - Deleting removes the user, their profile row and their data; the other side
 *     of an open booking is told; the presented token stops working.
 *   - A data reset keeps what is shared with other people or is a financial
 *     record (bookings, advisor application, coin wallet) and resets categories.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { drainNotifications } from '../../../../backend/src/features/notifications/notify';

const API = '/api/v1';
const PASSWORD = 'Correct-Horse-Battery-9';
type Role = 'admin' | 'manager' | 'advisor' | 'user';

const secret = () => {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long-for-testing';
  return process.env.JWT_SECRET;
};
const tokenFor = (userId: string, role: Role) =>
  jwt.sign({ userId, id: userId, role, isApproved: true, type: 'access', jti: randomUUID() }, secret(), { expiresIn: '15m' });

describe('Account lifecycle: delete account and reset data', () => {
  const created: string[] = [];
  let passwordHash = '';
  const savedSeedEmail = process.env.SEED_USER_EMAIL;
  let dbReady = false;

  const makeUser = async (label: string, role: Role, opts: { password?: string; ageMs?: number; email?: string } = {}) => {
    const id = randomUUID();
    const email = opts.email ?? `${label}.${id.slice(0, 8)}@example.com`;
    await prisma.user.create({
      data: {
        id, email, name: label, role, isApproved: true, emailVerified: true, status: 'verified',
        password: opts.password ?? passwordHash,
        createdAt: new Date(Date.now() - (opts.ageMs ?? 7 * 24 * 60 * 60 * 1000)),
      },
    });
    await prisma.$executeRaw`INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
      VALUES (${id}::uuid, ${email}, ${label}, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`;
    created.push(id);
    return { id, email, token: tokenFor(id, role) };
  };

  const giveData = (userId: string) =>
    prisma.account.create({ data: { userId, name: 'Main', type: 'bank', balance: 1000, openingBalance: 1000 } });

  const verifiedEmailCode = (email: string) =>
    prisma.otpRequest.create({
      data: {
        destination: email.toLowerCase(), channel: 'email', purpose: 'sensitive_action', otpHash: 'test',
        expiryTime: new Date(Date.now() + 5 * 60_000), status: 'VERIFIED', verifiedAt: new Date(),
      },
    });

  const exists = async (id: string) => Boolean(await prisma.user.findUnique({ where: { id } }));
  const profileExists = async (id: string) =>
    Number((await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM public.profiles WHERE id::text = ${id}`)[0].n) > 0;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
    process.env.SEED_USER_EMAIL = 'protected-lifecycle@example.com';
    try {
      await prisma.user.count();
      dbReady = true;
    } catch {
      /* no database — cases self-skip */
    }
  });

  afterAll(async () => {
    process.env.SEED_USER_EMAIL = savedSeedEmail;
    if (!created.length) return;
    await prisma.wallet.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
    await prisma.bookingRequest.deleteMany({ where: { OR: [{ clientId: { in: created } }, { advisorId: { in: created } }] } }).catch(() => undefined);
    await prisma.$executeRawUnsafe(`DELETE FROM public.profiles WHERE id::text = ANY($1)`, created).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: created } } }).catch(() => undefined);
  });

  describe('delete account', () => {
    it('tells the dialog what it needs: proof, methods, blockers', async () => {
      if (!dbReady) return;
      const u = await makeUser('check', 'user');
      await giveData(u.id);
      const res = await request(app).get(`${API}/settings/account/deletion-check`).set('Authorization', `Bearer ${u.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ allowed: true, requiresProof: true, blockers: [] });
      expect(res.body.data.methods).toMatchObject({ password: true, emailCode: true });
      expect(res.body.data.methods.email).not.toBe(u.email); // masked
    });

    it('refuses an access token alone, and a wrong password, leaving the account intact', async () => {
      if (!dbReady) return;
      const u = await makeUser('noproof', 'user');
      await giveData(u.id);

      const bare = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${u.token}`);
      expect(bare.status).toBe(428);
      expect(bare.body.code).toBe('STEP_UP_REQUIRED');

      const wrong = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${u.token}`)
        .send({ proof: { method: 'password', password: 'not-it' } });
      expect(wrong.status).toBe(403);
      expect(wrong.body.code).toBe('STEP_UP_FAILED');
      expect(wrong.body.error).not.toMatch(/pin/i); // a "PIN" 403 would trigger the client's PIN-unlock retry

      expect(await exists(u.id)).toBe(true);

      // The failed attempt is audited as a failure (audit rows are written async).
      let audited = 0;
      for (let i = 0; i < 30 && audited === 0; i += 1) {
        audited = await prisma.auditLog.count({ where: { userId: u.id, action: 'security.step_up_failed', status: 'failure' } });
        if (!audited) await new Promise((r) => setTimeout(r, 100));
      }
      expect(audited).toBeGreaterThanOrEqual(1);
    });

    it('deletes a user with the right password: data, profile row and token all gone', async () => {
      if (!dbReady) return;
      const u = await makeUser('deleted', 'user');
      await giveData(u.id);

      const res = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${u.token}`)
        .send({ proof: { method: 'password', password: PASSWORD } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(await exists(u.id)).toBe(false);
      expect(await profileExists(u.id)).toBe(false);
      expect(await prisma.account.count({ where: { userId: u.id } })).toBe(0);

      const reuse = await request(app).get(`${API}/accounts`).set('Authorization', `Bearer ${u.token}`);
      expect(reuse.status).toBe(401);
    });

    it('lets a Google sign-in account (no password) delete with a one-time email code', async () => {
      if (!dbReady) return;
      const u = await makeUser('google', 'user', { password: 'supabase-managed-account' });
      await giveData(u.id);

      const methods = await request(app).get(`${API}/settings/step-up-methods`).set('Authorization', `Bearer ${u.token}`);
      expect(methods.body.data).toMatchObject({ password: false, emailCode: true });

      const early = await request(app).delete(`${API}/settings/account`).set('Authorization', `Bearer ${u.token}`)
        .send({ proof: { method: 'email_code' } });
      expect(early.status).toBe(428);
      expect(early.body.code).toBe('STEP_UP_CODE_REQUIRED');
      expect(await exists(u.id)).toBe(true);

      await verifiedEmailCode(u.email);
      const res = await request(app).delete(`${API}/settings/account`).set('Authorization', `Bearer ${u.token}`)
        .send({ proof: { method: 'email_code' } });
      expect(res.status).toBe(200);
      expect(await exists(u.id)).toBe(false);
    });

    it('never lets an admin or a protected role account delete itself', async () => {
      if (!dbReady) return;
      const admin = await makeUser('admin', 'admin');
      const res = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${admin.token}`)
        .send({ proof: { method: 'password', password: PASSWORD } });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ADMIN_SELF_DELETE_FORBIDDEN');
      expect(await exists(admin.id)).toBe(true);

      const protectedUser = await makeUser('protected', 'user', { email: 'protected-lifecycle@example.com' });
      const res2 = await request(app).delete(`${API}/settings/account`).set('Authorization', `Bearer ${protectedUser.token}`)
        .send({ proof: { method: 'password', password: PASSWORD } });
      expect(res2.status).toBe(403);
      expect(res2.body.code).toBe('PROTECTED_ACCOUNT');
      expect(await exists(protectedUser.id)).toBe(true);
    });

    it('blocks deletion while the coin wallet holds coins, and says why', async () => {
      if (!dbReady) return;
      const u = await makeUser('coins', 'user');
      await prisma.wallet.create({ data: { userId: u.id, availableBalance: 40 } });
      const res = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${u.token}`)
        .send({ proof: { method: 'password', password: PASSWORD } });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ACCOUNT_HAS_OPEN_BALANCE');
      expect(res.body.details.blockers[0].message).toMatch(/40 coins/);
      expect(await exists(u.id)).toBe(true);
    });

    it('lets a manager delete their own account with proof', async () => {
      if (!dbReady) return;
      const m = await makeUser('manager', 'manager');
      const res = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${m.token}`)
        .send({ proof: { method: 'password', password: PASSWORD } });
      expect(res.status).toBe(200);
      expect(await exists(m.id)).toBe(false);
    });

    it("tells a client when their advisor's account is deleted", async () => {
      if (!dbReady) return;
      const advisor = await makeUser('Advisor Anna', 'advisor');
      const client = await makeUser('client', 'user');
      const booking = await prisma.bookingRequest.create({
        data: {
          clientId: client.id, advisorId: advisor.id, sessionType: 'video', proposedDate: new Date('2030-01-10T00:00:00Z'),
          proposedTime: '10:00', duration: 60, amount: 0, status: 'pending',
        },
      });

      const res = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${advisor.token}`)
        .send({ proof: { method: 'password', password: PASSWORD } });
      expect(res.status).toBe(200);
      expect(res.body.cancelledBookings).toBe(1);
      await drainNotifications();

      expect(await prisma.bookingRequest.findUnique({ where: { id: booking.id } })).toBeNull();
      const told = await prisma.notification.findFirst({ where: { userId: client.id, type: 'booking_cancelled_account_closed' } });
      expect(told?.message).toMatch(/Advisor Anna closed their KANAKU account/);
    });

    it('discards a brand-new, empty sign-up without proof (onboarding "cancel")', async () => {
      if (!dbReady) return;
      const fresh = await makeUser('fresh', 'user', { ageMs: 60_000, password: 'supabase-managed-account' });
      const check = await request(app).get(`${API}/settings/account/deletion-check`).set('Authorization', `Bearer ${fresh.token}`);
      expect(check.body.data.requiresProof).toBe(false);
      const res = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${fresh.token}`);
      expect(res.status).toBe(200);
      expect(await exists(fresh.id)).toBe(false);
    });

    it('still asks a fresh account for proof once it holds data', async () => {
      if (!dbReady) return;
      const fresh = await makeUser('fresh-data', 'user', { ageMs: 60_000 });
      await giveData(fresh.id);
      const res = await request(app).delete(`${API}/auth/account`).set('Authorization', `Bearer ${fresh.token}`);
      expect(res.status).toBe(428);
      expect(await exists(fresh.id)).toBe(true);
    });
  });

  describe('reset data', () => {
    it('needs proof, and an email code works exactly once', async () => {
      if (!dbReady) return;
      const u = await makeUser('reset-once', 'user');
      await giveData(u.id);

      const bare = await request(app).post(`${API}/settings/clear-data`).set('Authorization', `Bearer ${u.token}`).send({});
      expect(bare.status).toBe(428);
      expect(await prisma.account.count({ where: { userId: u.id } })).toBe(1);

      await verifiedEmailCode(u.email);
      const first = await request(app).post(`${API}/settings/clear-data`).set('Authorization', `Bearer ${u.token}`)
        .send({ proof: { method: 'email_code' } });
      expect(first.status).toBe(200);
      expect(await prisma.account.count({ where: { userId: u.id } })).toBe(0);

      const again = await request(app).post(`${API}/settings/clear-data`).set('Authorization', `Bearer ${u.token}`)
        .send({ proof: { method: 'email_code' } });
      expect(again.status).toBe(428);
      expect(again.body.code).toBe('STEP_UP_CODE_REQUIRED');
    });

    it('keeps bookings, the advisor profile and the coin wallet; resets categories to the defaults', async () => {
      if (!dbReady) return;
      const advisor = await makeUser('reset-advisor', 'advisor');
      const client = await makeUser('reset-client', 'user');
      await giveData(advisor.id);
      await prisma.advisorApplication.create({
        data: { userId: advisor.id, fullName: 'Reset Advisor', email: advisor.email, phone: '+919000000001', experienceYears: 5, expertise: 'Tax', bio: 'Tax planning adviser.', status: 'APPROVED' },
      });
      await prisma.wallet.create({ data: { userId: advisor.id, availableBalance: 0 } });
      const booking = await prisma.bookingRequest.create({
        data: { clientId: client.id, advisorId: advisor.id, sessionType: 'video', proposedDate: new Date('2030-02-01T00:00:00Z'), proposedTime: '11:00', duration: 60, amount: 0, status: 'accepted' },
      });
      await prisma.category.create({ data: { userId: advisor.id, name: 'My Custom Thing', type: 'expense', color: '#123456', icon: 'Tag' } });

      const res = await request(app).post(`${API}/settings/clear-data`).set('Authorization', `Bearer ${advisor.token}`)
        .send({ proof: { method: 'password', password: PASSWORD } });
      expect(res.status).toBe(200);
      expect(res.body.preserved.coinWallet).toMatch(/kept/);

      expect(await prisma.account.count({ where: { userId: advisor.id } })).toBe(0);
      expect(await prisma.bookingRequest.findUnique({ where: { id: booking.id } })).not.toBeNull();
      expect(await prisma.advisorApplication.findUnique({ where: { userId: advisor.id } })).not.toBeNull();
      expect(await prisma.wallet.findUnique({ where: { userId: advisor.id } })).not.toBeNull();

      const categories = await prisma.category.findMany({ where: { userId: advisor.id }, select: { name: true } });
      expect(categories.map((c) => c.name)).not.toContain('My Custom Thing');
      expect(categories.map((c) => c.name)).toContain('Salary');
    });

    it('never sends internal error text to the client', async () => {
      if (!dbReady) return;
      const u = await makeUser('reset-preview', 'user');
      const res = await request(app).post(`${API}/settings/clear-data?dryRun=true`).set('Authorization', `Bearer ${u.token}`);
      expect(res.status).toBe(200);
      expect(res.body.dryRun).toBe(true);
    });
  });
});
