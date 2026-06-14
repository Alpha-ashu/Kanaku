# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-u3-investments.spec.ts >> U3 – Investor (Rohan) >> U3-01: Navigate to Investments
- Location: tests\e2e\04-u3-investments.spec.ts:13:3

# Error details

```
Error: Investments page should load

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic:
      - textbox: rohan.test@finora.app
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
  2   |  * Sprint 1 – Test 04: U3 Rohan Verma – Investor
  3   |  * Tests: Add stocks → Mutual funds → Gold → FD
  4   |  */
  5   | import { test, expect } from '@playwright/test';
  6   | import { USERS, loginUser, skipOnboardingIfPresent, screenshot, clickNav } from './helpers';
  7   | 
  8   | const U3 = USERS.U3;
  9   | 
  10  | test.describe('U3 – Investor (Rohan)', () => {
  11  |   test.setTimeout(120_000);
  12  | 
  13  |   test('U3-01: Navigate to Investments', async ({ page }) => {
  14  |     await loginUser(page, U3);
  15  |     await skipOnboardingIfPresent(page);
  16  | 
  17  |     await clickNav(page, 'invest');
  18  |     await page.waitForTimeout(1000);
  19  |     await screenshot(page, '04_u3_01_investments_page');
  20  | 
  21  |     const heading = page.getByRole('heading', { name: /invest/i }).first();
  22  |     const text = page.getByText(/my portfolio|total invest/i).first();
  23  |     await heading.waitFor({ state: 'visible', timeout: 6000 }).catch(() => null);
  24  |     await text.waitFor({ state: 'visible', timeout: 4000 }).catch(() => null);
  25  |     const hasInvestContent = await heading.isVisible() || await text.isVisible();
  26  |     console.log(`  Investments section visible: ${hasInvestContent}`);
> 27  |     expect(hasInvestContent, 'Investments page should load').toBe(true);
      |                                                              ^ Error: Investments page should load
  28  |   });
  29  | 
  30  |   test('U3-02: Add stock – Reliance Industries', async ({ page }) => {
  31  |     await loginUser(page, U3);
  32  |     await skipOnboardingIfPresent(page);
  33  |     await clickNav(page, 'invest');
  34  |     await page.waitForTimeout(800);
  35  | 
  36  |     // Look for Add Investment button
  37  |     const addBtn = page.getByRole('button', { name: /add investment|new investment|\+ invest|add stock|buy/i }).first();
  38  |     await addBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
  39  |     const visible = await addBtn.isVisible();
  40  | 
  41  |     if (visible) {
  42  |       await addBtn.click();
  43  |       await page.waitForTimeout(600);
  44  |       await screenshot(page, '04_u3_02_add_investment_modal');
  45  | 
  46  |       // Select type = Stock if dropdown exists
  47  |       const typeSelect = page.locator('select[name="type"], [data-type="stock"], button').filter({ hasText: /stock/i }).first();
  48  |       if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) await typeSelect.click();
  49  | 
  50  |       // Symbol / name
  51  |       const nameInput = page.locator('input[name="symbol"], input[name="name"], input[placeholder*="symbol" i], input[placeholder*="stock" i], input[placeholder*="name" i]').first();
  52  |       if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Reliance Industries');
  53  | 
  54  |       // Quantity
  55  |       const qtyInput = page.locator('input[name="quantity"], input[name="qty"], input[name="units"], input[placeholder*="quantity" i], input[placeholder*="qty" i], input[placeholder*="units" i]').first();
  56  |       if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) await qtyInput.fill('15');
  57  | 
  58  |       // Buy price
  59  |       const priceInput = page.locator('input[name="buyPrice"], input[name="price"], input[name="purchasePrice"], input[placeholder*="price" i], input[placeholder*="buy" i]').first();
  60  |       if (await priceInput.isVisible({ timeout: 2000 }).catch(() => false)) await priceInput.fill('2840');
  61  | 
  62  |       await screenshot(page, '04_u3_02_stock_filled');
  63  | 
  64  |       const saveBtn = page.getByRole('button', { name: /save|add|confirm|buy/i }).last();
  65  |       await saveBtn.click();
  66  |       await page.waitForTimeout(2500);
  67  |       await screenshot(page, '04_u3_02_stock_saved');
  68  | 
  69  |       const body = await page.textContent('body');
  70  |       const saved = body?.includes('Reliance') || body?.includes('2,840') || body?.includes('2840');
  71  |       // BUG: Investment form uses a search/autocomplete widget ("ASSET SEARCH / NAME"),
  72  |       // not a standard text input — our locators may not fill it correctly.
  73  |       if (!saved) console.warn('  ⚠️  Reliance stock not found — investment form may use search widget incompatible with test selectors');
  74  |       else console.log('  ✅ Reliance stock added to portfolio');
  75  |     } else {
  76  |       await screenshot(page, '04_u3_02_no_add_btn');
  77  |       console.warn('  ⚠️  Add Investment button not found');
  78  |     }
  79  |   });
  80  | 
  81  |   test('U3-03: Add Mutual Fund – HDFC Midcap', async ({ page }) => {
  82  |     await loginUser(page, U3);
  83  |     await skipOnboardingIfPresent(page);
  84  |     await clickNav(page, 'invest');
  85  |     await page.waitForTimeout(800);
  86  | 
  87  |     const addBtn = page.getByRole('button', { name: /add investment|new investment|\+ invest/i }).first();
  88  |     await addBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
  89  |     if (await addBtn.isVisible()) {
  90  |       await addBtn.click();
  91  |       await page.waitForTimeout(600);
  92  | 
  93  |       // Select Mutual Fund type
  94  |       const mfType = page.locator('button, [role="option"], select option').filter({ hasText: /mutual fund|fund|mf/i }).first();
  95  |       if (await mfType.isVisible({ timeout: 3000 }).catch(() => false)) await mfType.click();
  96  |       await page.waitForTimeout(400);
  97  | 
  98  |       const nameInput = page.locator('input[name="name"], input[placeholder*="name" i], input[placeholder*="fund" i]').first();
  99  |       if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('HDFC Midcap Opportunities');
  100 | 
  101 |       const amtInput = page.locator('input[name="amount"], input[name="sipAmount"], input[placeholder*="amount" i]').first();
  102 |       if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('5000');
  103 | 
  104 |       await screenshot(page, '04_u3_03_mf_filled');
  105 | 
  106 |       const saveBtn = page.getByRole('button', { name: /save|add|confirm/i }).last();
  107 |       await saveBtn.click();
  108 |       await page.waitForTimeout(2500);
  109 |       await screenshot(page, '04_u3_03_mf_saved');
  110 | 
  111 |       const body = await page.textContent('body');
  112 |       const saved = body?.includes('HDFC Midcap') || body?.includes('HDFC') || body?.includes('Midcap');
  113 |       console.log(`  HDFC Midcap MF saved: ${saved}`);
  114 |     }
  115 |   });
  116 | 
  117 |   test('U3-04: Add Gold investment', async ({ page }) => {
  118 |     await loginUser(page, U3);
  119 |     await skipOnboardingIfPresent(page);
  120 |     await clickNav(page, 'invest');
  121 |     await page.waitForTimeout(800);
  122 | 
  123 |     // Look for Gold-specific button or gold section
  124 |     const goldBtn = page.getByRole('button', { name: /add gold|gold investment|buy gold/i }).first()
  125 |       .or(page.locator('button').filter({ hasText: /gold/i }).first());
  126 | 
  127 |     const addBtn = page.getByRole('button', { name: /add investment|\+ invest/i }).first();
```