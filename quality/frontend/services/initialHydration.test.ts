/**
 * First-login hydration must run once per (device, account) — and must run
 * again after a logout.
 *
 * The bug this guards: sign-out empties Dexie, so a hydration marker that
 * survived logout would tell the next login "this device already has the data"
 * about a database holding none of it. Combined with the per-page sync that was
 * previously the only login-time pull, that is how a re-login came back with a
 * partial account.
 *
 * The network layer is mocked — this is about the marker contract and the
 * failure policy, not about what the sync functions fetch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const syncUserDataFromCloud = vi.fn();
const syncBills = vi.fn();
const syncBudgets = vi.fn();
const syncCategories = vi.fn();
const syncGoalContributions = vi.fn();
const syncRecurringTransactions = vi.fn();

vi.mock('@/lib/auth-sync-integration', () => ({
  syncUserDataFromCloud: (...a: unknown[]) => syncUserDataFromCloud(...a),
}));

vi.mock('@/services/featureSyncService', () => ({
  syncBills: () => syncBills(),
  syncBudgets: () => syncBudgets(),
  syncCategories: () => syncCategories(),
  syncGoalContributions: () => syncGoalContributions(),
  syncRecurringTransactions: () => syncRecurringTransactions(),
}));

import {
  needsInitialHydration,
  runInitialHydration,
  clearHydrationMarker,
} from '@/services/initialHydration';

const USER = 'user-abc';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  syncUserDataFromCloud.mockResolvedValue(undefined);
  for (const fn of [syncBills, syncBudgets, syncCategories, syncGoalContributions, syncRecurringTransactions]) {
    fn.mockResolvedValue({ pulled: 0, pushed: 0, removed: 0 });
  }
});

describe('needsInitialHydration', () => {
  it('is true for a device that has never hydrated this account', () => {
    expect(needsInitialHydration(USER)).toBe(true);
  });

  it('is false once hydration has completed', async () => {
    await runInitialHydration(USER);
    expect(needsInitialHydration(USER)).toBe(false);
  });

  it('is tracked per account, not per device', async () => {
    await runInitialHydration(USER);
    // A second account on the same device has its own Dexie contents to fill.
    expect(needsInitialHydration('someone-else')).toBe(true);
  });
});

describe('runInitialHydration', () => {
  it('requests EVERY core table, not the current page only', async () => {
    await runInitialHydration(USER);

    // `undefined` tables means "all of CORE_SYNC_TABLES"; `true` forces the
    // pull past the per-table cooldown. Passing a table list here would
    // reintroduce the page-dependent hydration this exists to replace.
    expect(syncUserDataFromCloud).toHaveBeenCalledWith(USER, undefined, true);
  });

  it('pulls the backend-owned mirrors the sync engine does not cover', async () => {
    await runInitialHydration(USER);

    expect(syncCategories).toHaveBeenCalled();
    expect(syncBudgets).toHaveBeenCalled();
    expect(syncRecurringTransactions).toHaveBeenCalled();
    expect(syncGoalContributions).toHaveBeenCalled();
    expect(syncBills).toHaveBeenCalled();
  });

  it('pulls contributions and bills AFTER the core tables they resolve against', async () => {
    const order: string[] = [];
    syncUserDataFromCloud.mockImplementation(async () => { order.push('core'); });
    syncGoalContributions.mockImplementation(async () => { order.push('contributions'); return {}; });
    syncBills.mockImplementation(async () => { order.push('bills'); return {}; });

    await runInitialHydration(USER);

    // Contributions attach to goals and bills relink to transactions; running
    // them first would find nothing to attach to.
    expect(order.indexOf('core')).toBeLessThan(order.indexOf('contributions'));
    expect(order.indexOf('core')).toBeLessThan(order.indexOf('bills'));
  });
});

describe('failure policy', () => {
  it('does NOT mark the device hydrated when the core pull fails', async () => {
    syncUserDataFromCloud.mockRejectedValue(new Error('offline'));

    const result = await runInitialHydration(USER);

    expect(result.core).toBe(false);
    // Recording a hydration that never happened is the whole failure mode:
    // the next login would trust an empty database.
    expect(needsInitialHydration(USER)).toBe(true);
  });

  it('still counts as hydrated when only a mirror fails', async () => {
    syncBudgets.mockRejectedValue(new Error('500'));

    const result = await runInitialHydration(USER);

    expect(result.core).toBe(true);
    expect(result.failedMirrors).toContain('budgets');
    // The mirrors re-sync on their own pages and once per session, so one
    // failing must not force a full re-hydration on every login.
    expect(needsInitialHydration(USER)).toBe(false);
  });

  it('keeps going after a mirror throws', async () => {
    syncCategories.mockRejectedValue(new Error('boom'));

    await runInitialHydration(USER);

    expect(syncBudgets).toHaveBeenCalled();
    expect(syncBills).toHaveBeenCalled();
  });
});

describe('clearHydrationMarker', () => {
  it('forces re-hydration for one account', async () => {
    await runInitialHydration(USER);
    clearHydrationMarker(USER);
    expect(needsInitialHydration(USER)).toBe(true);
  });

  it('clears every account when called with no argument — the logout case', async () => {
    await runInitialHydration(USER);
    await runInitialHydration('second-user');

    // This is what sign-out calls, right after emptying Dexie.
    clearHydrationMarker();

    expect(needsInitialHydration(USER)).toBe(true);
    expect(needsInitialHydration('second-user')).toBe(true);
  });

  it('leaves unrelated keys alone', async () => {
    localStorage.setItem('auth_role_cache', 'keep-me');
    await runInitialHydration(USER);

    clearHydrationMarker();

    expect(localStorage.getItem('auth_role_cache')).toBe('keep-me');
  });
});
