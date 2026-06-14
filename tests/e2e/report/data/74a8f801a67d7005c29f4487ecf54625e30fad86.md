# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-registration.spec.ts >> User Registration – All 7 Personas >> Register U6: Isha Patel (Planner)
- Location: tests\e2e\01-registration.spec.ts:12:5

# Error details

```
Error: Page should not show a hard error after registration

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner:
      - generic [ref=e4]:
        - generic [ref=e5] [cursor=pointer]:
          - img [ref=e7]
          - generic [ref=e13]: KANAKU
        - navigation [ref=e14]:
          - button "Home" [ref=e15]
          - button "About" [ref=e16]
          - button "Features" [ref=e17]
          - button "Pricing" [ref=e18]
          - button "Privacy" [ref=e19]
          - button "Terms" [ref=e20]
          - button "Support" [ref=e21]
        - generic [ref=e22]:
          - button "Log In" [ref=e23]
          - button "Get Started" [ref=e24]
    - generic [ref=e25]:
      - generic [ref=e26]:
        - img [ref=e30]
        - heading "KANAKU" [level=1] [ref=e36]
        - paragraph [ref=e37]: Experience the future of personal finance. Track, grow, and master your wealth seamlessly.
      - generic [ref=e38]:
        - generic [ref=e39]:
          - img [ref=e40]
          - generic [ref=e43]: Insights
        - generic [ref=e44]:
          - img [ref=e45]
          - generic [ref=e47]: Secure
        - generic [ref=e48]:
          - img [ref=e49]
          - generic [ref=e51]: Smart
    - generic [ref=e53]:
      - button "Create Account" [ref=e54]:
        - text: Create Account
        - img [ref=e55]
      - button "Sign In" [ref=e57]
      - button "Continue as Guest" [ref=e58]
      - button "Back to Landing Page" [ref=e59]
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | /**
  2  |  * Sprint 1 – Test 01: User Registration
  3  |  * Registers all 7 test personas through the actual UI.
  4  |  */
  5  | import { test, expect } from '@playwright/test';
  6  | import { USERS, gotoApp, screenshot, registerUser, loginUser, skipOnboardingIfPresent } from './helpers';
  7  | 
  8  | test.describe('User Registration – All 7 Personas', () => {
  9  |   test.setTimeout(90_000);
  10 | 
  11 |   for (const [key, user] of Object.entries(USERS)) {
  12 |     test(`Register ${key}: ${user.firstName} ${user.lastName} (${user.persona})`, async ({ page }) => {
  13 |       const result = await registerUser(page, user);
  14 |       await screenshot(page, `01_register_${key}_result`);
  15 | 
  16 |       if (result === 'already_exists') {
  17 |         console.log(`  ℹ️  ${user.email} already registered — skipping`);
  18 |         test.info().annotations.push({ type: 'note', description: 'User already existed — treated as pass' });
  19 |         return;
  20 |       }
  21 | 
  22 |       // After registration, expect either onboarding or dashboard (not auth page stuck)
  23 |       const content = await page.content();
  24 |       const hasError = content.includes('error') && !content.includes('Error Boundary');
> 25 |       expect(hasError, 'Page should not show a hard error after registration').toBe(false);
     |                                                                                ^ Error: Page should not show a hard error after registration
  26 | 
  27 |       // Should see some welcome/onboarding/dashboard element
  28 |       await skipOnboardingIfPresent(page);
  29 |       await screenshot(page, `01_register_${key}_onboarding`);
  30 | 
  31 |       // Verify we're past the auth wall
  32 |       const isStillOnAuth = await page.locator('input[name="firstName"]').isVisible().catch(() => false);
  33 |       expect(isStillOnAuth, `${user.email}: Should not still be on registration form`).toBe(false);
  34 |     });
  35 |   }
  36 | });
  37 | 
  38 | test.describe('Login – Verify All Accounts Work', () => {
  39 |   test.setTimeout(60_000);
  40 | 
  41 |   for (const [key, user] of Object.entries(USERS)) {
  42 |     test(`Login ${key}: ${user.email}`, async ({ page }) => {
  43 |       await loginUser(page, user);
  44 |       await skipOnboardingIfPresent(page);
  45 |       await screenshot(page, `01_login_${key}_dashboard`);
  46 | 
  47 |       // Should not be on the auth form anymore
  48 |       const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  49 |       const isOnAuthForm = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);
  50 | 
  51 |       // Check for any error
  52 |       const errorVisible = await page.getByText(/invalid credentials|sign in failed|error/i).first()
  53 |         .isVisible({ timeout: 1000 }).catch(() => false);
  54 | 
  55 |       if (errorVisible) {
  56 |         await screenshot(page, `01_login_${key}_ERROR`);
  57 |         expect(errorVisible, `Login failed for ${user.email}`).toBe(false);
  58 |       }
  59 | 
  60 |       // Should see some dashboard content
  61 |       const dashboardEl = page.locator('h1, h2, [class*="dashboard"], nav, [class*="balance"]').first();
  62 |       const hasDashboardContent = await dashboardEl.isVisible({ timeout: 5000 }).catch(() => false);
  63 |       expect(hasDashboardContent || !isOnAuthForm, `Should reach dashboard after login for ${user.email}`).toBe(true);
  64 |     });
  65 |   }
  66 | });
  67 | 
```