# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-u5-transactions.spec.ts >> U5 – Portfolio Builder / Transaction Tester (Dev) >> U5-04: Add 5 expense transactions across categories
- Location: tests\e2e\06-u5-transactions.spec.ts:139:3

# Error details

```
Error: Should add at least 3 expense transactions

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 3
Received:    0
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic:
      - textbox: dev.test@finora.app
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
  92  | 
  93  |     const addBtn = page.getByRole('button', { name: /add transaction|new transaction|\+ transaction|add income|record/i }).first();
  94  |     const floatBtn = page.locator('[class*="fab"], [class*="float"]').first();
  95  |     const btn = await addBtn.isVisible({ timeout: 3000 }).catch(() => false) ? addBtn : floatBtn;
  96  | 
  97  |     if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) {
  98  |       await btn.click();
  99  |       await page.waitForTimeout(800);
  100 |       await screenshot(page, '06_u5_03_add_txn_modal');
  101 | 
  102 |       // "New Transaction" modal — button text is "Income\nMoney received" so use partial match
  103 |       const typeModal = page.locator('div.fixed.inset-0').first();
  104 |       if (await typeModal.isVisible({ timeout: 2000 }).catch(() => false)) {
  105 |         const incomeCard = typeModal.locator('button').filter({ hasText: /income/i }).first();
  106 |         if (await incomeCard.isVisible({ timeout: 2000 }).catch(() => false)) {
  107 |           await incomeCard.click();
  108 |           await typeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
  109 |           await page.waitForTimeout(400);
  110 |         }
  111 |       } else {
  112 |         const incomeTab = page.locator('button, [role="tab"]').filter({ hasText: /^income$/i }).first();
  113 |         if (await incomeTab.isVisible({ timeout: 1500 }).catch(() => false)) await incomeTab.click();
  114 |       }
  115 | 
  116 |       // Description field: placeholder "Loan EMI / Friends / ATM Withdrawal"
  117 |       const descInput = page.locator('input[placeholder*="EMI" i], input[placeholder*="Loan EMI" i], input[placeholder*="ATM" i]').first();
  118 |       if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) await descInput.fill('Salary credit');
  119 | 
  120 |       const amtInput = page.locator('input[name="amount"]').first();
  121 |       if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('110000');
  122 | 
  123 |       await screenshot(page, '06_u5_03_income_filled');
  124 |       // AddTransaction header Save button — exact text "Save"
  125 |       const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
  126 |       if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) await saveBtn.click();
  127 |       await page.waitForTimeout(2500);
  128 |       await screenshot(page, '06_u5_03_income_saved');
  129 | 
  130 |       const body = await page.textContent('body');
  131 |       const saved = body?.includes('Salary') || body?.includes('1,10,000') || body?.includes('110000') || body?.includes('110,000');
  132 |       expect(saved, 'Salary income transaction should appear').toBe(true);
  133 |     } else {
  134 |       await screenshot(page, '06_u5_03_no_add_btn');
  135 |       console.warn('  ⚠️  Add Transaction button not found');
  136 |     }
  137 |   });
  138 | 
  139 |   test('U5-04: Add 5 expense transactions across categories', async ({ page }) => {
  140 |     await loginUser(page, U5);
  141 |     await skipOnboardingIfPresent(page);
  142 |     await clickNav(page, 'transaction');
  143 |     await page.waitForTimeout(800);
  144 | 
  145 |     const expenses = TRANSACTIONS.filter(t => t.type === 'expense').slice(0, 5);
  146 |     let addedCount = 0;
  147 | 
  148 |     for (const txn of expenses) {
  149 |       const addBtn = page.getByRole('button', { name: /add transaction|new transaction|\+ transaction|add/i }).first()
  150 |         .or(page.locator('[class*="fab"], [class*="float"]').first());
  151 | 
  152 |       if (await addBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
  153 |         await addBtn.click();
  154 |         await page.waitForTimeout(800);
  155 | 
  156 |         // The "New Transaction" modal shows Expense / Income / Transfer options.
  157 |         // Button text is "Expense\nMoney spent" so filter without anchors.
  158 |         const typeModal = page.locator('div.fixed.inset-0').first();
  159 |         if (await typeModal.isVisible({ timeout: 2000 }).catch(() => false)) {
  160 |           const expenseCard = typeModal.locator('button').filter({ hasText: /expense/i }).first();
  161 |           if (await expenseCard.isVisible({ timeout: 2000 }).catch(() => false)) {
  162 |             await expenseCard.click();
  163 |             // Wait for modal to close and AddTransaction form to load
  164 |             await typeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
  165 |             await page.waitForTimeout(400);
  166 |           }
  167 |         } else {
  168 |           // AddTransaction form is already open — switch to Expense tab if needed
  169 |           const expenseTab = page.locator('button, [role="tab"]').filter({ hasText: /^expense$/i }).first();
  170 |           if (await expenseTab.isVisible({ timeout: 1500 }).catch(() => false)) await expenseTab.click();
  171 |         }
  172 | 
  173 |         // Description field in AddTransaction has placeholder "Loan EMI / Friends / ATM Withdrawal"
  174 |         const descInput = page.locator('input[placeholder*="EMI" i], input[placeholder*="Loan EMI" i], input[placeholder*="ATM" i]').first();
  175 |         if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) await descInput.fill(txn.description);
  176 | 
  177 |         const amtInput = page.locator('input[name="amount"]').first();
  178 |         if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill(txn.amount);
  179 | 
  180 |         // AddTransaction header Save button — exact text "Save"
  181 |         const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
  182 |         if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  183 |           await saveBtn.click();
  184 |           await page.waitForTimeout(1500);
  185 |           addedCount++;
  186 |         }
  187 |       }
  188 |     }
  189 | 
  190 |     await screenshot(page, '06_u5_04_expenses_added');
  191 |     console.log(`  Added ${addedCount} of ${expenses.length} expense transactions`);
> 192 |     expect(addedCount, 'Should add at least 3 expense transactions').toBeGreaterThanOrEqual(3);
      |                                                                      ^ Error: Should add at least 3 expense transactions
  193 |   });
  194 | 
  195 |   test('U5-05: Transfer between accounts – ICICI to Paytm', async ({ page }) => {
  196 |     await loginUser(page, U5);
  197 |     await skipOnboardingIfPresent(page);
  198 | 
  199 |     // Find transfer button
  200 |     const transferBtn = page.getByRole('button', { name: /transfer|move money/i }).first()
  201 |       .or(page.locator('button, a').filter({ hasText: /transfer/i }).first());
  202 | 
  203 |     await clickNav(page, 'transaction');
  204 |     await page.waitForTimeout(800);
  205 | 
  206 |     const transfer = page.getByRole('button', { name: /transfer/i }).first();
  207 |     if (await transfer.isVisible({ timeout: 4000 }).catch(() => false)) {
  208 |       await transfer.click();
  209 |       await page.waitForTimeout(600);
  210 |       await screenshot(page, '06_u5_05_transfer_modal');
  211 | 
  212 |       const amtInput = page.locator('input[name="amount"], input[type="number"]').first();
  213 |       if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('2000');
  214 | 
  215 |       await screenshot(page, '06_u5_05_transfer_filled');
  216 |       const saveBtn = page.getByRole('button', { name: /transfer|confirm|save|done/i }).last();
  217 |       await saveBtn.click();
  218 |       await page.waitForTimeout(2500);
  219 |       await screenshot(page, '06_u5_05_transfer_done');
  220 |       console.log('  Transfer submitted');
  221 |     } else {
  222 |       await screenshot(page, '06_u5_05_no_transfer_btn');
  223 |       console.warn('  ⚠️  Transfer button not found — checking for it in Add Transaction flow');
  224 |     }
  225 |   });
  226 | 
  227 |   test('U5-06: Set budget for Food category', async ({ page }) => {
  228 |     await loginUser(page, U5);
  229 |     await skipOnboardingIfPresent(page);
  230 |     await clickNav(page, 'budget');
  231 |     await page.waitForTimeout(1000);
  232 |     await screenshot(page, '06_u5_06_budget_page');
  233 | 
  234 |     const addBudgetBtn = page.getByRole('button', { name: /add budget|new budget|\+ budget|set budget/i }).first();
  235 |     if (await addBudgetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  236 |       await addBudgetBtn.click();
  237 |       await page.waitForTimeout(600);
  238 | 
  239 |       const catInput = page.locator('input[name="category"], select[name="category"], [placeholder*="category" i]').first();
  240 |       if (await catInput.isVisible({ timeout: 2000 }).catch(() => false)) await catInput.fill('Food');
  241 | 
  242 |       const amtInput = page.locator('input[name="amount"], input[name="limit"], input[type="number"]').first();
  243 |       if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('8000');
  244 | 
  245 |       await screenshot(page, '06_u5_06_budget_filled');
  246 |       const saveBtn = page.getByRole('button', { name: /save|add|confirm/i }).last();
  247 |       await saveBtn.click();
  248 |       await page.waitForTimeout(2000);
  249 |       await screenshot(page, '06_u5_06_budget_saved');
  250 | 
  251 |       const body = await page.textContent('body');
  252 |       const saved = body?.includes('8,000') || body?.includes('8000') || body?.includes('Food');
  253 |       console.log(`  Budget saved: ${saved}`);
  254 |     } else {
  255 |       await screenshot(page, '06_u5_06_no_budget_btn');
  256 |       console.warn('  ⚠️  Add Budget button not found');
  257 |     }
  258 |   });
  259 | });
  260 | 
```