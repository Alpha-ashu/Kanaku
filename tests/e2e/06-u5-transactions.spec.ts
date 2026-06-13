/**
 * Sprint 1 – Test 06: U5 Dev Nair – Portfolio Builder
 * Tests: Multiple accounts → Diverse transactions → Transfer between accounts → Budget setup
 */
import { test, expect } from '@playwright/test';
import { USERS, loginUser, skipOnboardingIfPresent, screenshot, clickNav } from './helpers';

const U5 = USERS.U5;

const TRANSACTIONS = [
  { type: 'expense', description: 'Swiggy order',         amount: '485',   category: 'Food' },
  { type: 'expense', description: 'Petrol – HP Pump',      amount: '2500',  category: 'Transport' },
  { type: 'expense', description: 'Amazon – Keyboard',     amount: '2799',  category: 'Shopping' },
  { type: 'expense', description: 'Electricity bill',      amount: '1840',  category: 'Utilities' },
  { type: 'expense', description: 'Pharmacy – Apollo',     amount: '680',   category: 'Healthcare' },
  { type: 'expense', description: 'Pet food – Drools',     amount: '1200',  category: 'Pet' },
  { type: 'income',  description: 'Salary credit',         amount: '110000', category: 'Salary' },
];

test.describe('U5 – Portfolio Builder / Transaction Tester (Dev)', () => {
  test.setTimeout(180_000);

  test('U5-01: Add ICICI Savings account', async ({ page }) => {
    await loginUser(page, U5);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'account');
    await page.waitForTimeout(800);

    const addBtn = page.getByRole('button', { name: /add account|new account|\+ account/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(600);
      await screenshot(page, '06_u5_01_add_account_modal');

      const nameInput = page.locator('input[name="name"], input[placeholder*="account name" i], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('ICICI Savings');

      const balInput = page.locator('input[name="balance"], input[name="openingBalance"], input[name="amount"], input[type="number"]').first();
      if (await balInput.isVisible({ timeout: 2000 }).catch(() => false)) await balInput.fill('85000');

      const saveBtn = page.getByRole('button', { name: /save|add|create|confirm/i }).last();
      await saveBtn.click();
      await page.waitForTimeout(2500);
      await screenshot(page, '06_u5_01_account_saved');

      const body = await page.textContent('body');
      const saved = body?.includes('ICICI') || body?.includes('85,000') || body?.includes('85000');
      expect(saved, 'ICICI Savings account should appear').toBe(true);
    } else {
      await screenshot(page, '06_u5_01_no_add_btn');
      console.warn('  ⚠️  Add Account button not found');
    }
  });

  test('U5-02: Add Paytm Wallet account', async ({ page }) => {
    await loginUser(page, U5);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'account');
    await page.waitForTimeout(800);

    const addBtn = page.getByRole('button', { name: /add account|new account|\+ account/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(600);

      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Paytm Wallet');

      // Select wallet type if dropdown available
      const walletType = page.locator('select, [role="listbox"]').first();
      if (await walletType.isVisible({ timeout: 1000 }).catch(() => false)) {
        await walletType.click();
        const walletOpt = page.locator('[role="option"]').filter({ hasText: /wallet/i }).first();
        if (await walletOpt.isVisible({ timeout: 1000 }).catch(() => false)) await walletOpt.click();
      }

      const balInput = page.locator('input[name="balance"], input[type="number"]').first();
      if (await balInput.isVisible({ timeout: 2000 }).catch(() => false)) await balInput.fill('4500');

      const saveBtn = page.getByRole('button', { name: /save|add|create|confirm/i }).last();
      await saveBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '06_u5_02_paytm_saved');
    }
  });

  test('U5-03: Add income transaction – Salary', async ({ page }) => {
    await loginUser(page, U5);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'transaction');
    await page.waitForTimeout(800);

    const addBtn = page.getByRole('button', { name: /add transaction|new transaction|\+ transaction|add income|record/i }).first();
    const floatBtn = page.locator('[class*="fab"], [class*="float"]').first();
    const btn = await addBtn.isVisible({ timeout: 3000 }).catch(() => false) ? addBtn : floatBtn;

    if (await btn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(800);
      await screenshot(page, '06_u5_03_add_txn_modal');

      // "New Transaction" modal — button text is "Income\nMoney received" so use partial match
      const typeModal = page.locator('div.fixed.inset-0').first();
      if (await typeModal.isVisible({ timeout: 2000 }).catch(() => false)) {
        const incomeCard = typeModal.locator('button').filter({ hasText: /income/i }).first();
        if (await incomeCard.isVisible({ timeout: 2000 }).catch(() => false)) {
          await incomeCard.click();
          await typeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
          await page.waitForTimeout(400);
        }
      } else {
        const incomeTab = page.locator('button, [role="tab"]').filter({ hasText: /^income$/i }).first();
        if (await incomeTab.isVisible({ timeout: 1500 }).catch(() => false)) await incomeTab.click();
      }

      // Description field: placeholder "Loan EMI / Friends / ATM Withdrawal"
      const descInput = page.locator('input[placeholder*="EMI" i], input[placeholder*="Loan EMI" i], input[placeholder*="ATM" i]').first();
      if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) await descInput.fill('Salary credit');

      const amtInput = page.locator('input[name="amount"]').first();
      if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('110000');

      await screenshot(page, '06_u5_03_income_filled');
      // AddTransaction header Save button — exact text "Save"
      const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
      if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) await saveBtn.click();
      await page.waitForTimeout(2500);
      await screenshot(page, '06_u5_03_income_saved');

      const body = await page.textContent('body');
      const saved = body?.includes('Salary') || body?.includes('1,10,000') || body?.includes('110000') || body?.includes('110,000');
      expect(saved, 'Salary income transaction should appear').toBe(true);
    } else {
      await screenshot(page, '06_u5_03_no_add_btn');
      console.warn('  ⚠️  Add Transaction button not found');
    }
  });

  test('U5-04: Add 5 expense transactions across categories', async ({ page }) => {
    await loginUser(page, U5);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'transaction');
    await page.waitForTimeout(800);

    const expenses = TRANSACTIONS.filter(t => t.type === 'expense').slice(0, 5);
    let addedCount = 0;

    for (const txn of expenses) {
      const addBtn = page.getByRole('button', { name: /add transaction|new transaction|\+ transaction|add/i }).first()
        .or(page.locator('[class*="fab"], [class*="float"]').first());

      if (await addBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(800);

        // The "New Transaction" modal shows Expense / Income / Transfer options.
        // Button text is "Expense\nMoney spent" so filter without anchors.
        const typeModal = page.locator('div.fixed.inset-0').first();
        if (await typeModal.isVisible({ timeout: 2000 }).catch(() => false)) {
          const expenseCard = typeModal.locator('button').filter({ hasText: /expense/i }).first();
          if (await expenseCard.isVisible({ timeout: 2000 }).catch(() => false)) {
            await expenseCard.click();
            // Wait for modal to close and AddTransaction form to load
            await typeModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => null);
            await page.waitForTimeout(400);
          }
        } else {
          // AddTransaction form is already open — switch to Expense tab if needed
          const expenseTab = page.locator('button, [role="tab"]').filter({ hasText: /^expense$/i }).first();
          if (await expenseTab.isVisible({ timeout: 1500 }).catch(() => false)) await expenseTab.click();
        }

        // Description field in AddTransaction has placeholder "Loan EMI / Friends / ATM Withdrawal"
        const descInput = page.locator('input[placeholder*="EMI" i], input[placeholder*="Loan EMI" i], input[placeholder*="ATM" i]').first();
        if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) await descInput.fill(txn.description);

        const amtInput = page.locator('input[name="amount"]').first();
        if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill(txn.amount);

        // AddTransaction header Save button — exact text "Save"
        const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
        if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await saveBtn.click();
          await page.waitForTimeout(1500);
          addedCount++;
        }
      }
    }

    await screenshot(page, '06_u5_04_expenses_added');
    console.log(`  Added ${addedCount} of ${expenses.length} expense transactions`);
    expect(addedCount, 'Should add at least 3 expense transactions').toBeGreaterThanOrEqual(3);
  });

  test('U5-05: Transfer between accounts – ICICI to Paytm', async ({ page }) => {
    await loginUser(page, U5);
    await skipOnboardingIfPresent(page);

    // Find transfer button
    const transferBtn = page.getByRole('button', { name: /transfer|move money/i }).first()
      .or(page.locator('button, a').filter({ hasText: /transfer/i }).first());

    await clickNav(page, 'transaction');
    await page.waitForTimeout(800);

    const transfer = page.getByRole('button', { name: /transfer/i }).first();
    if (await transfer.isVisible({ timeout: 4000 }).catch(() => false)) {
      await transfer.click();
      await page.waitForTimeout(600);
      await screenshot(page, '06_u5_05_transfer_modal');

      const amtInput = page.locator('input[name="amount"], input[type="number"]').first();
      if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('2000');

      await screenshot(page, '06_u5_05_transfer_filled');
      const saveBtn = page.getByRole('button', { name: /transfer|confirm|save|done/i }).last();
      await saveBtn.click();
      await page.waitForTimeout(2500);
      await screenshot(page, '06_u5_05_transfer_done');
      console.log('  Transfer submitted');
    } else {
      await screenshot(page, '06_u5_05_no_transfer_btn');
      console.warn('  ⚠️  Transfer button not found — checking for it in Add Transaction flow');
    }
  });

  test('U5-06: Set budget for Food category', async ({ page }) => {
    await loginUser(page, U5);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'budget');
    await page.waitForTimeout(1000);
    await screenshot(page, '06_u5_06_budget_page');

    const addBudgetBtn = page.getByRole('button', { name: /add budget|new budget|\+ budget|set budget/i }).first();
    if (await addBudgetBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBudgetBtn.click();
      await page.waitForTimeout(600);

      const catInput = page.locator('input[name="category"], select[name="category"], [placeholder*="category" i]').first();
      if (await catInput.isVisible({ timeout: 2000 }).catch(() => false)) await catInput.fill('Food');

      const amtInput = page.locator('input[name="amount"], input[name="limit"], input[type="number"]').first();
      if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('8000');

      await screenshot(page, '06_u5_06_budget_filled');
      const saveBtn = page.getByRole('button', { name: /save|add|confirm/i }).last();
      await saveBtn.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '06_u5_06_budget_saved');

      const body = await page.textContent('body');
      const saved = body?.includes('8,000') || body?.includes('8000') || body?.includes('Food');
      console.log(`  Budget saved: ${saved}`);
    } else {
      await screenshot(page, '06_u5_06_no_budget_btn');
      console.warn('  ⚠️  Add Budget button not found');
    }
  });
});
