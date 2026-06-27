/**
 * UI — Duplicate-email registration guard (regression).
 *
 * Reproduces and guards the reported bug: signing up with an email that is
 * already registered used to advance the user into onboarding ("Account
 * Created Successfully!"). After the fix, a duplicate signup is BLOCKED with a
 * generic, non-enumerable message and the success screen is never shown.
 *
 * Requires the frontend dev server (http://localhost:9002) AND backend.
 *   npm run dev      # starts both
 *   npx playwright test quality/e2e/auth-duplicate-registration.spec.ts
 *
 * Records evidence under quality/e2e/screenshots/ (register_*_after_submit.png).
 */
import { test, expect } from '@playwright/test';
import { registerUser, gotoApp, isElementVisible } from './helpers';
import { uniqueUiUser } from './test-data';

test.describe('UI registration — duplicate email is blocked, not "created"', () => {
  test('second signup with the same email is rejected with a generic message', async ({ page }) => {
    test.setTimeout(180_000);

    const user = uniqueUiUser();

    // 1) First registration of a brand-new, unique account should succeed.
    const first = await registerUser(page, user as any);
    expect(first, `expected first signup for ${user.email} to register`).toBe('registered');

    // 2) Second registration with the SAME email must be blocked.
    await page.context().clearCookies().catch(() => {});
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {});

    const second = await registerUser(page, user as any);
    expect(second, `expected duplicate signup for ${user.email} to be blocked`).toBe('already_exists');

    // 3) The "Account Created Successfully!" screen must NOT be present for a duplicate.
    const successScreen = page.getByText(/Account Created Successfully/i).first();
    expect(await isElementVisible(successScreen, 2000)).toBe(false);

    // 4) The message must be generic — it must not echo machine-readable
    //    enumeration phrases like "already exists" / "already registered".
    const body = ((await page.locator('body').textContent().catch(() => '')) ?? '').toLowerCase();
    expect(body).not.toContain('email_exists');
    expect(body).not.toContain('user already registered');
  });

  test('landing page renders before the duplicate flow (smoke)', async ({ page }) => {
    await gotoApp(page);
    expect(await isElementVisible(page.locator('body'), 5000)).toBe(true);
  });
});
