/**
 * The logout clear list must never contain a table the user cannot get back.
 *
 * `clearLocalUserData()` deletes every table in `LOGOUT_CLEARED_TABLES` on sign
 * out. Before 2026-09-24 that list was an inline array in AuthContext and only
 * 14 of its 30+ tables had any pull path — so an ordinary logout permanently
 * destroyed EMI repayments, goal contributions and import history. The list and
 * the sync layer were maintained separately, so every table added to one and
 * not the other defaulted to silent data loss.
 *
 * These tests are the guard rail. They do not prove a sync function is correct;
 * they prove the registry's claims are structurally sound and that no entry can
 * quietly regress to "deleted, never restored".
 */
import { describe, it, expect } from 'vitest';
import {
  LOGOUT_CLEARED_TABLES,
  RECOVERABLE_STRATEGIES,
  isRecoverable,
  type RestoreStrategy,
} from '@/lib/localDataRegistry';
import { db } from '@/lib/database';

const VALID_STRATEGIES: RestoreStrategy[] = [
  'core-sync',
  'feature-sync',
  'on-demand-api',
  'device-local',
  'derived',
];

describe('logout-cleared table registry', () => {
  it('is not empty', () => {
    expect(LOGOUT_CLEARED_TABLES.length).toBeGreaterThan(0);
  });

  it('names each table only once', () => {
    const names = LOGOUT_CLEARED_TABLES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('resolves every entry to a real Dexie table', () => {
    // Catches a renamed or removed store: clearing would throw at logout and
    // the previous account's rows would survive into the next session.
    for (const policy of LOGOUT_CLEARED_TABLES) {
      const table = policy.table();
      expect(table, `${policy.name} did not resolve to a table`).toBeDefined();
      expect(table.name).toBe(policy.name);
    }
  });

  it('declares a known restore strategy for every entry', () => {
    for (const policy of LOGOUT_CLEARED_TABLES) {
      expect(VALID_STRATEGIES, `${policy.name}`).toContain(policy.restore);
    }
  });

  it('documents why, for every entry', () => {
    // The note is what a future reader needs to decide whether the strategy is
    // still true. An empty one makes the registry a list of names again.
    for (const policy of LOGOUT_CLEARED_TABLES) {
      expect(policy.note.trim().length, `${policy.name} has no note`).toBeGreaterThan(10);
    }
  });

  it('spells out the gap whenever a table is not recoverable', () => {
    // 'device-local' and 'derived' are legitimate, but only as a deliberate
    // decision. Requiring the reason in writing is what stops the strategy
    // being used as a shrug for "nothing pulls this yet".
    for (const policy of LOGOUT_CLEARED_TABLES) {
      if (isRecoverable(policy)) continue;
      expect(
        /KNOWN GAP|by design|Superseded|No writer|Re-derived|Rebuilt|local learning/i.test(policy.note),
        `${policy.name} is unrecoverable but its note does not justify it: "${policy.note}"`,
      ).toBe(true);
    }
  });

  it('keeps the money tables recoverable', () => {
    // The regression that started this. Each of these is financial history the
    // server holds; none may ever go back to being local-only.
    const mustSurvive = [
      'accounts',
      'transactions',
      'loans',
      'loanPayments',
      'goals',
      'goalContributions',
      'investments',
      'groupExpenses',
      'budgets',
      'recurringTransactions',
      'documents',
    ];

    for (const name of mustSurvive) {
      const policy = LOGOUT_CLEARED_TABLES.find((p) => p.name === name);
      expect(policy, `${name} is missing from the registry`).toBeDefined();
      expect(
        isRecoverable(policy!),
        `${name} is cleared on logout with strategy "${policy!.restore}" — it would be unrecoverable`,
      ).toBe(true);
    }
  });

  it('treats only server-backed strategies as recoverable', () => {
    expect(RECOVERABLE_STRATEGIES).toEqual(['core-sync', 'feature-sync', 'on-demand-api']);
    expect(isRecoverable({ name: 'x', table: () => db.accounts, restore: 'device-local', note: 'n' }))
      .toBe(false);
  });
});
