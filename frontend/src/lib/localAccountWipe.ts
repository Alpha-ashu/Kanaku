/**
 * What this device forgets after a data reset or an account deletion.
 *
 * Sign-out clears only what the server can give back (localDataRegistry.ts) and
 * deliberately keeps device preferences, local backups and the upload queues.
 * A reset or a deletion is different — the user asked for the data to be GONE —
 * so these clear every table except the two read-only investment catalogues, and
 * drop the pending upload queue FIRST: a create queued before the reset and
 * pushed after it would put deleted data straight back on the server.
 *
 * Callers wrap the server call in `runWithCloudSyncSuppressed` too, so no queued
 * write can reach the server while the reset is running.
 */
import { db } from '@/lib/database';
import { runWithCloudSyncSuppressed } from '@/lib/auth-sync-integration';
import { backupPINKeys, clearSecurityData, restorePINKeys } from '@/lib/encryption';
import { pinService } from '@/services/pinService';
import { disableBiometricUnlock } from '@/services/biometricAuthService';
import { TAB_ID } from '@/lib/tabIdentity';

/** Pending uploads live in localStorage (auth-sync-integration SYNC_QUEUE_STORAGE_KEY). */
const SYNC_QUEUE_KEYS = ['KANAKU_sync_queue_v3'];

/** Read-only reference catalogues seeded on this device — not user data. */
const REFERENCE_TABLES = new Set(['investmentCategories', 'investmentSubcategories']);

/**
 * What survives a reset: the session and device identity (the user stays signed
 * in) and the profile, which the reset keeps on the server too. Dropping the
 * profile flags made App.tsx send the user back through onboarding — it decides
 * from `onboarding_completed` before the profile is refetched.
 */
const RESET_KEPT_KEYS = [
  'auth_token', 'refresh_token', 'accessToken', 'refreshToken', 'token', 'authToken', 'auth_token_v1',
  'user', 'device_id',
  'onboarding_completed', 'onboarding_slides_viewed', 'user_profile', 'profile_updated_at',
  'user_first_name', 'user_name', 'user_email', 'pin_setup_required',
];

/** Drop queued uploads so nothing written before a wipe is pushed after it. */
export function discardPendingUploads(): void {
  for (const key of SYNC_QUEUE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable — nothing queued there either */
    }
  }
}

/** Clear every user-data table. Returns the tables that could not be cleared. */
export async function clearAllLocalTables(): Promise<string[]> {
  const failed: string[] = [];
  await runWithCloudSyncSuppressed(async () => {
    await Promise.all(
      db.tables
        .filter((table) => !REFERENCE_TABLES.has(table.name))
        .map(async (table) => {
          try {
            await table.clear();
          } catch (error) {
            // One table must not abandon the rest — a partial clear is how rows survive.
            console.error(`[wipe] could not clear local table "${table.name}"`, error);
            failed.push(table.name);
          }
        }),
    );
  });
  return failed;
}

const tellOtherTabs = (type: 'clear-all-data' | 'account-deleted') => {
  try {
    const channel = new BroadcastChannel('kanaku-system');
    channel.postMessage({ type, tabId: TAB_ID });
    channel.close();
  } catch {
    /* BroadcastChannel unsupported (old WebView) — other tabs reload on next sync */
  }
};

/**
 * After POST /settings/clear-data succeeded: this device now holds the reset
 * state too. The user stays signed in; their PIN keeps working.
 */
export async function resetLocalUserData(): Promise<void> {
  discardPendingUploads();
  await clearAllLocalTables();

  const pinKeys = backupPINKeys();
  const kept = new Map<string, string>();
  for (const key of RESET_KEPT_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) kept.set(key, value);
  }
  localStorage.clear();
  kept.forEach((value, key) => localStorage.setItem(key, value));
  restorePINKeys(pinKeys);
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  tellOtherTabs('clear-all-data');
}

/**
 * After the account was deleted on the server: nothing of it may remain on the
 * device — data, queued uploads, PIN, biometric unlock, cached profile. Only the
 * anonymous device id is kept. Call BEFORE signing out, so the sign-out flush
 * finds no queued writes to push for an account that no longer exists.
 */
export async function wipeDeletedAccountFromDevice(): Promise<void> {
  discardPendingUploads();
  await clearAllLocalTables();

  try {
    pinService.clearPinData();
    clearSecurityData();
  } catch {
    /* already absent */
  }
  await disableBiometricUnlock().catch(() => undefined);

  const deviceId = localStorage.getItem('device_id');
  localStorage.clear();
  if (deviceId) localStorage.setItem('device_id', deviceId);
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  tellOtherTabs('account-deleted');
}
