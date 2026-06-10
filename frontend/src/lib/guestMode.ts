/**
 * guestMode.ts
 * 
 * Guest Mode: allows the app to be used without an account.
 * All data is stored locally in Dexie only.
 * When the user later signs up / logs in, ALL local data is migrated to their
 * real account and queued for backend sync - nothing is lost.
 */

//  Constants 
export const GUEST_USER_ID = '__KANAKU_guest__';
const LEGACY_GUEST_USER_ID = '__KANAKU_guest__';
const GUEST_MODE_KEY = 'KANAKU_guest_mode';
const GUEST_CREATED_KEY = 'KANAKU_guest_created_at';

//  State helpers 
export const isGuestMode = (): boolean =>
  localStorage.getItem(GUEST_MODE_KEY) === 'true';

export const enableGuestMode = (): void => {
  localStorage.setItem(GUEST_MODE_KEY, 'true');
  if (!localStorage.getItem(GUEST_CREATED_KEY)) {
    localStorage.setItem(GUEST_CREATED_KEY, new Date().toISOString());
  }
  // Treat guest as "onboarded" so the app opens directly
  localStorage.setItem('onboarding_completed', 'true');
  localStorage.setItem('guest_session_active', 'true');
};

export const disableGuestMode = (): void => {
  localStorage.removeItem(GUEST_MODE_KEY);
  localStorage.removeItem(GUEST_CREATED_KEY);
  localStorage.removeItem('guest_session_active');
};

export const getGuestCreatedAt = (): string | null =>
  localStorage.getItem(GUEST_CREATED_KEY);

//  Data migration 
/**
 * Called immediately after a guest user successfully signs in / signs up.
 *
 * Migrates every Dexie record that:
 *  - has no userId, OR
 *  - has userId === GUEST_USER_ID
 *
 * to the real Supabase user ID and marks them as `syncStatus: 'pending'`
 * so the existing offline-sync-engine will push them to the backend.
 *
 * Returns a summary { accounts, transactions, goals, loans, investments }
 * with the number of records migrated for each table.
 */
export async function migrateGuestDataToUser(realUserId: string): Promise<{
  accounts: number;
  transactions: number;
  goals: number;
  loans: number;
  investments: number;
  friends: number;
  groupExpenses: number;
}> {
  const { db } = await import('@/lib/database');
  const summary = {
    accounts: 0,
    transactions: 0,
    goals: 0,
    loans: 0,
    investments: 0,
    friends: 0,
    groupExpenses: 0,
  };

  try {
    //  accounts 
    const accounts = await db.accounts.filter(
      (r: any) => !r.userId || r.userId === GUEST_USER_ID || r.userId === LEGACY_GUEST_USER_ID
    ).toArray();
    for (const rec of accounts) {
      await db.accounts.update(rec.id!, {
        userId: realUserId,
        syncStatus: 'pending' as const,
        updatedAt: new Date(),
      } as any);
    }
    summary.accounts = accounts.length;

    //  transactions 
    const txns = await db.transactions.filter(
      (r: any) => !r.userId || r.userId === GUEST_USER_ID || r.userId === LEGACY_GUEST_USER_ID
    ).toArray();
    for (const rec of txns) {
      await db.transactions.update(rec.id!, {
        userId: realUserId,
        syncStatus: 'pending' as const,
        updatedAt: new Date(),
      } as any);
    }
    summary.transactions = txns.length;

    //  goals 
    const goals = await db.goals.filter(
      (r: any) => !r.userId || r.userId === GUEST_USER_ID || r.userId === LEGACY_GUEST_USER_ID
    ).toArray();
    for (const rec of goals) {
      await db.goals.update(rec.id!, {
        userId: realUserId,
        syncStatus: 'pending' as const,
        updatedAt: new Date(),
      } as any);
    }
    summary.goals = goals.length;

    //  loans 
    const loans = await db.loans.filter(
      (r: any) => !r.userId || r.userId === GUEST_USER_ID || r.userId === LEGACY_GUEST_USER_ID
    ).toArray();
    for (const rec of loans) {
      await db.loans.update(rec.id!, {
        userId: realUserId,
        syncStatus: 'pending' as const,
        updatedAt: new Date(),
      } as any);
    }
    summary.loans = loans.length;

    //  investments 
    const investments = await db.investments.filter(
      (r: any) => !r.userId || r.userId === GUEST_USER_ID || r.userId === LEGACY_GUEST_USER_ID
    ).toArray();
    for (const rec of investments) {
      await db.investments.update(rec.id!, {
        userId: realUserId,
        syncStatus: 'pending' as const,
        updatedAt: new Date(),
      } as any);
    }
    summary.investments = investments.length;

    //  friends 
    const friends = await db.friends.filter(
      (r: any) => !r.userId || r.userId === GUEST_USER_ID || r.userId === LEGACY_GUEST_USER_ID
    ).toArray();
    for (const rec of friends) {
      await db.friends.update(rec.id!, {
        userId: realUserId,
        syncStatus: 'pending' as const,
        updatedAt: new Date(),
      } as any);
    }
    summary.friends = friends.length;

    //  groupExpenses 
    const groups = await db.groupExpenses.filter(
      (r: any) => !r.userId || r.userId === GUEST_USER_ID || r.userId === LEGACY_GUEST_USER_ID
    ).toArray();
    for (const rec of groups) {
      await db.groupExpenses.update(rec.id!, {
        userId: realUserId,
        syncStatus: 'pending' as const,
        updatedAt: new Date(),
      } as any);
    }
    summary.groupExpenses = groups.length;

  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[KANAKU/GuestMigration] Migration error:', err);
    }
  }

  return summary;
}

/**
 * Migrates localStorage profile data written during guest mode.
 * This ensures the user's locally set currency/language/profile are preserved
 * and marked for backend sync.
 */
export function migrateGuestLocalStorage(): void {
  // Preserve onboarding_completed - guest has already "onboarded" locally
  const profile = localStorage.getItem('user_profile');
  const settings = localStorage.getItem('user_settings');
  if (profile) localStorage.setItem('profile_sync_pending', 'true');
  if (settings) localStorage.setItem('settings_sync_pending', 'true');
}

