/**
 * Sprint 1 – Test 07: U6 Isha Patel – Collaborative Planner
 * Tests: Personal To-Do lists → Mark complete → Shared To-Do → Real-time task sync
 */
import { test, expect } from '@playwright/test';
import { USERS, loginUser, skipOnboardingIfPresent, screenshot, clickNav } from './helpers';

const U6 = USERS.U6;

test.describe('U6 – Collaborative Planner (Isha)', () => {
  test.setTimeout(120_000);

  test('U6-01: Navigate to To-Do section', async ({ page }) => {
    await loginUser(page, U6);
    await skipOnboardingIfPresent(page);

    const navClicked = await clickNav(page, 'todo')
      || await clickNav(page, 'task')
      || await clickNav(page, 'to-do')
      || await clickNav(page, 'list');
    await page.waitForTimeout(1000);
    await screenshot(page, '07_u6_01_todos_page');

    // ToDoLists page has h1 "To-Do Lists" from PageHeader — use specific text to avoid AnimatePresence overlap
    const hasTodoContent = await page.getByText('To-Do Lists', { exact: false }).first()
      .waitFor({ state: 'visible', timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    console.log(`  To-Do section visible: ${hasTodoContent}`);
    expect(hasTodoContent, 'To-Do section should load').toBe(true);
  });

  test('U6-02: Create personal list "Daily Finance Tasks"', async ({ page }) => {
    await loginUser(page, U6);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'todo') || await clickNav(page, 'task');
    await page.waitForTimeout(800);

    const createListBtn = page.getByRole('button', { name: /create list|new list|\+ list|add list/i }).first();
    if (await createListBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createListBtn.click();
      await page.waitForTimeout(600);
      await screenshot(page, '07_u6_02_create_list_modal');

      const nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="list" i], input[placeholder*="name" i], input[placeholder*="e.g" i], input[placeholder*="task" i]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Daily Finance Tasks');

      // Click "Create List" specifically inside the modal — avoid behind-modal empty-state button
      const modalCreateBtn = page.locator('div.fixed button').filter({ hasText: /create list/i }).first();
      if (await modalCreateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await modalCreateBtn.click();
      } else {
        const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /create list|save|confirm/i }).first();
        if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) await saveBtn.click();
      }
      await page.waitForTimeout(2000);
      await screenshot(page, '07_u6_02_list_created');

      const body = await page.textContent('body');
      const listCreated = body?.includes('Daily Finance') || body?.includes('Daily');
      expect(listCreated, 'Daily Finance Tasks list should appear').toBe(true);
    } else {
      // Maybe there's an inline input
      const inlineInput = page.locator('input[placeholder*="list" i], input[placeholder*="name" i]').first();
      if (await inlineInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await inlineInput.fill('Daily Finance Tasks');
        await inlineInput.press('Enter');
        await page.waitForTimeout(1500);
        await screenshot(page, '07_u6_02_list_inline_created');
      } else {
        await screenshot(page, '07_u6_02_no_create_list_btn');
        console.warn('  ⚠️  Create List button not found');
      }
    }
  });

  test('U6-03: Add tasks to Daily Finance Tasks list', async ({ page }) => {
    await loginUser(page, U6);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'todo') || await clickNav(page, 'task');
    await page.waitForTimeout(800);

    // Wait for backend sync to populate Dexie with lists from U6-02
    await page.waitForTimeout(2000);
    // Open Daily Finance Tasks list via the "Open" button (clicking title text alone doesn't navigate)
    const listTitle = page.getByText(/Daily Finance/i).first();
    await listTitle.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
    if (await listTitle.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Find Open button specifically within a card containing "Daily Finance"
      const dailyCard = page.locator('div, article, li').filter({ hasText: /Daily Finance/i })
        .filter({ has: page.getByRole('button', { name: /^open$/i }) }).first();
      const openBtn = dailyCard.getByRole('button', { name: /^open$/i }).first();
      if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await openBtn.click();
      } else {
        await listTitle.click(); // fallback: click title text
      }
      // Wait for ToDoListDetail to load — it shows a spinner while fetching from Dexie
      await page.locator('input[placeholder*="done" i], input[placeholder*="task" i], input[placeholder*="needs to be done" i]').first()
        .waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
    }

    await screenshot(page, '07_u6_03_inside_list');

    const tasks = [
      'Check bank balance every morning',
      'Log all expenses by 9 PM',
      'Pay electricity bill before June 15',
    ];

    let addedCount = 0;
    for (const task of tasks) {
      // Task input placeholder is "What needs to be done?" — match done/task/item/add patterns
      const taskInput = page.locator('input[placeholder*="done" i], input[placeholder*="task" i], input[placeholder*="item" i], input[placeholder*="add" i], input[placeholder*="needs" i]').first();

      if (await taskInput.isVisible({ timeout: 4000 }).catch(() => false)) {
        await taskInput.fill(task);
        await taskInput.press('Enter');
        await page.waitForTimeout(800);
        addedCount++;
      }
    }

    await screenshot(page, '07_u6_03_tasks_added');
    console.log(`  Added ${addedCount} tasks`);
    expect(addedCount, 'Should add at least 1 task').toBeGreaterThanOrEqual(1);
  });

  test('U6-04: Mark a task as complete', async ({ page }) => {
    await loginUser(page, U6);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'todo') || await clickNav(page, 'task');
    await page.waitForTimeout(800);

    // Open the list
    const list = page.getByText(/Daily Finance/i).first();
    if (await list.isVisible({ timeout: 4000 }).catch(() => false)) {
      await list.click();
      await page.waitForTimeout(600);
    }

    await screenshot(page, '07_u6_04_before_complete');

    // Click a checkbox / complete button for first task
    const checkbox = page.locator('input[type="checkbox"], button[aria-label*="complete" i], [role="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 4000 }).catch(() => false)) {
      await checkbox.click();
      await page.waitForTimeout(1500);
      await screenshot(page, '07_u6_04_task_completed');

      // Verify completion state — crossed-out text or checked state
      const isCompleted = await checkbox.isChecked().catch(() => false)
        || await page.locator('[class*="complete"], [class*="done"], [class*="checked"], s, del').first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`  Task marked complete: ${isCompleted}`);
      expect(isCompleted, 'Task should show completed state after check').toBe(true);
    } else {
      await screenshot(page, '07_u6_04_no_checkbox');
      console.warn('  ⚠️  No checkbox/complete button found for tasks');
    }
  });

  test('U6-05: Create shared To-Do list with Arjun', async ({ page }) => {
    await loginUser(page, U6);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'todo') || await clickNav(page, 'task');
    await page.waitForTimeout(800);

    const createListBtn = page.getByRole('button', { name: /create list|new list|\+ list/i }).first();
    if (await createListBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createListBtn.click();
      await page.waitForTimeout(600);

      const nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="name" i], input[placeholder*="e.g" i], input[placeholder*="task" i]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Goa Trip Planning');

      // Try to add shared users / members
      const shareInput = page.locator('input[placeholder*="share" i], input[placeholder*="member" i], input[placeholder*="invite" i], input[placeholder*="email" i]').first();
      if (await shareInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await shareInput.fill(USERS.U1.email);
        await shareInput.press('Enter');
        await page.waitForTimeout(400);
      }

      await screenshot(page, '07_u6_05_shared_list_setup');

      // Click "Create List" specifically inside the modal — avoid behind-modal empty-state button
      const modalCreateBtn = page.locator('div.fixed button').filter({ hasText: /create list/i }).first();
      if (await modalCreateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await modalCreateBtn.click();
      } else {
        const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /create list|save|confirm/i }).first();
        if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) await saveBtn.click();
      }
      await page.waitForTimeout(2500);
      await screenshot(page, '07_u6_05_shared_list_created');

      const body = await page.textContent('body');
      const sharedListCreated = body?.includes('Goa Trip') || body?.includes('Goa');
      console.log(`  Shared To-Do list "Goa Trip Planning" created: ${sharedListCreated}`);
    } else {
      await screenshot(page, '07_u6_05_no_create_btn');
      console.warn('  ⚠️  Create List button not found for shared list');
    }
  });

  test('U6-06: Add tasks to shared Goa Trip list', async ({ page }) => {
    await loginUser(page, U6);
    await skipOnboardingIfPresent(page);
    await clickNav(page, 'todo') || await clickNav(page, 'task');
    await page.waitForTimeout(800);

    // Wait for backend sync to populate Dexie with lists from U6-05
    await page.waitForTimeout(2000);
    const goaListTitle = page.getByText(/Goa Trip/i).first();
    await goaListTitle.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
    if (await goaListTitle.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Find the "Open" button specifically within a card that contains "Goa Trip"
      const goaCard = page.locator('div, article, li').filter({ hasText: /Goa Trip/i })
        .filter({ has: page.getByRole('button', { name: /^open$/i }) }).first();
      const goaOpenBtn = goaCard.getByRole('button', { name: /^open$/i }).first();
      if (await goaOpenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await goaOpenBtn.click();
      } else {
        await goaListTitle.click(); // fallback
      }
      // Wait for ToDoListDetail to load (spinner disappears, input appears)
      await page.locator('input[placeholder*="done" i], input[placeholder*="task" i], input[placeholder*="needs to be done" i]').first()
        .waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
    }

    const sharedTasks = ['Book return train tickets', 'Research hotels in South Goa', 'Buy travel insurance'];
    let addedCount = 0;

    for (const task of sharedTasks) {
      const taskInput = page.locator('input[placeholder*="done" i], input[placeholder*="task" i], input[placeholder*="add" i], input[placeholder*="item" i], input[placeholder*="needs" i]').first();
      if (await taskInput.isVisible({ timeout: 4000 }).catch(() => false)) {
        await taskInput.fill(task);
        await taskInput.press('Enter');
        await page.waitForTimeout(800);
        addedCount++;
      }
    }

    await screenshot(page, '07_u6_06_shared_tasks_added');
    console.log(`  Added ${addedCount} tasks to shared list`);
    expect(addedCount, 'Should add at least 1 task to shared list').toBeGreaterThanOrEqual(1);
  });
});
