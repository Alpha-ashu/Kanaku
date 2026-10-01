/**
 * Opt-in modules (the coin wallet) are dark until an admin switches them on,
 * and then visible to exactly the roles the admin ticked — the same decision the
 * API's requireFeature makes. Before this, the role default (false) capped what
 * the admin could grant, so the Feature Panel toggle could never show the
 * wallet to an advisor or a user.
 */
import { describe, expect, it } from 'vitest';
import { ADMIN_OPT_IN_FEATURES, getVisibleFeaturesForRole, isOptInFeatureEnabled } from '@/lib/featureFlags';

describe('admin opt-in features', () => {
  it('ships the wallet dark for every role but admin', () => {
    expect(ADMIN_OPT_IN_FEATURES).toContain('wallet');
    for (const role of ['manager', 'advisor', 'user'] as const) {
      expect(getVisibleFeaturesForRole(role).wallet).toBe(false);
      expect(isOptInFeatureEnabled(role, undefined)).toBe(false);
    }
    expect(isOptInFeatureEnabled('admin', undefined)).toBe(true);
  });

  it('follows the admin: module on, role ticked', () => {
    const saved = { enabled: true, roleAccess: { admin: true, manager: false, advisor: true, user: true } };
    expect(isOptInFeatureEnabled('advisor', saved)).toBe(true);
    expect(isOptInFeatureEnabled('user', saved)).toBe(true);
    expect(isOptInFeatureEnabled('manager', saved)).toBe(false);
  });

  it('stays off when the module is off, deprecated or unreleased, and beta excludes users', () => {
    const roleAccess = { admin: true, manager: true, advisor: true, user: true };
    expect(isOptInFeatureEnabled('advisor', { enabled: false, roleAccess })).toBe(false);
    expect(isOptInFeatureEnabled('advisor', { enabled: true, readiness: 'deprecated', roleAccess })).toBe(false);
    expect(isOptInFeatureEnabled('advisor', { enabled: true, readiness: 'unreleased', roleAccess })).toBe(false);
    expect(isOptInFeatureEnabled('advisor', { enabled: true, readiness: 'beta', roleAccess })).toBe(true);
    expect(isOptInFeatureEnabled('user', { enabled: true, readiness: 'beta', roleAccess })).toBe(false);
  });
});
