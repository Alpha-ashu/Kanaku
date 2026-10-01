/**
 * Every page App.tsx renders is gated like the module it shows.
 *
 * `canAccessPage` allows any page that has no entry in PAGE_TO_FEATURE_MAPPING,
 * so an alias that was never mapped (/finance, /sync-monitor, /advisor,
 * /admin-advisor-verification…) opened a staff screen for every role.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PAGE_TO_FEATURE_MAPPING, canAccessPage, getVisibleFeaturesForRole } from '@/lib/featureFlags';

// Open to everyone by design (App.tsx `isPublicPage`, the marketing site and onboarding).
const PUBLIC_PAGES = new Set([
  'privacy', 'privacy-policy', 'terms', 'data-deletion', 'account-deletion', 'delete-account',
  'diagnostics', 'auth-callback', 'onboarding', 'profile-setup', 'about', 'pricing', 'contact',
]);

const renderedPages = () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/App.tsx'), 'utf8');
  return [...new Set([...source.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]))];
};

describe('page access', () => {
  it('maps every page App.tsx renders to the module it shows', () => {
    const unmapped = renderedPages().filter((page) => !PUBLIC_PAGES.has(page) && !PAGE_TO_FEATURE_MAPPING[page]);
    expect(unmapped).toEqual([]);
  });

  it('keeps staff aliases from plain users', () => {
    const user = getVisibleFeaturesForRole('user');
    for (const page of ['finance', 'admin-finance', 'sync-monitor', 'admin-advisor-verification', 'advisor', 'advisor-panel']) {
      expect(canAccessPage(page, user), page).toBe(false);
    }
  });

  it('still opens each alias for the role it belongs to', () => {
    expect(canAccessPage('finance', getVisibleFeaturesForRole('manager'))).toBe(true);
    expect(canAccessPage('advisor', getVisibleFeaturesForRole('advisor'))).toBe(true);
    const user = getVisibleFeaturesForRole('user');
    for (const page of ['bills', 'bill', 'receipts', 'ai-assistant']) expect(canAccessPage(page, user), page).toBe(true);
    expect(canAccessPage('bills', { ...user, transactions: false })).toBe(false);
  });
});
