# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-refresh-redirect.spec.ts >> P1 Bug: Page Refresh State Persistence >> Scenario 3: Login + PIN screen refresh should stay on PIN screen (NOT Create Profile)
- Location: tests\e2e\test-refresh-redirect.spec.ts:88:3

# Error details

```
Error: Login API failed for arjun.test@finora.app: {"success":false,"error":"Incorrect email or password. Please check your credentials and try again.","code":"INVALID_CREDENTIALS"}
```

# Test source

```ts
  1   | /**
  2   |  * P1 Bug Fix Verification: Page refresh must preserve authentication, profile completion, and PIN states.
  3   |  * 
  4   |  * Scenarios tested:
  5   |  *  1. Login → PIN → Dashboard → Refresh → should stay on Dashboard (NOT PIN screen, NOT Create Profile)
  6   |  *  2. Login → PIN → Navigate to Accounts → Refresh → should stay on Accounts
  7   |  *  3. Login → Enter PIN screen → Refresh → should stay on Enter PIN screen (correct behavior)
  8   |  */
  9   | import { test, expect } from '@playwright/test';
  10  | import { USERS, loginUser, skipOnboardingIfPresent, screenshot, isElementVisible } from './helpers';
  11  | 
  12  | const user = USERS.U1; // Arjun Sharma
  13  | 
  14  | test.describe('P1 Bug: Page Refresh State Persistence', () => {
  15  |   test.setTimeout(120_000);
  16  | 
  17  |   test('Scenario 1: Dashboard refresh should stay on Dashboard', async ({ page }) => {
  18  |     // Login and get to dashboard
  19  |     await loginUser(page, user);
  20  |     await skipOnboardingIfPresent(page);
  21  |     await screenshot(page, 'refresh_s1_01_dashboard_before');
  22  | 
  23  |     // Verify we are on dashboard (nav elements visible)
  24  |     const navEl = page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first();
  25  |     const onDashboard = await isElementVisible(navEl, 10000);
  26  |     expect(onDashboard, 'Should be on dashboard after login').toBe(true);
  27  | 
  28  |     // Now REFRESH the page
  29  |     await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  30  |     await page.waitForTimeout(5000); // Wait for auth state and PIN state to restore
  31  | 
  32  |     await screenshot(page, 'refresh_s1_02_after_reload');
  33  | 
  34  |     // Check for onboarding / Create Profile screen
  35  |     const onboardingTitle = page.getByText(/Complete Your Profile/i).first();
  36  |     const onboardingStep = page.getByText(/Step 1 of 4/i).first();
  37  |     const isOnboarding = await isElementVisible(onboardingTitle, 3000) ||
  38  |                           await isElementVisible(onboardingStep, 1000);
  39  |     
  40  |     // Check for PIN Auth screen
  41  |     const bodyText = await page.textContent('body').catch(() => '');
  42  |     const hasPinScreen = bodyText?.includes('Enter your PIN') || 
  43  |                          bodyText?.includes('Create your PIN') || 
  44  |                          bodyText?.includes('Secure Unlock') || false;
  45  | 
  46  |     // Check if we are still on Dashboard
  47  |     const onDashboardAfterRefresh = await isElementVisible(navEl, 3000);
  48  | 
  49  |     console.log(`After refresh: onboarding=${isOnboarding}, pinScreen=${hasPinScreen}, dashboard=${onDashboardAfterRefresh}`);
  50  | 
  51  |     expect(isOnboarding, 'Should NOT show Create Profile after dashboard refresh').toBe(false);
  52  |     expect(hasPinScreen, 'Should NOT show PIN screen after dashboard refresh').toBe(false);
  53  |     expect(onDashboardAfterRefresh, 'Should stay on Dashboard after refresh').toBe(true);
  54  |   });
  55  | 
  56  |   test('Scenario 2: Navigate to Accounts → Refresh → should stay on Accounts', async ({ page }) => {
  57  |     // Login and get to dashboard
  58  |     await loginUser(page, user);
  59  |     await skipOnboardingIfPresent(page);
  60  | 
  61  |     // Navigate to Accounts
  62  |     const accountsLink = page.locator('[data-nav-id="accounts"], [aria-label="Accounts"], a:has-text("Accounts")').first();
  63  |     await accountsLink.click();
  64  |     await page.waitForTimeout(2000);
  65  |     await screenshot(page, 'refresh_s2_01_accounts_before');
  66  | 
  67  |     // Verify we are on Accounts page (check path/content)
  68  |     expect(page.url(), 'Should have accounts in URL or be on accounts screen').toContain('accounts');
  69  | 
  70  |     // Now REFRESH the page
  71  |     await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  72  |     await page.waitForTimeout(5000);
  73  | 
  74  |     await screenshot(page, 'refresh_s2_02_after_reload');
  75  | 
  76  |     // Verify we are still on Accounts page
  77  |     expect(page.url(), 'Should still be on Accounts page after refresh').toContain('accounts');
  78  |     
  79  |     // Make sure we did not fall back to PIN or onboarding
  80  |     const bodyText = await page.textContent('body').catch(() => '');
  81  |     const hasPinScreen = bodyText?.includes('Enter your PIN') || bodyText?.includes('Secure Unlock');
  82  |     const hasOnboarding = bodyText?.includes('Complete Your Profile');
  83  | 
  84  |     expect(hasPinScreen, 'Should NOT show PIN screen after Accounts refresh').toBeFalsy();
  85  |     expect(hasOnboarding, 'Should NOT show Create Profile after Accounts refresh').toBeFalsy();
  86  |   });
  87  | 
  88  |   test('Scenario 3: Login + PIN screen refresh should stay on PIN screen (NOT Create Profile)', async ({ page }) => {
  89  |     // Login via API tokens but DON'T skip onboarding/PIN - we want to land on PIN screen
  90  |     const BASE = 'http://localhost:9002';
  91  |     const API = 'http://localhost:3000';
  92  |     
  93  |     // Get tokens
  94  |     const resp = await page.request.post(`${API}/api/v1/auth/login`, {
  95  |       data: { email: user.email, password: user.password },
  96  |     });
  97  |     const json = await resp.json();
  98  |     const { accessToken, refreshToken, user: userObj } = json.data ?? {};
  99  |     
  100 |     if (!accessToken) {
> 101 |       throw new Error(`Login API failed for ${user.email}: ${JSON.stringify(json)}`);
      |             ^ Error: Login API failed for arjun.test@finora.app: {"success":false,"error":"Incorrect email or password. Please check your credentials and try again.","code":"INVALID_CREDENTIALS"}
  102 |     }
  103 | 
  104 |     // Set tokens in localStorage but do NOT set onboarding_completed or pin_verified
  105 |     // This simulates a fresh login where user still needs PIN verification
  106 |     await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  107 |     await page.evaluate(({ at, rt, email, userObj }) => {
  108 |       localStorage.clear();
  109 |       sessionStorage.clear();
  110 |       localStorage.setItem('auth_token', at);
  111 |       localStorage.setItem('refresh_token', rt);
  112 |       localStorage.setItem('user_email', email);
  113 |       localStorage.setItem('onboarding_completed', 'true');
  114 |       localStorage.setItem('user_data', JSON.stringify(userObj));
  115 |       // Deliberately NOT setting pin_verified - user needs to enter PIN
  116 |     }, { at: accessToken, rt: refreshToken, email: user.email, userObj });
  117 |     
  118 |     await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  119 |     await page.waitForTimeout(4000);
  120 |     
  121 |     await screenshot(page, 'refresh_s3_01_after_login_reload');
  122 | 
  123 |     // Now refresh again to test state persistence
  124 |     await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  125 |     await page.waitForTimeout(5000);
  126 |     
  127 |     await screenshot(page, 'refresh_s3_02_after_second_reload');
  128 | 
  129 |     // Check we're on PIN screen, not Create Profile
  130 |     const bodyText = await page.textContent('body').catch(() => '');
  131 |     const hasCompleteProfile = bodyText?.includes('Complete Your Profile') || false;
  132 |     const hasPinScreen = bodyText?.includes('Enter your PIN') || bodyText?.includes('Create your PIN') || bodyText?.includes('Secure Unlock') || false;
  133 |     
  134 |     console.log(`After PIN screen refresh: completeProfile=${hasCompleteProfile}, pinScreen=${hasPinScreen}`);
  135 | 
  136 |     expect(hasCompleteProfile, 'Should NOT show Create Profile after refresh on PIN screen').toBe(false);
  137 |     expect(hasPinScreen, 'Should stay on PIN screen after reload if not yet verified').toBe(true);
  138 |   });
  139 | });
  140 | 
```