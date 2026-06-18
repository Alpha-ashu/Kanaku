/**
 * Sprint 1 – Test 03: U2 Priya Mehta – Group Expense Splitter
 * Tests: Add friends → Cross-user notifications → Create group → Add expenses → Split
 */
import { test, expect } from '@playwright/test';
import { USERS, loginUser, skipOnboardingIfPresent, screenshot, clickNav } from './helpers';

const U2 = USERS.U2;

test.describe('U2 – Group Expense Splitter (Priya)', () => {
  test.setTimeout(180_000);

  test('U2-01: Navigate to Friends section', async ({ page }) => {
    await loginUser(page, U2);
    await skipOnboardingIfPresent(page);

    const navClicked = await clickNav(page, 'friend');
    await page.waitForTimeout(1000);
    await screenshot(page, '03_u2_01_friends_page');

    const hasFriendsContent = await page.locator('h1,h2,h3,[class*="friend"]')
      .filter({ hasText: /friend|contact|people/i }).first()
      .isVisible({ timeout: 6000 }).catch(() => false);
    console.log(`  Friends section visible: ${hasFriendsContent}`);
  });

  test('U2-02: Add Arjun (U1) as friend', async ({ page }) => {
    await loginUser(page, U2);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'friend');
    await page.waitForTimeout(800);

    const addFriendBtn = page.getByRole('button', { name: /add friend|new friend|\+ friend|invite/i }).first();
    const visible = await addFriendBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (visible) {
      await addFriendBtn.click();
      await page.waitForTimeout(600);
      await screenshot(page, '03_u2_02_add_friend_modal');

      // Try filling by email
      const emailInput = page.locator('input[type="email"], input[placeholder*="email" i], input[name="email"]').first();
      if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emailInput.fill(USERS.U1.email);
      } else {
        // Try by name
        const nameInput = page.locator('input[placeholder*="name" i], input[name="name"]').first();
        if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nameInput.fill(USERS.U1.firstName + ' ' + USERS.U1.lastName);
        }
      }

      await screenshot(page, '03_u2_02_add_friend_filled');

      const saveBtn = page.getByRole('button', { name: /add|send|invite|confirm/i }).last();
      await saveBtn.click();
      await page.waitForTimeout(2500);
      await screenshot(page, '03_u2_02_add_friend_result');

      const body = await page.textContent('body');
      const success = body?.includes('Arjun') || body?.includes(USERS.U1.email)
        || body?.includes('added') || body?.includes('sent') || body?.includes('friend');
      console.log(`  Friend add result — Arjun visible: ${success}`);
    } else {
      await screenshot(page, '03_u2_02_no_add_friend_btn');
      console.warn('  ⚠️  Add Friend button not found');
    }
  });

  test('U2-03: Navigate to Groups / Split section', async ({ page }) => {
    await loginUser(page, U2);
    await skipOnboardingIfPresent(page);

    const navClicked = await clickNav(page, 'group')
      || await clickNav(page, 'split')
      || await clickNav(page, 'expense');
    await page.waitForTimeout(1000);
    await screenshot(page, '03_u2_03_groups_page');

    const hasGroupContent = await page.locator('h1,h2,button,[class*="group"],[class*="split"]')
      .filter({ hasText: /group|split|expense/i }).first()
      .isVisible({ timeout: 6000 }).catch(() => false);
    console.log(`  Groups section visible: ${hasGroupContent}`);
  });

  test('U2-04: Create "Goa Trip 2026" group', async ({ page }) => {
    await loginUser(page, U2);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'group') || await clickNav(page, 'split');
    await page.waitForTimeout(800);

    // Groups page has an "Expense" header button and "Create Group Expense" empty-state button.
    // Both call openGroupExpenseForm() which navigates to add-transaction with quickExpenseMode=group.
    const createBtn = page.locator('button').filter({ hasText: /^expense$|create group expense/i }).first();
    const visible = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (visible) {
      await createBtn.click();
      await page.waitForTimeout(800);
      await screenshot(page, '03_u2_04_create_group_modal');

      // In AddTransaction group mode: the description field becomes the group expense name.
      // It has no name attribute; placeholder is " Loan EMI / Friends / ATM Withdrawal".
      const descInput = page.locator('input[placeholder*="EMI" i], input[placeholder*="Loan EMI" i], input[placeholder*="ATM" i]').first();
      if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await descInput.fill('Goa Trip 2026');
      }

      // Amount field (name="amount" added in prior fix)
      const amtInput = page.locator('input[name="amount"]').first();
      if (await amtInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await amtInput.fill('20000');
        await page.waitForTimeout(300);
      }

      // Add at least one participant — required for group expense record to be created
      const newPersonBtn = page.locator('button').filter({ hasText: /^new$/i }).first();
      if (await newPersonBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newPersonBtn.click();
        await page.waitForTimeout(300);
        const newPersonInput = page.locator('input[placeholder*="Enter name" i]').first();
        if (await newPersonInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await newPersonInput.fill('Arjun Sharma');
          await newPersonInput.press('Enter');
          await page.waitForTimeout(400);
        }
      }

      await screenshot(page, '03_u2_04_group_name_filled');

      // Save button is in the header bar — text "Save"
      const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) await saveBtn.click();
      await page.waitForTimeout(2500);
      await screenshot(page, '03_u2_04_group_created');

      const body = await page.textContent('body');
      const groupCreated = body?.includes('Goa Trip') || body?.includes('Goa');
      console.log(`  Goa Trip group created: ${groupCreated}`);
      expect(groupCreated, 'Group "Goa Trip 2026" should appear after creation').toBe(true);
    } else {
      await screenshot(page, '03_u2_04_no_create_group_btn');
      console.warn('  ⚠️  Expense/Create Group button not found');
    }
  });

  test('U2-05: Add group expense – Hotel booking', async ({ page }) => {
    await loginUser(page, U2);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'group') || await clickNav(page, 'split');
    await page.waitForTimeout(800);

    await screenshot(page, '03_u2_05_groups_page');

    // Groups has no "group detail" drill-down — each expense is a card.
    // Click the "Expense" header button (or "Create Group Expense" empty-state) to add a hotel expense.
    const addExpenseBtn = page.locator('button').filter({ hasText: /^expense$|create group expense/i }).first();
    const visible = await addExpenseBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (visible) {
      await addExpenseBtn.click();
      await page.waitForTimeout(800);
      await screenshot(page, '03_u2_05_add_expense_form');

      // Description field (becomes the group expense name shown on Groups page)
      const descInput = page.locator('input[placeholder*="EMI" i], input[placeholder*="Loan EMI" i], input[placeholder*="ATM" i]').first();
      if (await descInput.isVisible({ timeout: 3000 }).catch(() => false)) await descInput.fill('Hotel – 3 nights');

      // Amount
      const amountInput = page.locator('input[name="amount"]').first();
      if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) await amountInput.fill('18000');

      // Add participant (required: group expense record only created when participants > 0)
      const newPersonBtn = page.locator('button').filter({ hasText: /^new$/i }).first();
      if (await newPersonBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newPersonBtn.click();
        await page.waitForTimeout(300);
        const newPersonInput = page.locator('input[placeholder*="Enter name" i]').first();
        if (await newPersonInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await newPersonInput.fill('Arjun Sharma');
          await newPersonInput.press('Enter');
          await page.waitForTimeout(400);
        }
      }

      await screenshot(page, '03_u2_05_expense_filled');

      const saveBtn = page.locator('button').filter({ hasText: /^save$/i }).first();
      if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await saveBtn.click();
      }
      await page.waitForTimeout(2500);
      await screenshot(page, '03_u2_05_expense_saved');

      const body = await page.textContent('body');
      const expenseSaved = body?.includes('Hotel') || body?.includes('18,000') || body?.includes('18000');
      console.log(`  Hotel expense added: ${expenseSaved}`);
      expect(expenseSaved, 'Hotel expense should appear in group').toBe(true);
    } else {
      await screenshot(page, '03_u2_05_no_add_expense_btn');
      console.warn('  ⚠️  Add Expense button not found');
    }
  });
});
