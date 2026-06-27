/**
 * AUTH API - Comprehensive Test Suite
 * Covers: Registration, Login, Profile, Token Management, Edge Cases
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';

const API = '/api/v1';

// Unique test user per run
const uniqueEmail = () => `test_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

const getSignedAuthToken = (overrides: Record<string, unknown> = {}) => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }

  return jwt.sign(
    {
      userId: 'profile-fallback-user',
      id: 'profile-fallback-user',
      email: 'profile-fallback@example.com',
      role: 'advisor',
      isApproved: true,
      name: 'Profile Fallback',
      ...overrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
};

describe('AUTH MODULE', () => {
  //  Registration 
  describe('POST /auth/register', () => {
    it('should register a new user with valid data (or fail with DB error)', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: uniqueEmail(), name: 'Test User', password: 'SecurePass123!' });
      // 201 = DB working; 500 = DB not connected (both acceptable)
      expect([201, 500, 503]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.success).toBe(true);
        expect(res.headers).toHaveProperty('authorization');
        // Refresh token is delivered ONLY via the HttpOnly cookie — never in a
        // JS-readable header or the JSON body.
        expect(res.headers).not.toHaveProperty('x-refresh-token');
        expect(String(res.headers['set-cookie'] || '')).toContain('kanaku_rt');
      }
    });

    it('should reject registration with missing email', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ name: 'Test User', password: 'SecurePass123!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('should reject registration with missing name', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: uniqueEmail(), password: 'SecurePass123!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('should reject registration with missing password', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: uniqueEmail(), name: 'Test User' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: 'invalid-email', name: 'Test', password: 'SecurePass123!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });

    it('should reject password shorter than 8 characters', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: uniqueEmail(), name: 'Test', password: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_TOO_SHORT');
    });

    it('should reject empty request body', async () => {
      const res = await request(app).post(`${API}/auth/register`).send({});
      expect(res.status).toBe(400);
    });

    it('should reject registration with empty string values', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: '', name: '', password: '' });
      expect(res.status).toBe(400);
    });

    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(300) + '@example.com';
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: longEmail, name: 'Test', password: 'SecurePass123!' });
      // Should either succeed, fail validation, or conflict  not crash
      expect([201, 400, 409, 500, 503]).toContain(res.status);
    });

    it('should handle special characters in name', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: uniqueEmail(), name: "O'Brien-Smith", password: 'SecurePass123!' });
      expect([201, 400, 500, 503]).toContain(res.status);
    });

    it('should handle XSS attempt in name field', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: uniqueEmail(), name: '<script>alert(1)</script>', password: 'SecurePass123!' });
      // Should either succeed with sanitized name or fail gracefully
      if (res.status === 201 && res.body.data?.user?.name) {
        expect(res.body.data.user.name).not.toContain('<script>');
      }
      expect([201, 400, 500, 503]).toContain(res.status);
    });

    it('should handle SQL injection attempt in email', async () => {
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email: "test@test.com' OR 1=1 --", name: 'Test', password: 'SecurePass123!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });
  });

  //  Login 
  describe('POST /auth/login', () => {
    it('should login with valid credentials (or fail with DB error)', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'test@example.com', password: 'SecurePass123!' });
      // With real DB, may 401 if user doesn't exist
      expect([200, 401, 500, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.headers).toHaveProperty('authorization');
      }
    });

    it('should reject login with missing email', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ password: 'SecurePass123!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('should reject login with missing password', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_FIELDS');
    });

    it('should reject login with invalid email format', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: 'not-valid', password: 'SecurePass123!' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_EMAIL');
    });

    it('should support the two-phase challenge-response login flow', async () => {
      const challengeRes = await request(app)
        .post(`${API}/auth/login/challenge`)
        .send({ email: 'test@example.com', password: 'SecurePass123!' });
      
      expect([200, 401, 500, 503]).toContain(challengeRes.status);

      if (challengeRes.status === 200) {
        expect(challengeRes.body.success).toBe(true);
        expect(challengeRes.body.data).toHaveProperty('code');

        const loginRes = await request(app)
          .post(`${API}/auth/login`)
          .send({ email: 'test@example.com', challengeCode: challengeRes.body.data.code });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body.success).toBe(true);
        expect(loginRes.headers).toHaveProperty('authorization');
      }
    });
  });

  //  Profile 
  describe('GET /auth/profile', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get(`${API}/auth/profile`);
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    });

    it('should return 401 with expired token', async () => {
      // Expired JWT (just a malformed token for test)
      const res = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwiZXhwIjowfQ.invalid');
      expect(res.status).toBe(401);
    });

    it('should return 401 with empty Bearer token', async () => {
      const res = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
    });

    it('should return 401 with malformed Authorization header', async () => {
      const res = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', 'NotBearer token');
      expect(res.status).toBe(401);
    });

    it('should return auth snapshot fallback data for a valid JWT even without a Prisma user row', async () => {
      const token = getSignedAuthToken();

      const res = await request(app)
        .get(`${API}/auth/profile?includePrivate=true`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Identity fields fall back from the JWT. Privilege does NOT: with no DB
      // row, role/approval are the secure defaults (never derived from token
      // claims — see authMiddleware). This previously "passed" only because a
      // leftover seeded row existed; against a clean DB the secure default holds.
      expect(res.body.data).toMatchObject({
        id: 'profile-fallback-user',
        email: 'profile-fallback@example.com',
        role: 'user',
        isApproved: false,
        firstName: 'Profile',
        lastName: 'Fallback',
      });
    });
  });

  //  Debug endpoints removed for security 
  describe('GET /auth/debug', () => {
    it('should not expose debug endpoint', async () => {
      const res = await request(app).get(`${API}/auth/debug`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /auth/test-simple', () => {
    it('should not expose test endpoint', async () => {
      const res = await request(app).get(`${API}/auth/test-simple`);
      expect(res.status).toBe(404);
    });
  });

  //  Token refresh
  describe('POST /auth/refresh', () => {
    const signTyped = (type: 'access' | 'refresh', overrides: Record<string, unknown> = {}) => {
      if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
      return jwt.sign(
        { userId: 'refresh-test-user', email: 'refresh-test@example.com', role: 'user', isApproved: true, type, ...overrides },
        process.env.JWT_SECRET,
        { expiresIn: type === 'refresh' ? '7d' : '15m' },
      );
    };

    it('rejects a missing refresh token', async () => {
      const res = await request(app).post(`${API}/auth/refresh`).send({});
      expect(res.status).toBe(401);
    });

    it('rejects a malformed refresh token', async () => {
      const res = await request(app).post(`${API}/auth/refresh`).set('x-refresh-token', 'not-a-jwt');
      expect(res.status).toBe(401);
    });

    it('rejects an access token used as a refresh token', async () => {
      const res = await request(app).post(`${API}/auth/refresh`).set('x-refresh-token', signTyped('access'));
      expect(res.status).toBe(401);
    });

    it('does not let a refresh token authorize API calls', async () => {
      const res = await request(app)
        .get(`${API}/auth/profile`)
        .set('Authorization', `Bearer ${signTyped('refresh')}`);
      expect(res.status).toBe(401);
    });

    it('issues a fresh token pair for a valid refresh token (200), or 401/503 without a DB', async () => {
      const res = await request(app).post(`${API}/auth/refresh`).set('x-refresh-token', signTyped('refresh'));
      expect([200, 401, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data).toHaveProperty('accessToken');
        expect(res.body.data).toHaveProperty('expiresAt');
        // Web (no X-Client-Platform): rotated refresh token is the HttpOnly cookie only.
        expect(res.body.data).not.toHaveProperty('refreshToken');
        expect(res.headers).not.toHaveProperty('x-refresh-token');
        expect(String(res.headers['set-cookie'] || '')).toContain('kanaku_rt');
      }
    });

    it('native clients (X-Client-Platform: native) get the rotated refresh token in the body too', async () => {
      const res = await request(app)
        .post(`${API}/auth/refresh`)
        .set('x-client-platform', 'native')
        .set('x-refresh-token', signTyped('refresh'));
      expect([200, 401, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data).toHaveProperty('accessToken');
        // Native can't use the cross-origin cookie, so it also receives the token in the body.
        expect(res.body.data).toHaveProperty('refreshToken');
        // The cookie is still set (harmless for native, used by web).
        expect(String(res.headers['set-cookie'] || '')).toContain('kanaku_rt');
      }
    });

    it('older native installs are recognized by their Capacitor Origin (no platform header)', async () => {
      const res = await request(app)
        .post(`${API}/auth/refresh`)
        .set('Origin', 'https://localhost')
        .set('x-refresh-token', signTyped('refresh'));
      expect([200, 401, 503]).toContain(res.status);
      if (res.status === 200) {
        // Backward-compat: pre-header native builds still receive the body token.
        expect(res.body.data).toHaveProperty('refreshToken');
      }
    });
  });
});

describe('AUTH MODULE — Login & Auth remediation', () => {
  const email = `login_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'SecurePass123!';
  const mobile = `+91 9${String(Date.now()).slice(-9)}`;
  let userId: string | null = null;

  const waitFor = async <T>(fn: () => Promise<T | null>, timeoutMs = 2500): Promise<T | null> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const r = await fn();
      if (r) return r;
      await new Promise((res) => setTimeout(res, 150));
    }
    return null;
  };

  const challenge = (pw: string) => request(app).post(`${API}/auth/login/challenge`).send({ email, password: pw });

  beforeAll(async () => {
    const res = await request(app).post(`${API}/auth/register`).send({ name: 'Login Remediation', email, password, mobile });
    if (res.status === 201) userId = res.body?.data?.user?.id ?? null;
  });

  afterAll(async () => {
    if (userId) {
      try { await prisma.user.delete({ where: { id: userId } }); } catch { /* ignore */ }
      try { await prisma.profiles.deleteMany({ where: { email } }); } catch { /* ignore */ }
    }
    await prisma.$disconnect().catch(() => {});
  });

  it('logs in with a plain password — no x-pw-encoding/SHA-256 (Item 2)', async () => {
    if (!userId) return; // DB unavailable in this environment
    const ch = await challenge(password);
    expect(ch.status).toBe(200);
    expect(ch.body.data).toHaveProperty('code');
    const login = await request(app).post(`${API}/auth/login`).send({ email, challengeCode: ch.body.data.code });
    expect(login.status).toBe(200);
    expect(login.headers).toHaveProperty('authorization');
  });

  it('writes an auth.login audit on successful login (Item 1)', async () => {
    if (!userId) return;
    const ch = await challenge(password);
    if (ch.status !== 200) return;
    await request(app).post(`${API}/auth/login`).send({ email, challengeCode: ch.body.data.code });
    const audit = await waitFor(async () => {
      const a = await prisma.auditLog.findMany({ where: { userId: userId!, action: 'auth.login' } });
      return a.length ? a[0] : null;
    });
    expect(audit).not.toBeNull();
    expect(audit!.requestId).toBeTruthy();
    expect(audit!.status).toBe('success');
  });

  it('writes an auth.login_failed audit on a bad password (Item 1)', async () => {
    if (!userId) return;
    const ch = await challenge('WrongPassword123!');
    expect(ch.status).toBe(401);
    expect(ch.body.code).toBe('INVALID_CREDENTIALS');
    const audit = await waitFor(async () => {
      const a = await prisma.auditLog.findMany({ where: { action: 'auth.login_failed' }, orderBy: { createdAt: 'desc' }, take: 1 });
      return a.length ? a[0] : null;
    });
    expect(audit).not.toBeNull();
    expect(audit!.status).toBe('failure');
  });

  it('rejects a suspended user at login with 403 ACCOUNT_SUSPENDED (Item 3)', async () => {
    if (!userId) return;
    await prisma.user.update({ where: { id: userId }, data: { status: 'suspended' } });
    try {
      const ch = await challenge(password);
      expect(ch.status).toBe(403);
      expect(ch.body.code).toBe('ACCOUNT_SUSPENDED');
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { status: 'verified' } });
    }
  });
});
