# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-pom-regression.spec.ts >> Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite >> 05. Goals & Contribution Tracking
- Location: tests\e2e\09-pom-regression.spec.ts:182:3

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('input[name="name"], input[name="title"], input[placeholder*="goal" i], input[placeholder*="name" i]').first()

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e6]:
      - img [ref=e8]
      - navigation [ref=e14]:
        - list [ref=e15]:
          - listitem [ref=e16]:
            - button "Dashboard" [ref=e17] [cursor=pointer]:
              - img [ref=e18]
              - img [ref=e24]
          - listitem [ref=e31]:
            - button "Accounts" [ref=e32] [cursor=pointer]:
              - img [ref=e33]
              - img [ref=e37]
          - listitem [ref=e44]:
            - button "Transactions" [ref=e45] [cursor=pointer]:
              - img [ref=e46]
              - img [ref=e50]
          - listitem [ref=e57]:
            - button "Calendar" [ref=e58] [cursor=pointer]:
              - img [ref=e59]
              - img [ref=e62]
          - listitem [ref=e69]:
            - button "Investments" [ref=e70] [cursor=pointer]:
              - img [ref=e71]
              - img [ref=e75]
          - listitem [ref=e82]:
            - button "Loans" [ref=e83] [cursor=pointer]:
              - img [ref=e84]
              - img [ref=e91]
          - listitem [ref=e98]:
            - button "Goals" [ref=e99] [cursor=pointer]:
              - img [ref=e100]
              - img [ref=e105]
          - listitem [ref=e112]:
            - button "Group Expenses" [ref=e113] [cursor=pointer]:
              - img [ref=e114]
              - img [ref=e120]
          - listitem [ref=e127]:
            - button "Reports" [ref=e128] [cursor=pointer]:
              - img [ref=e129]
              - img [ref=e132]
          - listitem [ref=e139]:
            - button "Todo Lists" [ref=e140] [cursor=pointer]:
              - img [ref=e141]
              - img [ref=e145]
          - listitem [ref=e152]:
            - button "Book Advisor" [ref=e153] [cursor=pointer]:
              - img [ref=e154]
              - img [ref=e160]
          - listitem [ref=e167]:
            - button "Voice Logging" [ref=e168] [cursor=pointer]:
              - img [ref=e169]
              - img [ref=e173]
          - listitem [ref=e180]:
            - button "Receipt Scanner" [ref=e181] [cursor=pointer]:
              - img [ref=e182]
              - img [ref=e188]
          - listitem [ref=e195]:
            - button "Notifications" [ref=e196] [cursor=pointer]:
              - img [ref=e197]
              - img [ref=e201]
          - listitem [ref=e208]:
            - button "Recurring" [ref=e209] [cursor=pointer]:
              - img [ref=e210]
              - img [ref=e216]
          - listitem [ref=e223]:
            - button "Budget Alerts" [ref=e224] [cursor=pointer]:
              - img [ref=e225]
              - img [ref=e231]
          - listitem [ref=e238]:
            - button "Settings" [ref=e239] [cursor=pointer]:
              - img [ref=e240]
              - img [ref=e244]
    - generic [ref=e252]:
      - banner [ref=e253]:
        - generic [ref=e254]:
          - generic [ref=e256]:
            - img [ref=e257]
            - textbox "Search transactions, assets..." [ref=e260]
            - generic: ⌘K
          - generic [ref=e261]:
            - generic "Offline sync disabled (schema incompatible)." [ref=e263]:
              - img [ref=e264]
            - button [ref=e266]:
              - img [ref=e267]
            - button "Profile" [ref=e270]:
              - img "Profile" [ref=e271]
      - main [ref=e272]:
        - generic [ref=e273]:
          - heading "New Saving Goal" [level=1] [ref=e277]
          - main [ref=e278]:
            - generic [ref=e279]:
              - generic [ref=e280]:
                - button "Individual" [ref=e281]:
                  - img [ref=e282]
                  - text: Individual
                - button "Group Goal" [ref=e286]:
                  - img [ref=e287]
                  - text: Group Goal
              - generic [ref=e292]:
                - generic [ref=e293]:
                  - text: Goal Name
                  - generic [ref=e294]:
                    - img [ref=e295]
                    - textbox "e.g. New Macbook Pro" [ref=e299]
                - generic [ref=e300]:
                  - text: Category
                  - generic [ref=e301]:
                    - generic [ref=e302]:
                      - generic [ref=e303]:
                        - generic [ref=e304] [cursor=pointer]:
                          - img [ref=e306]
                          - generic [ref=e312]: Travel
                        - generic [ref=e313] [cursor=pointer]:
                          - img [ref=e315]
                          - generic [ref=e322]: Emergency Fund
                        - generic [ref=e323] [cursor=pointer]:
                          - img [ref=e325]
                          - generic [ref=e332]: Gadget
                        - generic [ref=e333] [cursor=pointer]:
                          - img [ref=e335]
                          - generic [ref=e342]: Wedding
                        - generic [ref=e343] [cursor=pointer]:
                          - img [ref=e345]
                          - generic [ref=e351]: Education
                        - generic [ref=e352] [cursor=pointer]:
                          - img [ref=e354]
                          - generic [ref=e361]: Investment
                        - generic [ref=e362] [cursor=pointer]:
                          - img [ref=e364]
                          - generic [ref=e374]: Vehicle
                        - generic [ref=e375] [cursor=pointer]:
                          - img [ref=e377]
                          - generic [ref=e385]: Business
                      - generic [ref=e386]:
                        - generic [ref=e387] [cursor=pointer]:
                          - img [ref=e389]
                          - generic [ref=e396]: Personal
                        - generic [ref=e397] [cursor=pointer]:
                          - img [ref=e399]
                          - generic [ref=e405]: Custom
                    - generic [ref=e406]:
                      - button "Go to page 1" [ref=e407]
                      - button "Go to page 2" [ref=e408]
                - generic [ref=e409]:
                  - text: Description / Note
                  - generic [ref=e410]:
                    - img [ref=e411]
                    - textbox "What is this for?" [ref=e412]
            - generic [ref=e413]:
              - generic [ref=e414]:
                - generic [ref=e416]: Target Goal Amount
                - generic [ref=e417]:
                  - generic [ref=e418]: INR
                  - spinbutton [ref=e419]
              - generic [ref=e420]:
                - generic [ref=e421]:
                  - generic [ref=e422]:
                    - text: Initial Deposit
                    - generic [ref=e423]:
                      - generic [ref=e424]: INR
                      - spinbutton [ref=e425]
                  - generic [ref=e426]:
                    - text: Target Date
                    - generic [ref=e427]:
                      - img [ref=e428]
                      - textbox "Target date" [ref=e430]
                - generic [ref=e431]:
                  - text: Monthly Plan
                  - generic [ref=e433]:
                    - generic [ref=e434]: INR
                    - spinbutton "Monthly saving plan" [ref=e435]: "0"
              - generic [ref=e436]:
                - generic [ref=e437]:
                  - img [ref=e439]
                  - generic [ref=e443]:
                    - paragraph [ref=e444]: Goal Summary
                    - paragraph [ref=e445]: New Goal
                - generic [ref=e446]:
                  - paragraph [ref=e447]: Target
                  - paragraph [ref=e448]: INR 0
          - generic [ref=e450]:
            - button "Discard" [ref=e451]:
              - img [ref=e452]
              - text: Discard
            - button "Create Goal" [ref=e455]:
              - img [ref=e456]
              - text: Create Goal
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { Locator, Page, expect } from '@playwright/test';
  2  | import { BasePage } from './BasePage';
  3  | 
  4  | export class GoalPage extends BasePage {
  5  |   // Selectors
  6  |   readonly addGoalBtn: Locator;
  7  |   readonly nameInput: Locator;
  8  |   readonly targetAmountInput: Locator;
  9  |   readonly targetDateInput: Locator;
  10 |   readonly saveGoalBtn: Locator;
  11 | 
  12 |   constructor(page: Page) {
  13 |     super(page);
  14 |     this.addGoalBtn = page.getByRole('button', { name: /add goal|new goal|\+ goal|create goal/i });
  15 |     this.nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="goal" i], input[placeholder*="name" i]');
  16 |     this.targetAmountInput = page.locator('input[name="targetAmount"], input[name="target"], input[name="amount"]');
  17 |     this.targetDateInput = page.locator('input[name="deadline"], input[name="targetDate"], input[name="dueDate"], input[type="date"]');
  18 |     this.saveGoalBtn = page.locator('button:not([disabled])').filter({ hasText: /save|create|add|confirm/i });
  19 |   }
  20 | 
  21 |   async clickAddGoal() {
  22 |     await this.addGoalBtn.first().click();
  23 |     await this.wait(800);
  24 |   }
  25 | 
  26 |   async createGoal(options: {
  27 |     name: string;
  28 |     targetAmount: string;
  29 |     targetDate: string;
  30 |   }) {
  31 |     await this.clickAddGoal();
> 32 |     await this.nameInput.first().fill(options.name);
     |                                  ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  33 |     await this.targetAmountInput.first().fill(options.targetAmount);
  34 |     await this.targetDateInput.first().fill(options.targetDate);
  35 |     await this.saveGoalBtn.last().click();
  36 |     await this.wait(2000);
  37 |   }
  38 | 
  39 |   async clickGoal(name: string) {
  40 |     const goalEl = this.page.getByText(name, { exact: false }).first();
  41 |     await goalEl.click();
  42 |     await this.wait(800);
  43 |   }
  44 | 
  45 |   async addContribution(amount: string) {
  46 |     const addContribBtn = this.page.getByRole('button', { name: /add contribution|contribute|add savings|deposit/i }).first();
  47 |     await addContribBtn.click();
  48 |     await this.wait(500);
  49 | 
  50 |     const amtInput = this.page.locator('input[name="amount"], input[type="number"], input[placeholder*="amount" i]').first();
  51 |     await amtInput.fill(amount);
  52 | 
  53 |     const saveBtn = this.page.locator('button:not([disabled])').filter({ hasText: /save|add|confirm/i }).last();
  54 |     await saveBtn.click();
  55 |     await this.wait(2000);
  56 |   }
  57 | 
  58 |   async assertGoalExists(name: string, targetAmount?: string) {
  59 |     const pageText = await this.page.textContent('body');
  60 |     expect(pageText, `Goal "${name}" should exist in the goals list`).toContain(name);
  61 |     if (targetAmount) {
  62 |       const formatted = Number(targetAmount).toLocaleString();
  63 |       expect(pageText, `Goal target amount should show ${formatted}`).toContain(formatted);
  64 |     }
  65 |   }
  66 | }
  67 | 
```