// Unified Auth Helpers - Centralized authentication operations
import supabase from '@/utils/supabase/client';
import { handleLogout } from './auth-sync-integration';
import { db } from './database';
import { permissionService } from '@/services/permissionService';
import { backupPINKeys, restorePINKeys } from './encryption';

/**
 * Unified signout function that handles all logout scenarios consistently.
 * NOTE: This app has no React Router - navigation uses window.location only.
 *
 * PIN PRESERVATION: The user's PIN (hash + salt) is saved before localStorage
 * is cleared and restored immediately after, so they are never asked to
 * re-create their PIN on the next login.
 */
export async function unifiedSignOut(_navigate?: (path: string) => void): Promise<void> {
  try {
    console.log(' Starting unified signout process...');

    // Backup PIN before any clearing
    const pinBackup = backupPINKeys();

    // Step 1: Clear backend tokens and local cache
    await handleLogout();

    // Step 2: Sign out from Supabase (invalidates server-side session globally if active)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) {
          console.warn('Supabase global signOut failed, trying local signOut:', error);
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
      } else {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    } catch (e) {
      console.warn('Supabase global signOut exception, trying local signOut:', e);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }

    // Step 3: Clear permissions
    permissionService.clearPermissions();

    // Step 4: Clear all storage
    localStorage.clear();
    sessionStorage.clear();

    // Step 5: Restore PIN so user is not asked to set it up again
    restorePINKeys(pinBackup);

    // Step 6: Delete local IndexedDB (non-blocking)
    try { window.indexedDB.deleteDatabase('KANKUDB'); } catch { }

    console.log(' Unified signout completed successfully');

    // Step 7: Hard redirect with cache-bust
    window.location.replace(window.location.origin + '?logged_out=1');

  } catch (error) {
    console.error(' Unified signout failed:', error);
    const pinBackup = backupPINKeys();
    try {
      localStorage.clear();
      sessionStorage.clear();
      restorePINKeys(pinBackup);
      window.indexedDB.deleteDatabase('KANKUDB');
    } catch { }
    window.location.replace(window.location.origin + '?logged_out=1');
  }
}

/**
 * Legacy signout function for backward compatibility (Settings.tsx)
 */
export async function legacySignOut(): Promise<void> {
  try {
    console.log(' Starting legacy signout process...');

    const pinBackup = backupPINKeys();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) {
          console.warn('Supabase global signOut failed, trying local signOut:', error);
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
      } else {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    } catch (e) {
      console.warn('Supabase global signOut exception, trying local signOut:', e);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }

    permissionService.clearPermissions();

    localStorage.clear();
    sessionStorage.clear();

    restorePINKeys(pinBackup);

    try {
      window.indexedDB.deleteDatabase('KANKUDB');
    } catch (err) {
      console.warn('Failed to delete IndexedDB:', err);
    }

    window.location.href = window.location.origin;

    console.log(' Legacy signout completed successfully');
  } catch (error) {
    console.error(' Legacy signout failed:', error);
    const pinBackup = backupPINKeys();
    try {
      localStorage.clear();
      restorePINKeys(pinBackup);
    } catch { }
    window.location.href = window.location.origin;
  }
}

