# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 05-u4-goals.spec.ts >> U4 – Goal Setter (Sneha) >> U4-01: Navigate to Goals
- Location: tests\e2e\05-u4-goals.spec.ts:13:3

# Error details

```
Error: Goals page should load

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic:
      - textbox: sneha.test@finora.app
      - textbox [active]
    - generic [ref=e4]:
      - generic [ref=e5]:
        - img [ref=e7]
        - heading "KANAKU" [level=1] [ref=e13]
        - paragraph [ref=e14]: Choose a 6-digit PIN to secure your account
      - generic [ref=e15]:
        - generic [ref=e16]:
          - paragraph [ref=e17]: Step 1 of 2
          - heading "Create your PIN" [level=2] [ref=e18]
        - button "SHOW PIN" [ref=e28]:
          - img [ref=e29]
          - text: SHOW PIN
        - generic [ref=e32]:
          - button "1" [ref=e33]
          - button "2" [ref=e34]
          - button "3" [ref=e35]
          - button "4" [ref=e36]
          - button "5" [ref=e37]
          - button "6" [ref=e38]
          - button "7" [ref=e39]
          - button "8" [ref=e40]
          - button "9" [ref=e41]
          - button "0" [ref=e43]
          - button "⌫" [ref=e44]
        - generic [ref=e45]:
          - img [ref=e46]
          - generic [ref=e49]:
            - paragraph [ref=e50]: Secure Encryption
            - paragraph [ref=e51]: Your financial data stays encrypted on this device. Only PIN verification metadata is stored securely.
  - region "Notifications alt+T"
```

# Test source

```ts
  1   | /**
  2   |  * Sprint 1 – Test 05: U4 Sneha Kapoor – Goal Setter
  3   |  * Tests: Create 3 goals → Add contributions → Verify progress → Goal completion
  4   |  */
  5   | import { test, expect } from '@playwright/test';
  6   | import { USERS, loginUser, skipOnboardingIfPresent, screenshot, clickNav } from './helpers';
  7   | 
  8   | const U4 = USERS.U4;
  9   | 
  10  | test.describe('U4 – Goal Setter (Sneha)', () => {
  11  |   test.setTimeout(120_000);
  12  | 
  13  |   test('U4-01: Navigate to Goals', async ({ page }) => {
  14  |     await loginUser(page, U4);
  15  |     await skipOnboardingIfPresent(page);
  16  |     await clickNav(page, 'goal');
  17  |     // Goals page h1 is "Goals & Savings" — use exact text to avoid AnimatePresence DOM overlap
  18  |     const hasGoalsContent = await page.getByText('Goals & Savings', { exact: false }).first()
  19  |       .waitFor({ state: 'visible', timeout: 15000 })
  20  |       .then(() => true)
  21  |       .catch(() => false);
  22  |     await screenshot(page, '05_u4_01_goals_page');
> 23  |     expect(hasGoalsContent, 'Goals page should load').toBe(true);
      |                                                       ^ Error: Goals page should load
  24  |   });
  25  | 
  26  |   test('U4-02: Create Emergency Fund goal', async ({ page }) => {
  27  |     await loginUser(page, U4);
  28  |     await skipOnboardingIfPresent(page);
  29  |     await clickNav(page, 'goal');
  30  |     await page.waitForTimeout(800);
  31  | 
  32  |     const addBtn = page.getByRole('button', { name: /add goal|new goal|\+ goal|create goal/i }).first();
  33  |     const visible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
  34  | 
  35  |     if (visible) {
  36  |       await addBtn.click();
  37  |       await page.waitForTimeout(600);
  38  |       await screenshot(page, '05_u4_02_add_goal_modal');
  39  | 
  40  |       // Name / title
  41  |       const nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="goal" i], input[placeholder*="name" i]').first();
  42  |       if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Emergency Fund');
  43  | 
  44  |       // Target amount
  45  |       const targetInput = page.locator('input[name="targetAmount"], input[name="target"], input[name="amount"], input[placeholder*="target" i], input[placeholder*="amount" i]').first();
  46  |       if (await targetInput.isVisible({ timeout: 3000 }).catch(() => false)) await targetInput.fill('300000');
  47  | 
  48  |       // Deadline / target date
  49  |       const dateInput = page.locator('input[name="deadline"], input[name="targetDate"], input[name="dueDate"], input[type="date"]').first();
  50  |       if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) await dateInput.fill('2026-12-31');
  51  | 
  52  |       await screenshot(page, '05_u4_02_goal_filled');
  53  | 
  54  |       const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /save|create|add|confirm/i }).last();
  55  |       if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  56  |         await saveBtn.click();
  57  |         await page.waitForTimeout(2500);
  58  |         await screenshot(page, '05_u4_02_goal_saved');
  59  | 
  60  |         const body = await page.textContent('body');
  61  |         const goalSaved = body?.includes('Emergency') || body?.includes('3,00,000') || body?.includes('300000') || body?.includes('300,000');
  62  |         if (!goalSaved) console.warn('  ⚠️  Emergency Fund goal not found — form validation may have blocked submission');
  63  |         else console.log('  ✅ Emergency Fund goal saved');
  64  |       } else {
  65  |         await screenshot(page, '05_u4_02_save_btn_disabled');
  66  |         console.warn('  ⚠️  Save button disabled — goal form may require additional required fields');
  67  |       }
  68  |     } else {
  69  |       await screenshot(page, '05_u4_02_no_add_btn');
  70  |       console.warn('  ⚠️  Add Goal button not found');
  71  |     }
  72  |   });
  73  | 
  74  |   test('U4-03: Create Europe Vacation goal', async ({ page }) => {
  75  |     await loginUser(page, U4);
  76  |     await skipOnboardingIfPresent(page);
  77  |     await clickNav(page, 'goal');
  78  |     await page.waitForTimeout(800);
  79  | 
  80  |     const addBtn = page.getByRole('button', { name: /add goal|new goal|\+ goal|create goal/i }).first();
  81  |     if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  82  |       await addBtn.click();
  83  |       await page.waitForTimeout(600);
  84  | 
  85  |       const nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="name" i]').first();
  86  |       if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Europe Vacation 2027');
  87  | 
  88  |       const targetInput = page.locator('input[name="targetAmount"], input[name="target"], input[name="amount"]').first();
  89  |       if (await targetInput.isVisible({ timeout: 2000 }).catch(() => false)) await targetInput.fill('250000');
  90  | 
  91  |       const dateInput = page.locator('input[type="date"]').first();
  92  |       if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) await dateInput.fill('2027-03-31');
  93  | 
  94  |       const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /save|create|add|confirm/i }).last();
  95  |       if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) await saveBtn.click();
  96  |       else console.warn('  ⚠️  Europe Vacation save button disabled');
  97  |       await page.waitForTimeout(2500);
  98  |       await screenshot(page, '05_u4_03_vacation_goal_saved');
  99  | 
  100 |       const body = await page.textContent('body');
  101 |       const saved = body?.includes('Europe') || body?.includes('Vacation');
  102 |       console.log(`  Europe Vacation goal saved: ${saved}`);
  103 |     }
  104 |   });
  105 | 
  106 |   test('U4-04: Add contribution to Emergency Fund', async ({ page }) => {
  107 |     await loginUser(page, U4);
  108 |     await skipOnboardingIfPresent(page);
  109 |     await clickNav(page, 'goal');
  110 |     await page.waitForTimeout(800);
  111 | 
  112 |     // Click into Emergency Fund goal
  113 |     const efGoal = page.getByText(/Emergency Fund/i).first();
  114 |     if (await efGoal.isVisible({ timeout: 5000 }).catch(() => false)) {
  115 |       await efGoal.click();
  116 |       await page.waitForTimeout(800);
  117 |       await screenshot(page, '05_u4_04_goal_detail');
  118 | 
  119 |       // Add contribution
  120 |       const addContribBtn = page.getByRole('button', { name: /add contribution|contribute|add savings|deposit/i }).first();
  121 |       if (await addContribBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
  122 |         await addContribBtn.click();
  123 |         await page.waitForTimeout(500);
```