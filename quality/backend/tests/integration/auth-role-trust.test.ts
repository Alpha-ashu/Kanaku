/**
 * SECURITY REGRESSION: auth middleware must never derive privilege from
 * client-writable Supabase `user_metadata`.
 *
 * Supabase `user_metadata` is writable by the user themselves
 * (`supabase.auth.updateUser({ data: { role: 'admin' } })`). Before this fix the
 * middleware trusted `user_metadata.role` for any user without a DB snapshot and
 * then persisted it via `ensureUserInDb`, allowing self-elevation to admin.
 *
 * These tests pin the behaviour: a forged token with `user_metadata.role=admin`
 * must resolve to role `'user'` AND must not persist an elevated shadow row.
 */
import jwt from 'jsonwebtoken';

// Isolate the middleware from the real database and the idle-session/Redis layer.
const upsertMock = jest.fn().mockResolvedValue({});
const findUniqueMock = jest.fn().mockResolvedValue(null);
jest.mock('../../../../backend/src/db/prisma', () => ({
  prisma: { user: { upsert: upsertMock, findUnique: findUniqueMock } },
}));
jest.mock('../../../../backend/src/security/idleSession', () => ({
  evaluateIdleSession: jest.fn().mockResolvedValue(true), // session always considered active
}));

const SUPABASE_JWT_SECRET = 'test-supabase-jwt-secret-at-least-32-characters';

// auth.ts captures SUPABASE_JWT_SECRET at module-load time, so the env var must be
// set before the module is required (hence the lazy require inside beforeAll).
let authMiddleware: (req: any, res: any, next: any) => Promise<unknown>;

const forgedSupabaseToken = (userMetaRole: string) =>
  jwt.sign(
    {
      sub: 'attacker-user-id-0001',
      email: 'attacker@example.com',
      user_metadata: { role: userMetaRole, full_name: 'Mallory' },
      app_metadata: { role: userMetaRole },
    },
    SUPABASE_JWT_SECRET,
    { expiresIn: '15m' },
  );

const runMiddleware = async (token: string) => {
  const req: any = {
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
    path: '/api/v1/admin/users',
    ip: '127.0.0.1',
  };
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  await authMiddleware(req, res, next);
  return { req, res, next };
};

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_JWT_SECRET = SUPABASE_JWT_SECRET;
  // Ensure the custom-JWT path rejects the Supabase-signed token so we exercise
  // the Supabase verification branch (the one that used to trust user_metadata).
  process.env.JWT_SECRET = 'a-totally-different-custom-secret-32-chars-min';
  ({ authMiddleware } = require('../../../../backend/src/middleware/auth'));
});

beforeEach(() => {
  upsertMock.mockClear();
  findUniqueMock.mockClear();
});

describe('auth middleware — role trust hardening', () => {
  it('does NOT grant admin from a user_metadata.role=admin token', async () => {
    const { req, res, next } = await runMiddleware(forgedSupabaseToken('admin'));

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('user');
    expect(req.user.isApproved).toBe(false);
  });

  it('does NOT persist an elevated role when creating the shadow user row', async () => {
    await runMiddleware(forgedSupabaseToken('manager'));

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const createArg = upsertMock.mock.calls[0][0].create;
    expect(createArg.role).toBe('user');
    expect(createArg.isApproved).toBe(false);
    // Non-privilege identity fields are still carried over.
    expect(createArg.email).toBe('attacker@example.com');
  });
});
