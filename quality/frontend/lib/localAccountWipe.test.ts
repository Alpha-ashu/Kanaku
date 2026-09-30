// @vitest-environment jsdom
/**
 * What the device forgets after a data reset and after an account deletion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cleared = vi.hoisted(() => [] as string[]);
const mocks = vi.hoisted(() => ({
  clearPinData: vi.fn(),
  clearSecurityData: vi.fn(),
  disableBiometricUnlock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/database', () => {
  const table = (name: string) => ({ name, clear: async () => { cleared.push(name); } });
  return {
    db: {
      tables: ['accounts', 'transactions', 'syncQueue', 'backups', 'settings', 'pendingFileUploads', 'investmentCategories', 'investmentSubcategories'].map(table),
    },
  };
});
vi.mock('@/lib/auth-sync-integration', () => ({ runWithCloudSyncSuppressed: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/encryption', () => ({
  backupPINKeys: () => ({ hash: localStorage.getItem('pin_hash'), salt: null, verifier: null, adminSettings: null }),
  restorePINKeys: (b: { hash: string | null }) => { if (b.hash) localStorage.setItem('pin_hash', b.hash); },
  clearSecurityData: mocks.clearSecurityData,
}));
vi.mock('@/services/pinService', () => ({ pinService: { clearPinData: mocks.clearPinData } }));
vi.mock('@/services/biometricAuthService', () => ({ disableBiometricUnlock: mocks.disableBiometricUnlock }));

import { discardPendingUploads, resetLocalUserData, wipeDeletedAccountFromDevice } from '@/lib/localAccountWipe';

const seed = () => {
  localStorage.setItem('auth_token', 'access');
  localStorage.setItem('refresh_token', 'refresh');
  localStorage.setItem('device_id', 'device-1');
  localStorage.setItem('pin_hash', 'hash');
  localStorage.setItem('KANAKU_sync_queue_v3', '[{"table":"transactions"}]');
  localStorage.setItem('user_profile', '{"name":"A"}');
  localStorage.setItem('KANAKU_last_sync_at_transactions', '123');
  sessionStorage.setItem('draft', 'x');
};

beforeEach(() => {
  cleared.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  seed();
});

afterEach(() => vi.clearAllMocks());

describe('local wipe', () => {
  it('drops queued uploads so nothing from before a wipe is pushed after it', () => {
    discardPendingUploads();
    expect(localStorage.getItem('KANAKU_sync_queue_v3')).toBeNull();
  });

  it('reset: clears every user table (queues and backups too) but keeps the session and PIN', async () => {
    await resetLocalUserData();
    expect(cleared.sort()).toEqual(['accounts', 'backups', 'pendingFileUploads', 'settings', 'syncQueue', 'transactions']);
    expect(localStorage.getItem('auth_token')).toBe('access');
    expect(localStorage.getItem('refresh_token')).toBe('refresh');
    expect(localStorage.getItem('device_id')).toBe('device-1');
    expect(localStorage.getItem('pin_hash')).toBe('hash');
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('KANAKU_last_sync_at_transactions')).toBeNull();
    expect(localStorage.getItem('KANAKU_sync_queue_v3')).toBeNull();
    expect(sessionStorage.getItem('draft')).toBeNull();
    expect(mocks.clearPinData).not.toHaveBeenCalled();
  });

  it('deletion: leaves nothing of the account — not even the session, PIN or biometric unlock', async () => {
    await wipeDeletedAccountFromDevice();
    expect(cleared).toContain('transactions');
    expect(cleared).not.toContain('investmentCategories');
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('pin_hash')).toBeNull();
    expect(localStorage.getItem('device_id')).toBe('device-1');
    expect(mocks.clearPinData).toHaveBeenCalled();
    expect(mocks.clearSecurityData).toHaveBeenCalled();
    expect(mocks.disableBiometricUnlock).toHaveBeenCalled();
  });
});
