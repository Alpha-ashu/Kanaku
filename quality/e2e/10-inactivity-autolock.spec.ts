/**
 * Test 10: Inactivity auto-lock
 *
 * Verifies that after a period of no user activity the app locks itself and
 * shows the PIN screen with the "locked due to inactivity" notice — the
 * client-side half of the auto-lock feature (SecurityContext + PINAuth).
 *
 * To keep the test fast we shrink the lock timeout to a fraction of a minute
 * via the persisted `KANAKU_lock_timeout_minutes` key, then reload. The auth
 * session lives in sessionStorage, which survives a reload, so the app stays
 * unlocked after the reload and SecurityContext re-reads the tiny timeout.
 */
import { test, expect } from '@playwright/test';
import { USERS, loginUser, skipOnboardingIfPresent, screenshot } from './helpers';

const U1 = USERS.U1;

// Fraction of a minute → milliseconds. 0.1 min = 6s of inactivity before lock.
const LOCK_TIMEOUT_MINUTES = 0.1;

test.describe('Inactivity auto-lock', () => {
  test.setTimeout(180_000);
  test.use({ storageState: undefined });

  test('locks the app and shows the inactivity notice after inactivity', async ({ page }) => {
    // 1. Reach the authenticated dashboard (sets sessionStorage session_active).
    await loginUser(page, U1);
    await skipOnboardingIfPresent(page);

    const dashboard = page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first();
    expect(await dashboard.isVisible().catch(() => false), 'should start on the dashboard').toBe(true);

    // 2. Shrink the auto-lock timeout and reload. sessionStorage (the unlocked
    //    session) survives the reload; SecurityContext re-mounts and picks up
    //    the tiny timeout, arming a ~6s inactivity timer.
    await page.evaluate((mins) => {
      localStorage.setItem('KANAKU_lock_timeout_minutes', String(mins));
    }, LOCK_TIMEOUT_MINUTES);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });

    // 3. Stay completely idle. Playwright's visibility polling does not dispatch
    //    DOM activity events, so the inactivity timer is free to fire. We poll
    //    for the locked state directly rather than asserting an intermediate
    //    unlocked frame, which would race the short window.
    const banner = page.getByTestId('pinauth-inactivity-banner');
    await expect(banner).toBeVisible({ timeout: 30000 });
    await expect(banner).toContainText(/inactivity/i);

    await expect(page.getByText(/enter your pin|secure unlock/i).first()).toBeVisible({ timeout: 5000 });

    await screenshot(page, '10_inactivity_autolock_locked');
  });
});
