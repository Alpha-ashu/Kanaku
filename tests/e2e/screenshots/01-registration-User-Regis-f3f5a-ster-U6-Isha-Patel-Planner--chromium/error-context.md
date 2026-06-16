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
  - generic [ref=e4]:
    - generic [ref=e6]:
      - heading "Complete Your Profile" [level=2] [ref=e7]
      - generic [ref=e8]: Step 1 of 4
    - generic [ref=e15]:
      - generic [ref=e16]:
        - heading "Profile Information" [level=3] [ref=e17]
        - paragraph [ref=e18]: Let's set up your profile with basic information about you.
      - generic [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e21]:
            - img "Selected avatar" [ref=e24]
            - paragraph [ref=e25]: Choose a ready-made avatar. You can change this anytime.
          - generic [ref=e26]:
            - generic [ref=e27]:
              - heading "Choose Your Avatar" [level=4] [ref=e28]
              - button "Save Avatar" [ref=e29]:
                - img [ref=e30]
                - text: Save Avatar
            - generic [ref=e32]:
              - button "Select avatar Xavier" [ref=e33]:
                - img "Xavier" [ref=e34]
              - button "Select avatar Seraphina" [ref=e35]:
                - img "Seraphina" [ref=e36]
              - button "Select avatar Kael" [ref=e37]:
                - img "Kael" [ref=e38]
              - button "Select avatar Imani" [ref=e39]:
                - img "Imani" [ref=e40]
              - button "Select avatar Soren" [ref=e41]:
                - img "Soren" [ref=e42]
              - button "Select avatar Lyra" [ref=e43]:
                - img "Lyra" [ref=e44]
              - button "Select avatar Atticus" [ref=e45]:
                - img "Atticus" [ref=e46]
              - button "Select avatar Freya" [ref=e47]:
                - img "Freya" [ref=e48]
              - button "Select avatar Zion" [ref=e49]:
                - img "Zion" [ref=e50]
              - button "Select avatar Amara" [ref=e51]:
                - img "Amara" [ref=e52]
              - button "Select avatar Atlas" [ref=e53]:
                - img "Atlas" [ref=e54]
              - button "Select avatar Nova" [ref=e55]:
                - img "Nova" [ref=e56]
              - button "Select avatar Orion" [ref=e57]:
                - img "Orion" [ref=e58]
              - button "Select avatar Veda" [ref=e59]:
                - img "Veda" [ref=e60]
              - button "Select avatar Cyrus" [ref=e61]:
                - img "Cyrus" [ref=e62]
              - button "Select avatar Elara" [ref=e63]:
                - img "Elara" [ref=e64]
              - button "Select avatar Indigo" [ref=e65]:
                - img "Indigo" [ref=e66]
              - button "Select avatar Sage" [ref=e67]:
                - img "Sage" [ref=e68]
              - button "Select avatar River" [ref=e69]:
                - img "River" [ref=e70]
              - button "Select avatar Willow" [ref=e71]:
                - img "Willow" [ref=e72]
              - button "Select avatar Bowie" [ref=e73]:
                - img "Bowie" [ref=e74]
              - button "Select avatar Cleo" [ref=e75]:
                - img "Cleo" [ref=e76]
              - button "Select avatar Dante" [ref=e77]:
                - img "Dante" [ref=e78]
              - button "Select avatar Ember" [ref=e79]:
                - img "Ember" [ref=e80]
              - button "Select avatar Z-44" [ref=e81]:
                - img "Z-44" [ref=e82]
              - button "Select avatar R-90" [ref=e83]:
                - img "R-90" [ref=e84]
              - button "Select avatar T-10" [ref=e85]:
                - img "T-10" [ref=e86]
              - button "Select avatar M-22" [ref=e87]:
                - img "M-22" [ref=e88]
              - button "Select avatar 1" [ref=e89]:
                - img "1" [ref=e90]
              - button "Select avatar 1 (1)" [ref=e91]:
                - img "1 (1)" [ref=e92]
              - button "Select avatar 3" [ref=e93]:
                - img "3" [ref=e94]
              - button "Select avatar 4" [ref=e95]:
                - img "4" [ref=e96]
              - button "Select avatar 5" [ref=e97]:
                - img "5" [ref=e98]
              - button "Select avatar 6" [ref=e99]:
                - img "6" [ref=e100]
              - button "Select avatar 6 (1)" [ref=e101]:
                - img "6 (1)" [ref=e102]
              - button "Select avatar 6 (2)" [ref=e103]:
                - img "6 (2)" [ref=e104]
              - button "Select avatar 6 (3)" [ref=e105]:
                - img "6 (3)" [ref=e106]
              - button "Select avatar 6 (4)" [ref=e107]:
                - img "6 (4)" [ref=e108]
              - button "Select avatar 6 (5)" [ref=e109]:
                - img "6 (5)" [ref=e110]
              - button "Select avatar 6 (6)" [ref=e111]:
                - img "6 (6)" [ref=e112]
              - button "Select avatar 6 (7)" [ref=e113]:
                - img "6 (7)" [ref=e114]
              - button "Select avatar 6 (8)" [ref=e115]:
                - img "6 (8)" [ref=e116]
              - button "Select avatar 6 (9)" [ref=e117]:
                - img "6 (9)" [ref=e118]
              - button "Select avatar 6 (10)" [ref=e119]:
                - img "6 (10)" [ref=e120]
              - button "Select avatar 6 (11)" [ref=e121]:
                - img "6 (11)" [ref=e122]
              - button "Select avatar 6 (12)" [ref=e123]:
                - img "6 (12)" [ref=e124]
              - button "Select avatar 6 (13)" [ref=e125]:
                - img "6 (13)" [ref=e126]
              - button "Select avatar 6 (14)" [ref=e127]:
                - img "6 (14)" [ref=e128]
              - button "Select avatar 6 (15)" [ref=e129]:
                - img "6 (15)" [ref=e130]
              - button "Select avatar 6 (16)" [ref=e131]:
                - img "6 (16)" [ref=e132]
              - button "Select avatar 6 (17)" [ref=e133]:
                - img "6 (17)" [ref=e134]
              - button "Select avatar 6 (18)" [ref=e135]:
                - img "6 (18)" [ref=e136]
              - button "Select avatar 6 (19)" [ref=e137]:
                - img "6 (19)" [ref=e138]
              - button "Select avatar 6 (20)" [ref=e139]:
                - img "6 (20)" [ref=e140]
              - button "Select avatar 6 (21)" [ref=e141]:
                - img "6 (21)" [ref=e142]
        - generic [ref=e143]:
          - generic [ref=e144]:
            - generic [ref=e145]: Signed in as
            - text: Isha Patel
          - generic [ref=e146]:
            - generic [ref=e147]: Gender
            - combobox "Gender" [ref=e148]:
              - option "Select gender" [selected]
              - option "Male"
              - option "Female"
              - option "Non-binary"
              - option "Prefer not to say"
          - generic [ref=e149]:
            - generic [ref=e150]: Date of Birth
            - generic [ref=e151]:
              - generic [ref=e152] [cursor=pointer]:
                - generic [ref=e153]: Select Date
                - img [ref=e154]
              - textbox "Date of Birth" [ref=e156] [cursor=pointer]
          - generic [ref=e157]:
            - generic [ref=e158]: Job Type
            - combobox "Job Type" [ref=e159]:
              - option "Select job type" [selected]
              - option "Full-time Employment"
              - option "Part-time Employment"
              - option "Self-employed"
              - option "Freelance"
              - option "Business Owner"
              - option "Student"
              - option "Retired"
              - option "Unemployed"
              - option "Other"
          - generic [ref=e160]:
            - generic [ref=e161]: Annual Salary (INR)
            - spinbutton "Annual Salary (INR)" [ref=e162]
          - button "Continue to Bank Account Setup" [ref=e164]
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
  9  |   test.setTimeout(180_000);
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
  39 |   test.setTimeout(180_000);
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