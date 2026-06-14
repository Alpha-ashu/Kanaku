# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 07-u6-todos.spec.ts >> U6 – Collaborative Planner (Isha) >> U6-03: Add tasks to Daily Finance Tasks list
- Location: tests\e2e\07-u6-todos.spec.ts:77:3

# Error details

```
Error: Should add at least 1 task

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 1
Received:    0
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic:
      - textbox: isha.test@finora.app
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
  26  |       .waitFor({ state: 'visible', timeout: 12000 })
  27  |       .then(() => true)
  28  |       .catch(() => false);
  29  |     console.log(`  To-Do section visible: ${hasTodoContent}`);
  30  |     expect(hasTodoContent, 'To-Do section should load').toBe(true);
  31  |   });
  32  | 
  33  |   test('U6-02: Create personal list "Daily Finance Tasks"', async ({ page }) => {
  34  |     await loginUser(page, U6);
  35  |     await skipOnboardingIfPresent(page);
  36  |     await clickNav(page, 'todo') || await clickNav(page, 'task');
  37  |     await page.waitForTimeout(800);
  38  | 
  39  |     const createListBtn = page.getByRole('button', { name: /create list|new list|\+ list|add list/i }).first();
  40  |     if (await createListBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  41  |       await createListBtn.click();
  42  |       await page.waitForTimeout(600);
  43  |       await screenshot(page, '07_u6_02_create_list_modal');
  44  | 
  45  |       const nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="list" i], input[placeholder*="name" i], input[placeholder*="e.g" i], input[placeholder*="task" i]').first();
  46  |       if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Daily Finance Tasks');
  47  | 
  48  |       // Click "Create List" specifically inside the modal — avoid behind-modal empty-state button
  49  |       const modalCreateBtn = page.locator('div.fixed button').filter({ hasText: /create list/i }).first();
  50  |       if (await modalCreateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  51  |         await modalCreateBtn.click();
  52  |       } else {
  53  |         const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /create list|save|confirm/i }).first();
  54  |         if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) await saveBtn.click();
  55  |       }
  56  |       await page.waitForTimeout(2000);
  57  |       await screenshot(page, '07_u6_02_list_created');
  58  | 
  59  |       const body = await page.textContent('body');
  60  |       const listCreated = body?.includes('Daily Finance') || body?.includes('Daily');
  61  |       expect(listCreated, 'Daily Finance Tasks list should appear').toBe(true);
  62  |     } else {
  63  |       // Maybe there's an inline input
  64  |       const inlineInput = page.locator('input[placeholder*="list" i], input[placeholder*="name" i]').first();
  65  |       if (await inlineInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  66  |         await inlineInput.fill('Daily Finance Tasks');
  67  |         await inlineInput.press('Enter');
  68  |         await page.waitForTimeout(1500);
  69  |         await screenshot(page, '07_u6_02_list_inline_created');
  70  |       } else {
  71  |         await screenshot(page, '07_u6_02_no_create_list_btn');
  72  |         console.warn('  ⚠️  Create List button not found');
  73  |       }
  74  |     }
  75  |   });
  76  | 
  77  |   test('U6-03: Add tasks to Daily Finance Tasks list', async ({ page }) => {
  78  |     await loginUser(page, U6);
  79  |     await skipOnboardingIfPresent(page);
  80  |     await clickNav(page, 'todo') || await clickNav(page, 'task');
  81  |     await page.waitForTimeout(800);
  82  | 
  83  |     // Wait for backend sync to populate Dexie with lists from U6-02
  84  |     await page.waitForTimeout(2000);
  85  |     // Open Daily Finance Tasks list via the "Open" button (clicking title text alone doesn't navigate)
  86  |     const listTitle = page.getByText(/Daily Finance/i).first();
  87  |     await listTitle.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
  88  |     if (await listTitle.isVisible({ timeout: 1000 }).catch(() => false)) {
  89  |       // Find Open button specifically within a card containing "Daily Finance"
  90  |       const dailyCard = page.locator('div, article, li').filter({ hasText: /Daily Finance/i })
  91  |         .filter({ has: page.getByRole('button', { name: /^open$/i }) }).first();
  92  |       const openBtn = dailyCard.getByRole('button', { name: /^open$/i }).first();
  93  |       if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  94  |         await openBtn.click();
  95  |       } else {
  96  |         await listTitle.click(); // fallback: click title text
  97  |       }
  98  |       // Wait for ToDoListDetail to load — it shows a spinner while fetching from Dexie
  99  |       await page.locator('input[placeholder*="done" i], input[placeholder*="task" i], input[placeholder*="needs to be done" i]').first()
  100 |         .waitFor({ state: 'visible', timeout: 12000 }).catch(() => null);
  101 |     }
  102 | 
  103 |     await screenshot(page, '07_u6_03_inside_list');
  104 | 
  105 |     const tasks = [
  106 |       'Check bank balance every morning',
  107 |       'Log all expenses by 9 PM',
  108 |       'Pay electricity bill before June 15',
  109 |     ];
  110 | 
  111 |     let addedCount = 0;
  112 |     for (const task of tasks) {
  113 |       // Task input placeholder is "What needs to be done?" — match done/task/item/add patterns
  114 |       const taskInput = page.locator('input[placeholder*="done" i], input[placeholder*="task" i], input[placeholder*="item" i], input[placeholder*="add" i], input[placeholder*="needs" i]').first();
  115 | 
  116 |       if (await taskInput.isVisible({ timeout: 4000 }).catch(() => false)) {
  117 |         await taskInput.fill(task);
  118 |         await taskInput.press('Enter');
  119 |         await page.waitForTimeout(800);
  120 |         addedCount++;
  121 |       }
  122 |     }
  123 | 
  124 |     await screenshot(page, '07_u6_03_tasks_added');
  125 |     console.log(`  Added ${addedCount} tasks`);
> 126 |     expect(addedCount, 'Should add at least 1 task').toBeGreaterThanOrEqual(1);
      |                                                      ^ Error: Should add at least 1 task
  127 |   });
  128 | 
  129 |   test('U6-04: Mark a task as complete', async ({ page }) => {
  130 |     await loginUser(page, U6);
  131 |     await skipOnboardingIfPresent(page);
  132 |     await clickNav(page, 'todo') || await clickNav(page, 'task');
  133 |     await page.waitForTimeout(800);
  134 | 
  135 |     // Open the list
  136 |     const list = page.getByText(/Daily Finance/i).first();
  137 |     if (await list.isVisible({ timeout: 4000 }).catch(() => false)) {
  138 |       await list.click();
  139 |       await page.waitForTimeout(600);
  140 |     }
  141 | 
  142 |     await screenshot(page, '07_u6_04_before_complete');
  143 | 
  144 |     // Click a checkbox / complete button for first task
  145 |     const checkbox = page.locator('input[type="checkbox"], button[aria-label*="complete" i], [role="checkbox"]').first();
  146 |     if (await checkbox.isVisible({ timeout: 4000 }).catch(() => false)) {
  147 |       await checkbox.click();
  148 |       await page.waitForTimeout(1500);
  149 |       await screenshot(page, '07_u6_04_task_completed');
  150 | 
  151 |       // Verify completion state — crossed-out text or checked state
  152 |       const isCompleted = await checkbox.isChecked().catch(() => false)
  153 |         || await page.locator('[class*="complete"], [class*="done"], [class*="checked"], s, del').first().isVisible({ timeout: 2000 }).catch(() => false);
  154 |       console.log(`  Task marked complete: ${isCompleted}`);
  155 |       expect(isCompleted, 'Task should show completed state after check').toBe(true);
  156 |     } else {
  157 |       await screenshot(page, '07_u6_04_no_checkbox');
  158 |       console.warn('  ⚠️  No checkbox/complete button found for tasks');
  159 |     }
  160 |   });
  161 | 
  162 |   test('U6-05: Create shared To-Do list with Arjun', async ({ page }) => {
  163 |     await loginUser(page, U6);
  164 |     await skipOnboardingIfPresent(page);
  165 |     await clickNav(page, 'todo') || await clickNav(page, 'task');
  166 |     await page.waitForTimeout(800);
  167 | 
  168 |     const createListBtn = page.getByRole('button', { name: /create list|new list|\+ list/i }).first();
  169 |     if (await createListBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  170 |       await createListBtn.click();
  171 |       await page.waitForTimeout(600);
  172 | 
  173 |       const nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="name" i], input[placeholder*="e.g" i], input[placeholder*="task" i]').first();
  174 |       if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) await nameInput.fill('Goa Trip Planning');
  175 | 
  176 |       // Try to add shared users / members
  177 |       const shareInput = page.locator('input[placeholder*="share" i], input[placeholder*="member" i], input[placeholder*="invite" i], input[placeholder*="email" i]').first();
  178 |       if (await shareInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  179 |         await shareInput.fill(USERS.U1.email);
  180 |         await shareInput.press('Enter');
  181 |         await page.waitForTimeout(400);
  182 |       }
  183 | 
  184 |       await screenshot(page, '07_u6_05_shared_list_setup');
  185 | 
  186 |       // Click "Create List" specifically inside the modal — avoid behind-modal empty-state button
  187 |       const modalCreateBtn = page.locator('div.fixed button').filter({ hasText: /create list/i }).first();
  188 |       if (await modalCreateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  189 |         await modalCreateBtn.click();
  190 |       } else {
  191 |         const saveBtn = page.locator('button:not([disabled])').filter({ hasText: /create list|save|confirm/i }).first();
  192 |         if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) await saveBtn.click();
  193 |       }
  194 |       await page.waitForTimeout(2500);
  195 |       await screenshot(page, '07_u6_05_shared_list_created');
  196 | 
  197 |       const body = await page.textContent('body');
  198 |       const sharedListCreated = body?.includes('Goa Trip') || body?.includes('Goa');
  199 |       console.log(`  Shared To-Do list "Goa Trip Planning" created: ${sharedListCreated}`);
  200 |     } else {
  201 |       await screenshot(page, '07_u6_05_no_create_btn');
  202 |       console.warn('  ⚠️  Create List button not found for shared list');
  203 |     }
  204 |   });
  205 | 
  206 |   test('U6-06: Add tasks to shared Goa Trip list', async ({ page }) => {
  207 |     await loginUser(page, U6);
  208 |     await skipOnboardingIfPresent(page);
  209 |     await clickNav(page, 'todo') || await clickNav(page, 'task');
  210 |     await page.waitForTimeout(800);
  211 | 
  212 |     // Wait for backend sync to populate Dexie with lists from U6-05
  213 |     await page.waitForTimeout(2000);
  214 |     const goaListTitle = page.getByText(/Goa Trip/i).first();
  215 |     await goaListTitle.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
  216 |     if (await goaListTitle.isVisible({ timeout: 1000 }).catch(() => false)) {
  217 |       // Find the "Open" button specifically within a card that contains "Goa Trip"
  218 |       const goaCard = page.locator('div, article, li').filter({ hasText: /Goa Trip/i })
  219 |         .filter({ has: page.getByRole('button', { name: /^open$/i }) }).first();
  220 |       const goaOpenBtn = goaCard.getByRole('button', { name: /^open$/i }).first();
  221 |       if (await goaOpenBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  222 |         await goaOpenBtn.click();
  223 |       } else {
  224 |         await goaListTitle.click(); // fallback
  225 |       }
  226 |       // Wait for ToDoListDetail to load (spinner disappears, input appears)
```