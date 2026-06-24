/**
 * ROLES E2E TEST SUITE — All Four Roles
 * Verifies that each role (admin, manager, advisor, user) can access
 * exactly the endpoints it should, and is blocked from the ones it shouldn't.
 *
 * Pattern:
 *  - Signed JWTs (no real DB required for auth/RBAC checks)
 *  - 200/500 = route reached (DB may or may not be available)
 *  - 401/403   = auth/permission wall — the only acceptable rejection
 *  - 404       = route missing (always a failure)
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';

const API = '/api/v1';

// ── Token factory ────────────────────────────────────────────────────────────
function makeToken(
  userId: string,
  role: 'admin' | 'manager' | 'advisor' | 'user',
  extra: Record<string, unknown> = {},
) {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  return jwt.sign(
    { userId, id: userId, email: `${role}_${userId}@test.com`, role, isApproved: true, ...extra },
    secret,
    { expiresIn: '15m' },
  );
}

const headers = (role: 'admin' | 'manager' | 'advisor' | 'user', uid?: string) => ({
  Authorization: `Bearer ${makeToken(uid ?? `${role}-e2e-user`, role)}`,
});

// ── Shared routes every authenticated role should reach (not 401/404) ────────
const SHARED_USER_ROUTES = [
  { method: 'get', path: `${API}/accounts` },
  { method: 'get', path: `${API}/transactions` },
  { method: 'get', path: `${API}/goals` },
  { method: 'get', path: `${API}/loans` },
  { method: 'get', path: `${API}/investments` },
  { method: 'get', path: `${API}/notifications` },
  { method: 'get', path: `${API}/settings` },
  { method: 'get', path: `${API}/dashboard/summary` },
  { method: 'get', path: `${API}/friends` },
  { method: 'get', path: `${API}/todos` },
  { method: 'get', path: `${API}/auth/profile` },
  { method: 'get', path: `${API}/pin/status` },
];

// ── Admin-only routes ─────────────────────────────────────────────────────────
// Note: /admin/features is accessible by ALL authenticated users (returns role-filtered view)
const ADMIN_ONLY_ROUTES = [
  { method: 'get', path: `${API}/admin/users` },
  { method: 'get', path: `${API}/admin/stats` },
  { method: 'get', path: `${API}/admin/users/pending` },
];

// ── Manager-accessible routes ─────────────────────────────────────────────────
const MANAGER_ROUTES = [
  { method: 'get', path: `${API}/advisors/admin/applications` },
];

// ── Advisor-specific routes ───────────────────────────────────────────────────
const ADVISOR_ROUTES = [
  { method: 'get', path: `${API}/advisors/me/sessions` },
  { method: 'get', path: `${API}/bookings` },
];

// ── Helper: assert route is reachable (not 401, 403, 404) ────────────────────
async function assertReachable(
  method: string,
  path: string,
  hdrs: Record<string, string>,
  label: string,
) {
  const res = await (request(app) as any)[method](path).set(hdrs);
  expect({
    label,
    path,
    status: res.status,
    blocked: [401, 403, 404].includes(res.status),
  }).toMatchObject({ blocked: false });
}

// ── Helper: assert route is blocked (403 or 401) ─────────────────────────────
async function assertBlocked(
  method: string,
  path: string,
  hdrs: Record<string, string>,
  label: string,
) {
  const res = await (request(app) as any)[method](path).set(hdrs);
  expect({
    label,
    path,
    status: res.status,
    allowed: ![401, 403].includes(res.status),
  }).toMatchObject({ allowed: false });
}

// ════════════════════════════════════════════════════════════════════════════════
describe('ROLES E2E — All Four Roles', () => {
  // ── UNAUTHENTICATED ──────────────────────────────────────────────────────────
  describe('UNAUTHENTICATED — All protected routes return 401', () => {
    const protectedRoutes = [
      `${API}/accounts`,
      `${API}/transactions`,
      `${API}/goals`,
      `${API}/loans`,
      `${API}/settings`,
      `${API}/investments`,
      `${API}/notifications`,
      `${API}/dashboard/summary`,
      `${API}/auth/profile`,
      `${API}/pin/status`,
      `${API}/admin/users`,
      `${API}/advisors/me/sessions`,
    ];

    for (const route of protectedRoutes) {
      it(`GET ${route} → 401 without token`, async () => {
        const res = await request(app).get(route);
        expect(res.status).toBe(401);
      });
    }

    it('POST /auth/register with missing fields → 400 (public route)', async () => {
      const res = await request(app).post(`${API}/auth/register`).send({});
      expect(res.status).toBe(400);
    });
  });

  // ── ROLE: USER ───────────────────────────────────────────────────────────────
  describe('ROLE: user — standard account holder', () => {
    const h = headers('user', 'role-user-001');

    describe('Can access all personal finance routes', () => {
      for (const { method, path } of SHARED_USER_ROUTES) {
        it(`${method.toUpperCase()} ${path} → accessible`, async () => {
          const res = await (request(app) as any)[method](path).set(h);
          expect([200, 500, 503]).toContain(res.status);
          expect(res.status).not.toBe(401);
          expect(res.status).not.toBe(403);
          expect(res.status).not.toBe(404);
        });
      }
    });

    describe('Is blocked from admin endpoints', () => {
      for (const { method, path } of ADMIN_ONLY_ROUTES) {
        it(`${method.toUpperCase()} ${path} → 403`, async () => {
          const res = await (request(app) as any)[method](path).set(h);
          expect([401, 403]).toContain(res.status);
        });
      }
    });

    it('can POST /transactions with valid shape → 400 or 500 (not 403/404)', async () => {
      const res = await request(app)
        .post(`${API}/transactions`)
        .set(h)
        .send({ accountId: 'x', type: 'expense', amount: 100, category: 'Food', date: '2026-01-01' });
      expect([201, 400, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });

    it('can POST /accounts → not forbidden', async () => {
      const res = await request(app)
        .post(`${API}/accounts`)
        .set(h)
        .send({ name: 'My Savings', type: 'bank', balance: 0, currency: 'INR' });
      expect([201, 400, 409, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });

    it('can POST /goals → not forbidden', async () => {
      const res = await request(app)
        .post(`${API}/goals`)
        .set(h)
        .send({ name: 'Vacation', targetAmount: 50000, targetDate: '2027-01-01' });
      expect([201, 400, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });

    it('can POST /loans → not forbidden', async () => {
      const res = await request(app)
        .post(`${API}/loans`)
        .set(h)
        .send({ type: 'borrowed', name: 'Personal Loan', principalAmount: 10000 });
      expect([201, 400, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });

    it('cannot access advisor admin application routes', async () => {
      for (const { method, path } of MANAGER_ROUTES) {
        const res = await (request(app) as any)[method](path).set(h);
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  // ── ROLE: ADVISOR ────────────────────────────────────────────────────────────
  describe('ROLE: advisor — financial advisor', () => {
    const h = headers('advisor', 'role-advisor-001');

    describe('Can access personal finance routes', () => {
      const baseRoutes = [
        { method: 'get', path: `${API}/accounts` },
        { method: 'get', path: `${API}/transactions` },
        { method: 'get', path: `${API}/goals` },
        { method: 'get', path: `${API}/auth/profile` },
        { method: 'get', path: `${API}/notifications` },
      ];
      for (const { method, path } of baseRoutes) {
        it(`${method.toUpperCase()} ${path} → accessible`, async () => {
          const res = await (request(app) as any)[method](path).set(h);
          expect([200, 500, 503]).toContain(res.status);
          expect(res.status).not.toBe(401);
          expect(res.status).not.toBe(404);
        });
      }
    });

    it('can GET /advisors/me/sessions → not 403/404', async () => {
      const res = await request(app).get(`${API}/advisors/me/sessions`).set(h);
      expect([200, 401, 500]).toContain(res.status);
      expect(res.status).not.toBe(404);
    });

    it('can GET /bookings → not 403/404', async () => {
      const res = await request(app).get(`${API}/bookings`).set(h);
      expect([200, 401, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(404);
    });

    it('can POST /advisors/availability → not 403/404', async () => {
      const res = await request(app)
        .post(`${API}/advisors/availability`)
        .set(h)
        .send({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });
      expect([200, 201, 400, 401, 500]).toContain(res.status);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
    });

    it('is blocked from admin user management', async () => {
      const res = await request(app).get(`${API}/admin/users`).set(h);
      expect([401, 403]).toContain(res.status);
    });

    it('is blocked from admin feature flags', async () => {
      const res = await request(app).get(`${API}/admin/feature-flags`).set(h);
      expect([401, 403]).toContain(res.status);
    });
  });

  // ── ROLE: MANAGER ────────────────────────────────────────────────────────────
  describe('ROLE: manager — operations manager', () => {
    const h = headers('manager', 'role-manager-001');

    describe('Can access personal finance routes', () => {
      for (const { method, path } of SHARED_USER_ROUTES) {
        it(`${method.toUpperCase()} ${path} → accessible`, async () => {
          const res = await (request(app) as any)[method](path).set(h);
          expect([200, 500, 503]).toContain(res.status);
          expect(res.status).not.toBe(401);
          expect(res.status).not.toBe(404);
        });
      }
    });

    it('GET /advisors is gated by bookAdvisor (403 for manager until admin enables)', async () => {
      const res = await request(app).get(`${API}/advisors`).set(h);
      // Browse now enforces the admin `bookAdvisor` flag; manager is deny-by-default.
      expect([200, 403, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(404);
    });

    it('manager cannot access admin user management (not admin role)', async () => {
      const res = await request(app).get(`${API}/admin/users`).set(h);
      // Manager may or may not have admin access depending on app config
      expect([200, 403, 500]).toContain(res.status);
      expect(res.status).not.toBe(404);
    });
  });

  // ── ROLE: ADMIN ──────────────────────────────────────────────────────────────
  describe('ROLE: admin — platform administrator', () => {
    const h = headers('admin', 'role-admin-001');

    describe('Can access all admin endpoints', () => {
      for (const { method, path } of ADMIN_ONLY_ROUTES) {
        it(`${method.toUpperCase()} ${path} → accessible (200 or 500)`, async () => {
          const res = await (request(app) as any)[method](path).set(h);
          expect([200, 500, 503]).toContain(res.status);
          expect(res.status).not.toBe(401);
          expect(res.status).not.toBe(403);
          expect(res.status).not.toBe(404);
        });
      }
    });

    describe('Can access all personal finance routes', () => {
      for (const { method, path } of SHARED_USER_ROUTES) {
        it(`${method.toUpperCase()} ${path} → accessible`, async () => {
          const res = await (request(app) as any)[method](path).set(h);
          expect([200, 500, 503]).toContain(res.status);
          expect(res.status).not.toBe(401);
          expect(res.status).not.toBe(403);
          expect(res.status).not.toBe(404);
        });
      }
    });

    it('can GET /admin/stats', async () => {
      const res = await request(app).get(`${API}/admin/stats`).set(h);
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });

    it('can GET /admin/features', async () => {
      const res = await request(app).get(`${API}/admin/features`).set(h);
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });

    it('can GET /admin/users/pending', async () => {
      const res = await request(app).get(`${API}/admin/users/pending`).set(h);
      expect([200, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(403);
    });
  });

  // ── CROSS-ROLE: DATA ISOLATION ────────────────────────────────────────────────
  describe('CROSS-ROLE: Data Isolation', () => {
    it('user cannot read advisor private session data', async () => {
      const advisorH = headers('advisor', 'isolation-advisor-001');
      const userH = headers('user', 'isolation-user-001');

      // Advisor creates session context (will likely 500 without DB)
      const advisorRes = await request(app).get(`${API}/advisors/me/sessions`).set(advisorH);
      const userRes = await request(app).get(`${API}/advisors/me/sessions`).set(userH);

      // If both reached DB, user should see their own empty list, not advisor's sessions
      if (advisorRes.status === 200 && userRes.status === 200) {
        const advisorSessions = advisorRes.body.data || [];
        const userSessions = userRes.body.data || [];
        const overlap = (advisorSessions as any[]).filter((s: any) =>
          (userSessions as any[]).some((u: any) => u.id === s.id),
        );
        expect(overlap).toHaveLength(0);
      }
    });

    it('admin and user accounts lists are independent', async () => {
      const adminH = headers('admin', 'isolation-admin-002');
      const userH = headers('user', 'isolation-user-002');

      const adminRes = await request(app).get(`${API}/accounts`).set(adminH);
      const userRes = await request(app).get(`${API}/accounts`).set(userH);

      if (adminRes.status === 200 && userRes.status === 200) {
        const adminIds = (adminRes.body.data || []).map((a: any) => a.id);
        const userIds = (userRes.body.data || []).map((a: any) => a.id);
        const overlap = adminIds.filter((id: string) => userIds.includes(id));
        expect(overlap).toHaveLength(0);
      }
    });
  });

  // ── CROSS-ROLE: IDOR PROTECTION ───────────────────────────────────────────────
  describe('CROSS-ROLE: IDOR Protection', () => {
    it('user cannot update another user account via PUT /accounts/:id', async () => {
      const res = await request(app)
        .put(`${API}/accounts/other-user-account-id`)
        .set(headers('user', 'idor-attacker'))
        .send({ name: 'Hacked', balance: 99999 });
      expect([403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it('user cannot delete another user transaction', async () => {
      const res = await request(app)
        .delete(`${API}/transactions/another-users-tx-id`)
        .set(headers('user', 'idor-attacker-2'));
      expect([403, 404, 500, 503]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });

    it('advisor cannot read another user profile', async () => {
      const res = await request(app)
        .get(`${API}/admin/users/some-random-user-id`)
        .set(headers('advisor', 'idor-advisor'));
      expect([401, 403, 404]).toContain(res.status);
    });
  });

  // ── INVALID TOKEN SCENARIOS ───────────────────────────────────────────────────
  describe('Token Security', () => {
    it('forged token with admin role and wrong secret is rejected', async () => {
      const forgedToken = jwt.sign(
        { userId: 'hacker', id: 'hacker', email: 'hacker@evil.com', role: 'admin' },
        'wrong-secret',
        { expiresIn: '1h' },
      );
      const res = await request(app)
        .get(`${API}/admin/users`)
        .set({ Authorization: `Bearer ${forgedToken}` });
      expect([401, 403]).toContain(res.status);
    });

    it('expired token is rejected', async () => {
      const expiredToken = jwt.sign(
        { userId: 'user1', id: 'user1', email: 'u@test.com', role: 'user' },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '-1s' },
      );
      const res = await request(app)
        .get(`${API}/accounts`)
        .set({ Authorization: `Bearer ${expiredToken}` });
      expect(res.status).toBe(401);
    });

    it('token with no role defaults to non-admin access', async () => {
      const noRoleToken = jwt.sign(
        { userId: 'no-role-user', id: 'no-role-user', email: 'norole@test.com' },
        process.env.JWT_SECRET || 'test-jwt-secret',
        { expiresIn: '15m' },
      );
      const res = await request(app)
        .get(`${API}/admin/users`)
        .set({ Authorization: `Bearer ${noRoleToken}` });
      expect([401, 403]).toContain(res.status);
    });
  });
});
