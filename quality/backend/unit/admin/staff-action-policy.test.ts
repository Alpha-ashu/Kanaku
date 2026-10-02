/**
 * The rules for staff changing someone's access, in isolation: the cases that
 * depend on how many admins exist and on money still open, which a shared
 * integration database cannot pin down.
 */
const mockFindUnique = jest.fn();
const mockCount = jest.fn();
const mockApplication = jest.fn();
const mockBlockers = jest.fn();

jest.mock('../../../../backend/src/db/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a), count: (...a: unknown[]) => mockCount(...a) },
    advisorApplication: { findUnique: (...a: unknown[]) => mockApplication(...a) },
  },
}));
jest.mock('../../../../backend/src/features/wallet/wallet.guards', () => ({
  financialDeletionBlockers: (...a: unknown[]) => mockBlockers(...a),
}));
jest.mock('../../../../backend/src/utils/protectedAccounts', () => ({
  isProtectedAccount: (email?: string | null) => email === 'admin@kanaku.com',
}));

import { StaffActionError, assertRoleChangeAllowed, assertStatusChangeAllowed } from '../../../../backend/src/features/admin/staffActionPolicy';

const target = (over: Record<string, unknown> = {}) => ({ id: 't1', email: 't@example.com', role: 'user', status: 'active', ...over });
const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e: StaffActionError) => e.code);

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue(target());
  mockCount.mockReset().mockResolvedValue(1);
  mockApplication.mockReset().mockResolvedValue(null);
  mockBlockers.mockReset().mockResolvedValue([]);
});

describe('assertRoleChangeAllowed', () => {
  it('refuses an unknown role, yourself, a protected account and a no-op', async () => {
    expect(await code(assertRoleChangeAllowed('a1', 't1', 'superadmin'))).toBe('INVALID_ROLE');
    expect(await code(assertRoleChangeAllowed('t1', 't1', 'manager'))).toBe('SELF_ACTION');
    mockFindUnique.mockResolvedValueOnce(target({ email: 'admin@kanaku.com' }));
    expect(await code(assertRoleChangeAllowed('a1', 't1', 'manager'))).toBe('PROTECTED_ACCOUNT');
    expect(await code(assertRoleChangeAllowed('a1', 't1', 'user'))).toBe('ROLE_UNCHANGED');
  });

  it('never demotes the last active admin', async () => {
    mockFindUnique.mockResolvedValue(target({ role: 'admin' }));
    mockCount.mockResolvedValue(0);
    expect(await code(assertRoleChangeAllowed('a1', 't1', 'user'))).toBe('LAST_ADMIN');
    mockCount.mockResolvedValue(1);
    expect(await code(assertRoleChangeAllowed('a1', 't1', 'user'))).toBe('OK');
  });

  it('makes an advisor only after an approved application', async () => {
    mockApplication.mockResolvedValue({ status: 'PENDING' });
    expect(await code(assertRoleChangeAllowed('a1', 't1', 'advisor'))).toBe('ADVISOR_NOT_VERIFIED');
    mockApplication.mockResolvedValue({ status: 'APPROVED' });
    expect(await code(assertRoleChangeAllowed('a1', 't1', 'advisor'))).toBe('OK');
  });

  it('does not demote an advisor with money still open', async () => {
    mockFindUnique.mockResolvedValue(target({ role: 'advisor' }));
    mockBlockers.mockResolvedValue(['300 coins of session earnings are still pending']);
    await expect(assertRoleChangeAllowed('a1', 't1', 'user')).rejects.toThrow(/earnings are still pending/);
    expect(await code(assertRoleChangeAllowed('a1', 't1', 'user'))).toBe('ADVISOR_HAS_OPEN_OBLIGATIONS');
  });
});

describe('assertStatusChangeAllowed', () => {
  it('refuses an unknown status and yourself', async () => {
    expect(await code(assertStatusChangeAllowed('a1', 't1', 'banished'))).toBe('INVALID_STATUS');
    expect(await code(assertStatusChangeAllowed('t1', 't1', 'blocked'))).toBe('SELF_ACTION');
  });

  it('never blocks the last active admin, but may still mark them verified', async () => {
    mockFindUnique.mockResolvedValue(target({ role: 'admin' }));
    mockCount.mockResolvedValue(0);
    expect(await code(assertStatusChangeAllowed('a1', 't1', 'blocked'))).toBe('LAST_ADMIN');
    expect(await code(assertStatusChangeAllowed('a1', 't1', 'verified'))).toBe('OK');
  });
});
