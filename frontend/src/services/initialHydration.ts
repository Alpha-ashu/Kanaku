/**
 * First-login hydration for a device.
 *
 * The app is offline-first, so every screen reads Dexie. That is only safe if
 * Dexie has been filled from the server at least once for this account on this
 * device. Until 2026-09-24 nothing guaranteed that: the sole login-time sync
 * pulled `PAGE_REQUIRED_TABLES[currentPage]` — seven of the ten synced tables
 * on the dashboard, none of the backend-owned mirrors — so what a second device
 * showed depended on which page the user happened to open, and a table was only
 * ever fetched if some page listed it.
 *
 * This module makes the contract explicit:
 *
 *   authenticate → hydrate every user-owned table → realtime → app is usable
 *
 * It runs once per (device, account). Signing out clears both Dexie and the
 * marker, so the next login re-hydrates rather than trusting an empty database.
 *
 * Failure policy: hydration is best-effort per source and the marker is only
 * set when the core pull actually succeeded. A device that was offline for its
 * first login retries on the next one instead of recording a hydration that
 * never happened.
 */
import { syncUserDataFromCloud } from '@/lib/auth-sync-integration';
import { pushPendingLoanRepayments } from '@/services/loanRepaymentService';
import {
  syncBills,
  syncBudgets,
  syncCategories,
  syncGoalContributions,
  syncRecurringTransactions,
} from '@/services/featureSyncService';

const MARKER_PREFIX = 'KANAKU_device_hydrated_';

const markerKey = (userId: string) => `${MARKER_PREFIX}${userId}`;

/** True when this device has never completed a full pull for this account. */
export const needsInitialHydration = (userId: string): boolean => {
  if (!userId) return false;
  try {
    return localStorage.getItem(markerKey(userId)) === null;
  } catch {
    // Private mode / blocked storage: treat as "not hydrated". Hydrating twice
    // is idempotent and cheap; skipping it is the failure that loses data.
    return true;
  }
};

/** Drop the marker for one account, or for every account when none is given. */
export const clearHydrationMarker = (userId?: string): void => {
  try {
    if (userId) {
      localStorage.removeItem(markerKey(userId));
      return;
    }
    Object.keys(localStorage)
      .filter((k) => k.startsWith(MARKER_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable — nothing to clear */
  }
};

const markHydrated = (userId: string): void => {
  try {
    localStorage.setItem(markerKey(userId), String(Date.now()));
  } catch {
    /* storage unavailable — we will simply hydrate again next login */
  }
};

export interface HydrationResult {
  /** Whether the core table pull completed. The marker is set only if true. */
  core: boolean;
  /** Mirrors that failed; hydration still counts as done (they retry per page). */
  failedMirrors: string[];
}

/**
 * Pull every user-owned table this device can restore from the server.
 *
 * Two groups, run in that order because the second resolves against the first:
 *
 *  1. The Dexie sync engine's tables. Passing no table list means "all of
 *     CORE_SYNC_TABLES"; `force` skips the per-table cooldown, which is what a
 *     first login wants.
 *  2. The backend-owned mirrors, which the sync engine does not cover:
 *     categories (transactions resolve labels against them), budgets, recurring
 *     rules, and bill/document metadata. `syncBills()` also relinks attachments
 *     to their transactions, so it must run after the core pull or there are no
 *     transactions to link to.
 */
export const runInitialHydration = async (userId: string): Promise<HydrationResult> => {
  const failedMirrors: string[] = [];
  let core = false;

  try {
    await syncUserDataFromCloud(userId, undefined, true);
    core = true;
  } catch (err) {
    console.warn('[Hydration] Core table pull failed — will retry on next login', err);
  }

  const mirrors: Array<[string, () => Promise<unknown>]> = [
    // Push before pulling: a repayment recorded offline has no server row yet,
    // and pulling first would simply not find it.
    ['pending-repayments', pushPendingLoanRepayments],
    ['categories', syncCategories],
    ['budgets', syncBudgets],
    ['recurring', syncRecurringTransactions],
    // After the core pull: contributions resolve against the goals it created,
    // and bills relink to the transactions it created.
    ['goal-contributions', syncGoalContributions],
    ['bills', syncBills],
  ];

  for (const [name, run] of mirrors) {
    try {
      await run();
    } catch (err) {
      failedMirrors.push(name);
      console.warn(`[Hydration] ${name} sync failed`, err);
    }
  }

  if (core) markHydrated(userId);

  return { core, failedMirrors };
};
