/**
 * Sprint 1 – Test 01: User Registration
 * Registers all 7 test personas through the actual UI.
 */
import { test, expect } from '@playwright/test';
import { USERS, gotoApp, screenshot, registerUser, loginUser, skipOnboardingIfPresent } from './helpers';

test.describe('User Registration – All 7 Personas', () => {
  test.setTimeout(90_000);

  for (const [key, user] of Object.entries(USERS)) {
    test(`Register ${key}: ${user.firstName} ${user.lastName} (${user.persona})`, async ({ page }) => {
      const result = await registerUser(page, user);
      await screenshot(page, `01_register_${key}_result`);

      if (result === 'already_exists') {
        console.log(`  ℹ️  ${user.email} already registered — skipping`);
        test.info().annotations.push({ type: 'note', description: 'User already existed — treated as pass' });
        return;
      }

      // After registration, expect either onboarding or dashboard (not auth page stuck)
      const content = await page.content();
      const hasError = content.includes('error') && !content.includes('Error Boundary');
      expect(hasError, 'Page should not show a hard error after registration').toBe(false);

      // Should see some welcome/onboarding/dashboard element
      await skipOnboardingIfPresent(page);
      await screenshot(page, `01_register_${key}_onboarding`);

      // Verify we're past the auth wall
      const isStillOnAuth = await page.locator('input[name="firstName"]').isVisible().catch(() => false);
      expect(isStillOnAuth, `${user.email}: Should not still be on registration form`).toBe(false);
    });
  }
});

test.describe('Login – Verify All Accounts Work', () => {
  test.setTimeout(60_000);

  for (const [key, user] of Object.entries(USERS)) {
    test(`Login ${key}: ${user.email}`, async ({ page }) => {
      await loginUser(page, user);
      await skipOnboardingIfPresent(page);
      await screenshot(page, `01_login_${key}_dashboard`);

      // Should not be on the auth form anymore
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      const isOnAuthForm = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);

      // Check for any error
      const errorVisible = await page.getByText(/invalid credentials|sign in failed|error/i).first()
        .isVisible({ timeout: 1000 }).catch(() => false);

      if (errorVisible) {
        await screenshot(page, `01_login_${key}_ERROR`);
        expect(errorVisible, `Login failed for ${user.email}`).toBe(false);
      }

      // Should see some dashboard content
      const dashboardEl = page.locator('h1, h2, [class*="dashboard"], nav, [class*="balance"]').first();
      const hasDashboardContent = await dashboardEl.isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasDashboardContent || !isOnAuthForm, `Should reach dashboard after login for ${user.email}`).toBe(true);
    });
  }
});
