# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-u5-transactions.spec.ts >> U5 – Portfolio Builder / Transaction Tester (Dev) >> U5-04: Add 5 expense transactions across categories
- Location: tests\e2e\06-u5-transactions.spec.ts:143:3

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
  100 |     await btn.waitFor({ state: 'visible', timeout: 4000 }).catch(() => null);
  101 |     if (await btn.isVisible()) {
  102 |       await btn.click();
  103 |       await page.waitForTimeout(800);
  104 |       await screenshot(page, '06_u5_03_add_txn_modal');
  105 | 
  106 |       // "New Transaction" modal — button text is "Income\nMoney received" so use partial match
  107 |       const typeModal = page.locator('div.fixed.inset-0').first();
  108 |       if (await typeModal.isVisible({ timeout: 2000 }).catch(() => false)) {
  109 |         const incomeCard = typeModal.locator('button').filter({ hasText: /income/i }).first();
  110 |         if (await incomeCard.isVisible({ timeout: 2000 }).catch(() => false)) {
  111 |           await incomeCard.click();
  112 |           await typeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
  113 |           await page.waitForTimeout(400);
  114 |         }
  115 |       } else {
  116 |         const incomeTab = page.locator('button, [role="tab"]').filter({ hasText: /^income$/i }).first();
  117 |         if (await incomeTab.isVisible({ timeout: 1500 }).catch(() => false)) await incomeTab.click();
  118 |       }
  119 | 
  120 |       // Description field: placeholder "Loan EMI / Friends / ATM Withdrawal"
  121 |       const descInput = page.locator('input[placeholder*="EMI" i], input[placeholder*="Loan EMI" i], input[placeholder*="ATM" i]').first();
  122 |       if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) await descInput.fill('Salary credit');
  123 | 
  124 |       const amtInput = page.locator('input[name="amount"]').first();
  125 |       if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('110000');
  126 | 
  127 |       await screenshot(page, '06_u5_03_income_filled');
  128 |       // AddTransaction header Save button — exact text "Save"
  129 |       const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
  130 |       if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) await saveBtn.click();
  131 |       await page.waitForTimeout(2500);
  132 |       await screenshot(page, '06_u5_03_income_saved');
  133 | 
  134 |       const body = await page.textContent('body');
  135 |       const saved = body?.includes('Salary') || body?.includes('1,10,000') || body?.includes('110000') || body?.includes('110,000');
  136 |       expect(saved, 'Salary income transaction should appear').toBe(true);
  137 |     } else {
  138 |       await screenshot(page, '06_u5_03_no_add_btn');
  139 |       console.warn('  ⚠️  Add Transaction button not found');
  140 |     }
  141 |   });
  142 | 
  143 |   test('U5-04: Add 5 expense transactions across categories', async ({ page }) => {
  144 |     await loginUser(page, U5);
  145 |     await skipOnboardingIfPresent(page);
  146 |     await clickNav(page, 'transaction');
  147 |     await page.waitForTimeout(800);
  148 | 
  149 |     const expenses = TRANSACTIONS.filter(t => t.type === 'expense').slice(0, 5);
  150 |     let addedCount = 0;
  151 | 
  152 |     for (const txn of expenses) {
  153 |       // Same split-fallback pattern as U5-03 — avoids .or() picking wrong elements in DOM order
  154 |       const addBtnRole = page.getByRole('button', { name: /add transaction|new transaction|\+ transaction|add income/i }).first();
  155 |       await addBtnRole.waitFor({ state: 'visible', timeout: 4000 }).catch(() => null);
  156 |       const floatBtn = page.locator('[class*="fab"], [class*="float"]').first();
  157 |       const addBtn = await addBtnRole.isVisible() ? addBtnRole : floatBtn;
  158 | 
  159 |       await addBtn.waitFor({ state: 'visible', timeout: 2000 }).catch(() => null);
  160 |       if (await addBtn.isVisible()) {
  161 |         await addBtn.click();
  162 |         await page.waitForTimeout(800);
  163 | 
  164 |         // The "New Transaction" modal shows Expense / Income / Transfer options.
  165 |         // Button text is "Expense\nMoney spent" so filter without anchors.
  166 |         const typeModal = page.locator('div.fixed.inset-0').first();
  167 |         if (await typeModal.isVisible({ timeout: 2000 }).catch(() => false)) {
  168 |           const expenseCard = typeModal.locator('button').filter({ hasText: /expense/i }).first();
  169 |           if (await expenseCard.isVisible({ timeout: 2000 }).catch(() => false)) {
  170 |             await expenseCard.click();
  171 |             // Wait for modal to close and AddTransaction form to load
  172 |             await typeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
  173 |             await page.waitForTimeout(400);
  174 |           }
  175 |         } else {
  176 |           // AddTransaction form is already open — switch to Expense tab if needed
  177 |           const expenseTab = page.locator('button, [role="tab"]').filter({ hasText: /^expense$/i }).first();
  178 |           if (await expenseTab.isVisible({ timeout: 1500 }).catch(() => false)) await expenseTab.click();
  179 |         }
  180 | 
  181 |         // Description field in AddTransaction has placeholder "Loan EMI / Friends / ATM Withdrawal"
  182 |         const descInput = page.locator('input[placeholder*="EMI" i], input[placeholder*="Loan EMI" i], input[placeholder*="ATM" i]').first();
  183 |         if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) await descInput.fill(txn.description);
  184 | 
  185 |         const amtInput = page.locator('input[name="amount"]').first();
  186 |         if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill(txn.amount);
  187 | 
  188 |         // AddTransaction header Save button — exact text "Save"
  189 |         const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
  190 |         if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  191 |           await saveBtn.click();
  192 |           await page.waitForTimeout(1500);
  193 |           addedCount++;
  194 |         }
  195 |       }
  196 |     }
  197 | 
  198 |     await screenshot(page, '06_u5_04_expenses_added');
  199 |     console.log(`  Added ${addedCount} of ${expenses.length} expense transactions`);
> 200 |     expect(addedCount, 'Should add at least 3 expense transactions').toBeGreaterThanOrEqual(3);
      |                                                                      ^ Error: Should add at least 3 expense transactions
  201 |   });
  202 | 
  203 |   test('U5-05: Transfer between accounts – ICICI to Paytm', async ({ page }) => {
  204 |     await loginUser(page, U5);
  205 |     await skipOnboardingIfPresent(page);
  206 | 
  207 |     // Find transfer button
  208 |     const transferBtn = page.getByRole('button', { name: /transfer|move money/i }).first()
  209 |       .or(page.locator('button, a').filter({ hasText: /transfer/i }).first());
  210 | 
  211 |     await clickNav(page, 'transaction');
  212 |     await page.waitForTimeout(800);
  213 | 
  214 |     const transfer = page.getByRole('button', { name: /transfer/i }).first();
  215 |     await transfer.waitFor({ state: 'visible', timeout: 4000 }).catch(() => null);
  216 |     if (await transfer.isVisible()) {
  217 |       await transfer.click();
  218 |       await page.waitForTimeout(600);
  219 |       await screenshot(page, '06_u5_05_transfer_modal');
  220 | 
  221 |       const amtInput = page.locator('input[name="amount"], input[type="number"]').first();
  222 |       if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('2000');
  223 | 
  224 |       await screenshot(page, '06_u5_05_transfer_filled');
  225 |       const saveBtn = page.getByRole('button', { name: /transfer|confirm|save|done/i }).last();
  226 |       await saveBtn.click();
  227 |       await page.waitForTimeout(2500);
  228 |       await screenshot(page, '06_u5_05_transfer_done');
  229 |       console.log('  Transfer submitted');
  230 |     } else {
  231 |       await screenshot(page, '06_u5_05_no_transfer_btn');
  232 |       console.warn('  ⚠️  Transfer button not found — checking for it in Add Transaction flow');
  233 |     }
  234 |   });
  235 | 
  236 |   test('U5-06: Set budget for Food category', async ({ page }) => {
  237 |     await loginUser(page, U5);
  238 |     await skipOnboardingIfPresent(page);
  239 |     await clickNav(page, 'budget');
  240 |     await page.waitForTimeout(1000);
  241 |     await screenshot(page, '06_u5_06_budget_page');
  242 | 
  243 |     const addBudgetBtn = page.getByRole('button', { name: /add budget|new budget|\+ budget|set budget/i }).first();
  244 |     await addBudgetBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
  245 |     if (await addBudgetBtn.isVisible()) {
  246 |       await addBudgetBtn.click();
  247 |       await page.waitForTimeout(600);
  248 | 
  249 |       const catInput = page.locator('input[name="category"], select[name="category"], [placeholder*="category" i]').first();
  250 |       if (await catInput.isVisible({ timeout: 2000 }).catch(() => false)) await catInput.fill('Food');
  251 | 
  252 |       const amtInput = page.locator('input[name="amount"], input[name="limit"], input[type="number"]').first();
  253 |       if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('8000');
  254 | 
  255 |       await screenshot(page, '06_u5_06_budget_filled');
  256 |       const saveBtn = page.getByRole('button', { name: /save|add|confirm/i }).last();
  257 |       await saveBtn.click();
  258 |       await page.waitForTimeout(2000);
  259 |       await screenshot(page, '06_u5_06_budget_saved');
  260 | 
  261 |       const body = await page.textContent('body');
  262 |       const saved = body?.includes('8,000') || body?.includes('8000') || body?.includes('Food');
  263 |       console.log(`  Budget saved: ${saved}`);
  264 |     } else {
  265 |       await screenshot(page, '06_u5_06_no_budget_btn');
  266 |       console.warn('  ⚠️  Add Budget button not found');
  267 |     }
  268 |   });
  269 | });
  270 | 
```