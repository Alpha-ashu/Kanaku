/**
 * The Feature Panel's catalogue:
 *   - every module the app gates has a switch (Admin Console, Advisor Panel,
 *     Vault and Transfers had none, so they could never be managed);
 *   - switches that cannot really be turned off are saved as on;
 *   - "restore defaults" puts back exactly one role's access.
 */
import { describe, expect, it } from 'vitest';
import {
  FEATURES_BASE,
  FEATURE_DEFAULT_ROLE_ACCESS,
  appliesToRole,
  enforceLocks,
  isRoleLocked,
  restoreRoleDefaults,
  type RoleAccess,
} from '@/app/components/admin/featureCatalog';
import { getVisibleFeaturesForRole } from '@/lib/featureFlags';

const feature = (key: string, roleAccess: Partial<RoleAccess>, enabled = true) => ({
  key,
  enabled,
  roleAccess: { admin: false, manager: false, advisor: false, user: false, ...roleAccess },
  lastUpdated: new Date(0),
});

describe('feature catalogue', () => {
  it('has a switch, with defaults, for every module the app gates', () => {
    const keys = new Set(FEATURES_BASE.map((f) => f.key));
    for (const key of Object.keys(getVisibleFeaturesForRole('admin'))) {
      expect(keys.has(key), key).toBe(true);
      expect(FEATURE_DEFAULT_ROLE_ACCESS[key], key).toBeDefined();
    }
    for (const key of ['adminPanel', 'managerPanel', 'advisorPanel', 'vault', 'transfer']) expect(keys.has(key)).toBe(true);
  });

  it('only offers workspace switches to the roles that use them', () => {
    expect(appliesToRole('adminPanel', 'manager')).toBe(false);
    expect(appliesToRole('managerPanel', 'manager')).toBe(true);
    expect(appliesToRole('managerPanel', 'user')).toBe(false);
    expect(appliesToRole('goals', 'manager')).toBe(true);
  });

  it('saves locked switches as on: admin workspaces and personal-finance basics', () => {
    const [console, dashboard, goals] = enforceLocks([
      feature('adminPanel', { admin: false }, false),
      feature('dashboard', { user: true }),
      feature('goals', { admin: false }),
    ]);
    expect(console.enabled).toBe(true);
    expect(console.roleAccess.admin).toBe(true);
    expect(dashboard.roleAccess).toEqual({ admin: true, manager: true, advisor: true, user: true });
    expect(goals.roleAccess.admin).toBe(false);
    expect(isRoleLocked('managerPanel', 'admin')).toBe(true);
    expect(isRoleLocked('managerPanel', 'manager')).toBe(false);
  });

  it('restores one role to its defaults and leaves the others alone', () => {
    // Production on 2026-10-01: admins had lost most pages, managers the dashboard and more.
    const saved = [
      feature('goals', { admin: false, manager: true, user: true }),
      feature('aiInsights', { admin: false, manager: true, user: false }),
      feature('managerPanel', { admin: true, manager: false }),
    ];
    const admin = restoreRoleDefaults(saved, 'admin');
    expect(admin.map((f) => f.roleAccess.admin)).toEqual([true, true, true]);
    expect(admin[1].roleAccess.user).toBe(false);
    expect(admin[1].roleAccess.manager).toBe(true);

    const manager = restoreRoleDefaults(saved, 'manager');
    expect(manager.find((f) => f.key === 'aiInsights')!.roleAccess.manager).toBe(false);
    expect(manager.find((f) => f.key === 'managerPanel')!.roleAccess.manager).toBe(true);
    expect(manager.find((f) => f.key === 'goals')!.lastUpdated.getTime()).toBe(0);
  });
});
