# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-quick-actions.spec.ts >> Quick Actions Navigation Test >> Should navigate to correct pages from Quick Action modal
- Location: tests\e2e\test-quick-actions.spec.ts:13:3

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="quick-add-btn"], [aria-label="Quick Actions"], button:has-text("Add"), button:has-text("+"), button[aria-label="Add transaction"]').first()

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e6]:
      - img [ref=e8]
      - navigation [ref=e14]:
        - list
    - generic [ref=e16]:
      - banner [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e20]:
            - img [ref=e21]
            - textbox "Search transactions, assets..." [ref=e24]
            - generic: ⌘K
          - generic "Offline sync disabled (schema incompatible)." [ref=e27]:
            - img [ref=e28]
      - main [ref=e30]:
        - generic [ref=e31]:
          - heading "Settings" [level=1] [ref=e35]
          - generic [ref=e36]:
            - generic [ref=e38]:
              - heading "Preferences" [level=3] [ref=e40]
              - generic [ref=e41]:
                - generic [ref=e43]:
                  - generic [ref=e44]:
                    - img [ref=e46]
                    - heading "Language" [level=4] [ref=e49]
                  - combobox "Select language" [ref=e50]:
                    - option "English" [selected]
                    - option "Español (Spanish)"
                    - option "Français (French)"
                    - option "Deutsch (German)"
                    - option "Italiano (Italian)"
                    - option "Português (Portuguese)"
                    - option "日本語 (Japanese)"
                    - option "中文 (Chinese)"
                    - option "हिंदी (Hindi)"
                    - option "العربية (Arabic)"
                - generic [ref=e52]:
                  - generic [ref=e53]:
                    - img [ref=e55]
                    - heading "Currency" [level=4] [ref=e60]
                  - combobox "Select currency" [ref=e61]:
                    - option "USD ($)"
                    - option "INR (₹)" [selected]
                    - option "EUR (€)"
                    - option "GBP (£)"
                    - option "JPY (¥)"
                    - option "AUD (A$)"
                    - option "CAD (C$)"
                    - option "SGD (S$)"
                    - option "CHF (CHF)"
            - generic [ref=e65]:
              - generic [ref=e66]:
                - heading "SMS Transaction Detection" [level=3] [ref=e67]
                - paragraph [ref=e68]: Auto-detect bank SMS to track expenses
              - button "Turn On" [ref=e69]
            - generic [ref=e71]:
              - heading "Legal" [level=3] [ref=e73]
              - generic [ref=e74]:
                - generic [ref=e76]:
                  - generic [ref=e77]:
                    - img [ref=e79]
                    - heading "Privacy Policy" [level=4] [ref=e82]
                  - button "View" [ref=e83]:
                    - text: View
                    - img [ref=e84]
                - generic [ref=e89]:
                  - generic [ref=e90]:
                    - img [ref=e92]
                    - heading "Terms & Conditions" [level=4] [ref=e95]
                  - button "View" [ref=e96]:
                    - text: View
                    - img [ref=e97]
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | /**
  2  |  * Test: Click Quick Action buttons and verify proper navigation without dashboard redirect loops.
  3  |  */
  4  | import { test, expect } from '@playwright/test';
  5  | import { USERS, loginUser, skipOnboardingIfPresent, screenshot, isElementVisible } from './helpers';
  6  | 
  7  | const user = USERS.U1; // Arjun Sharma
  8  | 
  9  | test.describe('Quick Actions Navigation Test', () => {
  10 |   test.setTimeout(120_000);
  11 |   test.use({ storageState: undefined });
  12 | 
  13 |   test('Should navigate to correct pages from Quick Action modal', async ({ page }) => {
  14 |     // Log console events
  15 |     page.on('console', msg => {
  16 |       console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  17 |     });
  18 | 
  19 |     console.log('Starting login for U1...');
  20 |     const loginResultUrl = await loginUser(page, user);
  21 |     console.log(`Login finished. Current URL: ${page.url()}, loginResultUrl: ${loginResultUrl}`);
  22 |     
  23 |     await skipOnboardingIfPresent(page);
  24 |     console.log(`After skipOnboardingIfPresent. Current URL: ${page.url()}`);
  25 |     await screenshot(page, 'quick_actions_01_dashboard');
  26 | 
  27 |     // Let's print out all buttons on the page for debugging
  28 |     const buttons = await page.locator('button').allTextContents();
  29 |     console.log('Buttons on page:', buttons);
  30 | 
  31 |     // 2. Open the Quick Actions Modal
  32 |     const quickAddButton = page.locator('[data-testid="quick-add-btn"], [aria-label="Quick Actions"], button:has-text("Add"), button:has-text("+"), button[aria-label="Add transaction"]').first();
  33 |     await quickAddButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
> 34 |     await quickAddButton.click();
     |                          ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  35 |     await page.waitForTimeout(1000);
  36 |     await screenshot(page, 'quick_actions_02_modal_open');
  37 | 
  38 |     // Verify modal is open (checks element containing quick actions list)
  39 |     const modalTitle = page.getByText(/Quick Actions/i).first();
  40 |     expect(await isElementVisible(modalTitle, 3000), 'Quick Actions Modal should be open').toBe(true);
  41 | 
  42 |     // 3. Test "Expense" Quick Action (should navigate to add-transaction page)
  43 |     const expenseActionBtn = page.locator('[data-testid="quickaction-add-expense-button"], button:has-text("Expense")').first();
  44 |     await expenseActionBtn.click();
  45 |     await page.waitForTimeout(2000);
  46 |     await screenshot(page, 'quick_actions_03_expense_navigated');
  47 | 
  48 |     // We should be on Add Transaction page (look for title or form fields)
  49 |     const addTransactionTitle = page.getByRole('heading', { name: /add transaction|add expense|new transaction/i }).first();
  50 |     const hasAddTransactionTitle = await isElementVisible(addTransactionTitle, 5000);
  51 |     expect(hasAddTransactionTitle, 'Should navigate to Add Transaction page on Expense click').toBe(true);
  52 | 
  53 |     // Go back to dashboard to test next quick action
  54 |     const backBtn = page.locator('button[aria-label="Back"], button:has-text("Back"), button:has(svg)').first();
  55 |     if (await backBtn.isVisible()) {
  56 |       await backBtn.click();
  57 |       await page.waitForTimeout(1000);
  58 |     } else {
  59 |       await page.goto('http://localhost:9002');
  60 |       await page.waitForTimeout(2000);
  61 |     }
  62 | 
  63 |     // 4. Open Quick Actions Modal again and test "New Goal" (should navigate to add-goal page)
  64 |     await quickAddButton.click();
  65 |     await page.waitForTimeout(1000);
  66 | 
  67 |     const goalActionBtn = page.locator('[data-testid="quickaction-add-goal-button"], button:has-text("New Goal")').first();
  68 |     await goalActionBtn.click();
  69 |     await page.waitForTimeout(2000);
  70 |     await screenshot(page, 'quick_actions_04_goal_navigated');
  71 | 
  72 |     // We should be on Add Goal page
  73 |     const addGoalTitle = page.getByRole('heading', { name: /add goal|new goal|create goal|new saving goal/i }).first();
  74 |     const hasAddGoalTitle = await isElementVisible(addGoalTitle, 5000);
  75 |     expect(hasAddGoalTitle, 'Should navigate to Add Goal page on New Goal click').toBe(true);
  76 |   });
  77 | });
  78 | 
```