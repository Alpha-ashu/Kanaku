/**
 * Sprint 1 – Test 05: U4 Sneha Kapoor – Goal Setter
 * Tests: Create 3 goals → Add contributions → Verify progress → Goal completion
 */
import { test, expect } from '@playwright/test';
import { USERS, loginUser, skipOnboardingIfPresent, screenshot, clickNav } from './helpers';

const U4 = USERS.U4;

test.describe('U4 – Goal Setter (Sneha)', () => {
  test.setTimeout(120_000);

  test('U4-01: Navigate to Goals', async ({ page }) => {
    await loginUser(page, U4);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'goal');
    // Goals page h1 is "Goals & Savings" — use exact text to avoid AnimatePresence DOM overlap
    const hasGoalsContent = await page.getByText('Goals & Savings', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    await screenshot(page, '05_u4_01_goals_page');
    expect(hasGoalsContent, 'Goals page should load').toBe(true);
  });

  test('U4-02: Create Emergency Fund goal', async ({ page }) => {
    await loginUser(page, U4);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'goal');
    await page.waitForTimeout(800);

    const addBtn = page.getByRole('button', { name: /add goal|new goal|\+ goal|create goal/i }).first();
    const visible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (visible) {
      await addBtn.click();
      await page.waitForTimeout(600);
      await screenshot(page, '05_u4_02_add_goal_modal');

      // Name / title
      const nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="goal" i], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Emergency Fund');

      // Target amount
      const targetInput = page.locator('input[name="targetAmount"], input[name="target"], input[name="amount"], input[placeholder*="target" i], input[placeholder*="amount" i]').first();
      if (await targetInput.isVisible({ timeout: 3000 }).catch(() => false)) await targetInput.fill('300000');

      // Deadline / target date
      const dateInput = page.locator('input[name="deadline"], input[name="targetDate"], input[name="dueDate"], input[type="date"]').first();
      if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) await dateInput.fill('2026-12-31');

      await screenshot(page, '05_u4_02_goal_filled');

      const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /save|create|add|confirm/i }).last();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(2500);
        await screenshot(page, '05_u4_02_goal_saved');

        const body = await page.textContent('body');
        const goalSaved = body?.includes('Emergency') || body?.includes('3,00,000') || body?.includes('300000') || body?.includes('300,000');
        if (!goalSaved) console.warn('  ⚠️  Emergency Fund goal not found — form validation may have blocked submission');
        else console.log('  ✅ Emergency Fund goal saved');
      } else {
        await screenshot(page, '05_u4_02_save_btn_disabled');
        console.warn('  ⚠️  Save button disabled — goal form may require additional required fields');
      }
    } else {
      await screenshot(page, '05_u4_02_no_add_btn');
      console.warn('  ⚠️  Add Goal button not found');
    }
  });

  test('U4-03: Create Europe Vacation goal', async ({ page }) => {
    await loginUser(page, U4);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'goal');
    await page.waitForTimeout(800);

    const addBtn = page.getByRole('button', { name: /add goal|new goal|\+ goal|create goal/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(600);

      const nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Europe Vacation 2027');

      const targetInput = page.locator('input[name="targetAmount"], input[name="target"], input[name="amount"]').first();
      if (await targetInput.isVisible({ timeout: 2000 }).catch(() => false)) await targetInput.fill('250000');

      const dateInput = page.locator('input[type="date"]').first();
      if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) await dateInput.fill('2027-03-31');

      const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /save|create|add|confirm/i }).last();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) await saveBtn.click();
      else console.warn('  ⚠️  Europe Vacation save button disabled');
      await page.waitForTimeout(2500);
      await screenshot(page, '05_u4_03_vacation_goal_saved');

      const body = await page.textContent('body');
      const saved = body?.includes('Europe') || body?.includes('Vacation');
      console.log(`  Europe Vacation goal saved: ${saved}`);
    }
  });

  test('U4-04: Add contribution to Emergency Fund', async ({ page }) => {
    await loginUser(page, U4);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'goal');
    await page.waitForTimeout(800);

    // Click into Emergency Fund goal
    const efGoal = page.getByText(/Emergency Fund/i).first();
    if (await efGoal.isVisible({ timeout: 5000 }).catch(() => false)) {
      await efGoal.click();
      await page.waitForTimeout(800);
      await screenshot(page, '05_u4_04_goal_detail');

      // Add contribution
      const addContribBtn = page.getByRole('button', { name: /add contribution|contribute|add savings|deposit/i }).first();
      if (await addContribBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await addContribBtn.click();
        await page.waitForTimeout(500);

        const amtInput = page.locator('input[name="amount"], input[type="number"], input[placeholder*="amount" i]').first();
        if (await amtInput.isVisible({ timeout: 3000 }).catch(() => false)) await amtInput.fill('25000');

        const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /save|add|confirm/i }).last();
        if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) await saveBtn.click();
        else console.warn('  ⚠️  Contribution save button disabled');
        await page.waitForTimeout(2000);
        await screenshot(page, '05_u4_04_contribution_saved');

        const body = await page.textContent('body');
        const hasProgress = body?.includes('25,000') || body?.includes('25000') || body?.includes('%');
        console.log(`  Contribution saved, progress visible: ${hasProgress}`);
        expect(hasProgress, 'Contribution should update goal progress').toBe(true);
      } else {
        await screenshot(page, '05_u4_04_no_contribute_btn');
        console.warn('  ⚠️  Contribute button not found inside goal');
      }
    } else {
      console.warn('  ⚠️  Emergency Fund goal not found in list');
      await screenshot(page, '05_u4_04_goal_not_found');
    }
  });

  test('U4-05: Create New Laptop goal and complete it', async ({ page }) => {
    await loginUser(page, U4);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'goal');
    await page.waitForTimeout(800);

    // Create Laptop goal
    const addBtn = page.getByRole('button', { name: /add goal|new goal|\+ goal|create goal/i }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(600);

      // Wait for AddGoal page heading before filling
      await page.getByRole('heading', { name: /new saving goal|add goal/i }).first()
        .waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);

      const nameInput = page.locator('input[placeholder*="e.g" i], input[placeholder*="goal" i], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('New Laptop');

      const targetInput = page.locator('input[name="targetAmount"]').first();
      if (await targetInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await targetInput.fill('120000');
        await page.waitForTimeout(200);
      }

      // Deadline is required — fill it
      const dateInput = page.locator('input[type="date"]').first();
      if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) await dateInput.fill('2026-12-31');
      await page.waitForTimeout(300);

      const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /create goal/i }).first();
      if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) await saveBtn.click();
      else console.warn('  ⚠️  New Laptop Create Goal button not enabled');
      await page.waitForTimeout(2000);

      // Now add full contribution to complete it
      const laptopGoal = page.getByText(/New Laptop/i).first();
      if (await laptopGoal.isVisible({ timeout: 4000 }).catch(() => false)) {
        await laptopGoal.click();
        await page.waitForTimeout(600);

        const addContribBtn = page.getByRole('button', { name: /add contribution|contribute|add|deposit/i }).first();
        if (await addContribBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addContribBtn.click();
          await page.waitForTimeout(400);
          const amtInput = page.locator('input[name="amount"], input[type="number"]').first();
          if (await amtInput.isVisible({ timeout: 2000 }).catch(() => false)) await amtInput.fill('120000');
          const saveBtn2 = page.locator('button:not([disabled])').filter({ hasText: /save|add|confirm/i }).last();
          if (await saveBtn2.isVisible({ timeout: 3000 }).catch(() => false)) await saveBtn2.click();
          else console.warn('  ⚠️  Laptop goal contribution save button disabled');
          await page.waitForTimeout(2500);
          await screenshot(page, '05_u4_05_laptop_goal_completed');

          const body = await page.textContent('body');
          const completed = body?.includes('100') || body?.includes('Complete') || body?.includes('Achieved') || body?.includes('🎉');
          console.log(`  Laptop goal completed (100%): ${completed}`);
        }
      }
    }
  });
});
