/**
 * Test: Click Quick Action buttons and verify proper navigation without dashboard redirect loops.
 */
import { test, expect } from '@playwright/test';
import { USERS, loginUser, skipOnboardingIfPresent, screenshot, isElementVisible } from './helpers';

const user = USERS.U1; // Arjun Sharma

test.describe('Quick Actions Navigation Test', () => {
  test.setTimeout(120_000);
  test.use({ storageState: undefined });

  test('Should navigate to correct pages from Quick Action modal', async ({ page }) => {
    // Log console events
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });

    console.log('Starting login for U1...');
    const loginResultUrl = await loginUser(page, user);
    console.log(`Login finished. Current URL: ${page.url()}, loginResultUrl: ${loginResultUrl}`);
    
    await skipOnboardingIfPresent(page);
    console.log(`After skipOnboardingIfPresent. Current URL: ${page.url()}`);
    await screenshot(page, 'quick_actions_01_dashboard');

    // Let's print out all buttons on the page for debugging
    const buttons = await page.locator('button').allTextContents();
    console.log('Buttons on page:', buttons);

    // 2. Open the Quick Actions Modal
    const quickAddButton = page.locator('[data-testid="quick-add-btn"], [aria-label="Quick Actions"], button:has-text("Add"), button:has-text("+"), button[aria-label="Add transaction"]').first();
    await quickAddButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
    await quickAddButton.click();
    await page.waitForTimeout(1000);
    await screenshot(page, 'quick_actions_02_modal_open');

    // Verify modal is open (checks element containing quick actions list)
    const modalTitle = page.getByText(/Quick Actions/i).first();
    expect(await isElementVisible(modalTitle, 3000), 'Quick Actions Modal should be open').toBe(true);

    // 3. Test "Expense" Quick Action (should navigate to add-transaction page)
    const expenseActionBtn = page.locator('[data-testid="quickaction-add-expense-button"], button:has-text("Expense")').first();
    await expenseActionBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'quick_actions_03_expense_navigated');

    // We should be on Add Transaction page (look for title or form fields)
    const addTransactionTitle = page.getByRole('heading', { name: /add transaction|add expense|new transaction/i }).first();
    const hasAddTransactionTitle = await isElementVisible(addTransactionTitle, 5000);
    expect(hasAddTransactionTitle, 'Should navigate to Add Transaction page on Expense click').toBe(true);

    // Go back to dashboard to test next quick action
    const backBtn = page.locator('button[aria-label="Back"], button:has-text("Back"), button:has(svg)').first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto('http://localhost:9002');
      await page.waitForTimeout(2000);
    }

    // 4. Open Quick Actions Modal again and test "New Goal" (should navigate to add-goal page)
    await quickAddButton.click();
    await page.waitForTimeout(1000);

    const goalActionBtn = page.locator('[data-testid="quickaction-add-goal-button"], button:has-text("New Goal")').first();
    await goalActionBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, 'quick_actions_04_goal_navigated');

    // We should be on Add Goal page
    const addGoalTitle = page.getByRole('heading', { name: /add goal|new goal|create goal|new saving goal/i }).first();
    const hasAddGoalTitle = await isElementVisible(addGoalTitle, 5000);
    expect(hasAddGoalTitle, 'Should navigate to Add Goal page on New Goal click').toBe(true);
  });
});
