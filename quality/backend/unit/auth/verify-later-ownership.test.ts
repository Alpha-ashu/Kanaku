/**
 * POST /auth/verify-later must prove account ownership before issuing a session.
 *
 * The endpoint originally accepted only `{ email }` and returned access + refresh
 * tokens for that account — anyone who knew a registered email could take it over
 * (admins included), and its status write re-activated blocked users. It now
 * requires the password (same check as login), refuses locked accounts, and only
 * applies to accounts still awaiting their signup OTP.
 *
 * Every collaborator is mocked, so this is a pure unit test (no DB/Redis).
 */
const mockVerifyPasswordOnly = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockGenerateTokens = jest.fn();

jest.mock('../../../../backend/src/features/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    verifyPasswordOnly: (...args: unknown[]) => mockVerifyPasswordOnly(...args),
  })),
  getCachedUserByEmail: jest.fn(),
  resolveSignupPhoneHold: jest.fn(),
}));
jest.mock('../../../../backend/src/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));
jest.mock('../../../../backend/src/utils/auth', () => ({
  generateTokens: (...args: unknown[]) => mockGenerateTokens(...args),
  verifyRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
  REFRESH_TOKEN_TTL_SECONDS: 3600,
}));
jest.mock('../../../../backend/src/middleware/auth', () => ({ invalidateUserSnapshotCache: jest.fn() }));
jest.mock('../../../../backend/src/cache/redis', () => ({
  cacheGetJson: jest.fn(), cacheSetJson: jest.fn(), cacheDeleteByPrefix: jest.fn(),
  getRedisClient: jest.fn(), getRedisStatus: jest.fn(),
}));
jest.mock('../../../../backend/src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../backend/src/features/auth/otp.service', () => ({ generateOtp: jest.fn(), verifyOtp: jest.fn() }));
jest.mock('../../../../backend/src/features/auth/device.service', () => ({
  checkDeviceTrust: jest.fn(), trustDevice: jest.fn(), revokeDeviceTrust: jest.fn(), listUserDevices: jest.fn(),
}));
jest.mock('../../../../backend/src/features/otp/otp.service', () => ({ otpService: {} }));
jest.mock('../../../../backend/src/utils/databaseAvailability', () => ({ isDatabaseUnavailableError: () => false }));
jest.mock('../../../../backend/src/security/refreshCookie', () => ({
  setRefreshCookie: jest.fn(), clearRefreshCookie: jest.fn(), readRefreshCookie: jest.fn(),
}));
jest.mock('../../../../backend/src/security/idleSession', () => ({ establishIdleSession: jest.fn(), clearIdleSession: jest.fn() }));
jest.mock('../../../../backend/src/security/tokenRevocation', () => ({ revokeToken: jest.fn(), isTokenRevoked: jest.fn() }));
jest.mock('../../../../backend/src/security/pinUnlock', () => ({
  clearPinUnlock: jest.fn(), isPinUnlocked: jest.fn(), PIN_UNLOCK_HEADER: 'x-pin-unlock',
}));
jest.mock('../../../../backend/src/emails', () => ({ sendWelcomeEmail: jest.fn(), sendLoginAlertEmail: jest.fn() }));
jest.mock('../../../../backend/src/utils/auditLogger', () => ({ auditFromRequest: jest.fn() }));
jest.mock('../../../../backend/src/utils/protectedAccounts', () => ({ isProtectedAccount: () => false }));
jest.mock('../../../../backend/src/features/auth/registration.defaults', () => ({ normalizePhone: (p: string) => p }));

import { verifyLater } from '../../../../backend/src/features/auth/auth.controller';

const PENDING_USER = { id: 'user-1', email: 'victim@example.com', role: 'user', isApproved: true, status: 'pending_verification' };

const run = async (body: unknown) => {
  const req: any = { body, headers: {}, ip: '127.0.0.1' };
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await verifyLater(req, res, next);
  return { res, next, error: next.mock.calls[0]?.[0] };
};

beforeEach(() => {
  mockFindUnique.mockResolvedValue({ ...PENDING_USER });
  mockUpdate.mockImplementation(async ({ data }: any) => ({ ...PENDING_USER, ...data }));
  mockGenerateTokens.mockReturnValue({ user: { id: 'user-1' }, accessToken: 'at', refreshToken: 'rt', expiresAt: 1 });
});
afterEach(() => jest.clearAllMocks());

describe('verifyLater ownership', () => {
  it('rejects an email-only request without issuing tokens', async () => {
    const { res, error } = await run({ email: 'victim@example.com' });

    expect(error).toMatchObject({ statusCode: 400, code: 'MISSING_FIELDS' });
    expect(mockGenerateTokens).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects a wrong password without issuing tokens', async () => {
    mockVerifyPasswordOnly.mockResolvedValue({ valid: false, status: null, accountType: 'NORMAL', demoStatus: 'ENABLED', emailVerified: false });

    const { error } = await run({ email: 'victim@example.com', password: 'guess' });

    expect(error).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    expect(mockGenerateTokens).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses to re-activate a blocked account', async () => {
    mockVerifyPasswordOnly.mockResolvedValue({ valid: true, status: 'blocked', accountType: 'NORMAL', demoStatus: 'ENABLED', emailVerified: false });

    const { error } = await run({ email: 'victim@example.com', password: 'right' });

    expect(error).toMatchObject({ statusCode: 403, code: 'ACCOUNT_SUSPENDED' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses accounts that are not awaiting verification', async () => {
    mockVerifyPasswordOnly.mockResolvedValue({ valid: true, status: 'verified', accountType: 'NORMAL', demoStatus: 'ENABLED', emailVerified: true });

    const { error } = await run({ email: 'victim@example.com', password: 'right' });

    expect(error).toMatchObject({ statusCode: 409, code: 'NOT_PENDING_VERIFICATION' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('defers verification for the owner of a pending account', async () => {
    mockVerifyPasswordOnly.mockResolvedValue({ valid: true, status: 'pending_verification', accountType: 'NORMAL', demoStatus: 'ENABLED', emailVerified: false });

    const { res, error } = await run({ email: 'Victim@Example.com ', password: 'right' });

    expect(error).toBeUndefined();
    expect(mockVerifyPasswordOnly).toHaveBeenCalledWith('victim@example.com', 'right');
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { status: 'active' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
