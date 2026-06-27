/**
 * P1 Bug Fix Verification: Page refresh must preserve authentication, profile completion, and PIN states.
 * 
 * Scenarios tested:
 *  1. Login → PIN → Dashboard → Refresh → should stay on Dashboard (NOT PIN screen, NOT Create Profile)
 *  2. Login → PIN → Navigate to Accounts → Refresh → should stay on Accounts
 *  3. Login → Enter PIN screen → Refresh → should stay on Enter PIN screen (correct behavior)
 */
import { test, expect } from '@playwright/test';
import { USERS, loginUser, skipOnboardingIfPresent, screenshot, isElementVisible } from './helpers';

const user = USERS.U1; // Arjun Sharma

test.describe('P1 Bug: Page Refresh State Persistence', () => {
  test.setTimeout(120_000);

  test('Scenario 1: Dashboard refresh should stay on Dashboard', async ({ page }) => {
    // Login and get to dashboard
    await loginUser(page, user);
    await skipOnboardingIfPresent(page);
    await screenshot(page, 'refresh_s1_01_dashboard_before');

    // Verify we are on dashboard (nav elements visible)
    const navEl = page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first();
    const onDashboard = await isElementVisible(navEl, 10000);
    expect(onDashboard, 'Should be on dashboard after login').toBe(true);

    // Now REFRESH the page
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000); // Wait for auth state and PIN state to restore

    await screenshot(page, 'refresh_s1_02_after_reload');

    // Check for onboarding / Create Profile screen
    const onboardingTitle = page.getByText(/Complete Your Profile/i).first();
    const onboardingStep = page.getByText(/Step 1 of 4/i).first();
    const isOnboarding = await isElementVisible(onboardingTitle, 3000) ||
                          await isElementVisible(onboardingStep, 1000);
    
    // Check for PIN Auth screen
    const bodyText = await page.textContent('body').catch(() => '');
    const hasPinScreen = bodyText?.includes('Enter your PIN') || 
                         bodyText?.includes('Create your PIN') || 
                         bodyText?.includes('Secure Unlock') || false;

    // Check if we are still on Dashboard
    const onDashboardAfterRefresh = await isElementVisible(navEl, 3000);

    console.log(`After refresh: onboarding=${isOnboarding}, pinScreen=${hasPinScreen}, dashboard=${onDashboardAfterRefresh}`);

    expect(isOnboarding, 'Should NOT show Create Profile after dashboard refresh').toBe(false);
    expect(hasPinScreen, 'Should NOT show PIN screen after dashboard refresh').toBe(false);
    expect(onDashboardAfterRefresh, 'Should stay on Dashboard after refresh').toBe(true);
  });

  test('Scenario 2: Navigate to Accounts → Refresh → should stay on Accounts', async ({ page }) => {
    // Login and get to dashboard
    await loginUser(page, user);
    await skipOnboardingIfPresent(page);

    // Navigate to Accounts
    const accountsLink = page.locator('[data-nav-id="accounts"], [aria-label="Accounts"], a:has-text("Accounts")').first();
    await accountsLink.click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'refresh_s2_01_accounts_before');

    // Verify we are on Accounts page (check path/content)
    expect(page.url(), 'Should have accounts in URL or be on accounts screen').toContain('accounts');

    // Now REFRESH the page
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    await screenshot(page, 'refresh_s2_02_after_reload');

    // Verify we are still on Accounts page
    expect(page.url(), 'Should still be on Accounts page after refresh').toContain('accounts');
    
    // Make sure we did not fall back to PIN or onboarding
    const bodyText = await page.textContent('body').catch(() => '');
    const hasPinScreen = bodyText?.includes('Enter your PIN') || bodyText?.includes('Secure Unlock');
    const hasOnboarding = bodyText?.includes('Complete Your Profile');

    expect(hasPinScreen, 'Should NOT show PIN screen after Accounts refresh').toBeFalsy();
    expect(hasOnboarding, 'Should NOT show Create Profile after Accounts refresh').toBeFalsy();
  });

  test('Scenario 3: Login + PIN screen refresh should stay on PIN screen (NOT Create Profile)', async ({ page }) => {
    // Login via API tokens but DON'T skip onboarding/PIN - we want to land on PIN screen
    const BASE = 'http://localhost:9002';
    const API = 'http://localhost:3000';
    
    // Get tokens
    const resp = await page.request.post(`${API}/api/v1/auth/login`, {
      data: { email: user.email, password: user.password },
    });
    const json = await resp.json();
    const { accessToken, refreshToken, user: userObj } = json.data ?? {};
    
    if (!accessToken) {
      throw new Error(`Login API failed for ${user.email}: ${JSON.stringify(json)}`);
    }

    // Set tokens in localStorage but do NOT set onboarding_completed or pin_verified
    // This simulates a fresh login where user still needs PIN verification
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(({ at, rt, email, userObj }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('auth_token', at);
      localStorage.setItem('refresh_token', rt);
      localStorage.setItem('user_email', email);
      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('user_data', JSON.stringify(userObj));
      // Deliberately NOT setting pin_verified - user needs to enter PIN
    }, { at: accessToken, rt: refreshToken, email: user.email, userObj });
    
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    
    await screenshot(page, 'refresh_s3_01_after_login_reload');

    // Now refresh again to test state persistence
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    await screenshot(page, 'refresh_s3_02_after_second_reload');

    // Check we're on PIN screen, not Create Profile
    const bodyText = await page.textContent('body').catch(() => '');
    const hasCompleteProfile = bodyText?.includes('Complete Your Profile') || false;
    const hasPinScreen = bodyText?.includes('Enter your PIN') || bodyText?.includes('Create your PIN') || bodyText?.includes('Secure Unlock') || false;
    
    console.log(`After PIN screen refresh: completeProfile=${hasCompleteProfile}, pinScreen=${hasPinScreen}`);

    expect(hasCompleteProfile, 'Should NOT show Create Profile after refresh on PIN screen').toBe(false);
    expect(hasPinScreen, 'Should stay on PIN screen after reload if not yet verified').toBe(true);
  });
});
