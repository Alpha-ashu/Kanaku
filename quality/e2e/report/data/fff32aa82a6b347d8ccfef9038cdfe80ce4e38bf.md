# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-pom-regression.spec.ts >> Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite >> 08. Recurring Liability Schedule Management
- Location: quality\e2e\09-pom-regression.spec.ts:273:3

# Error details

```
Error: Recurring schedule "Office Space Rent" should exist

expect(received).toContain(expected) // indexOf

Expected substring: "Office Space Rent"
Received string:    "
  KANAKU⌘KURecurring TransactionsCreate Recurring Auto-Pay Liquidity Protection₹32,000.00/moAggregate monthly projection of active recurring liabilities. Ensure your linked accounts retain sufficient balance before the due date.Active schedules1 ProfilesRent & Housingexpenseutilitiesmonthly Next: 1 Jul 2026Liability₹32,000.00Pause\"Rent & Housing\" created··········
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }·
    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }·
      100% {
        transform: rotate(360deg);
      }
    }······
"
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
            - button "AI Insights" [ref=e209] [cursor=pointer]:
              - img [ref=e210]
              - img [ref=e213]
          - listitem [ref=e220]:
            - button "Recurring" [ref=e221] [cursor=pointer]:
              - img [ref=e223]
              - img [ref=e229]
          - listitem [ref=e236]:
            - button "Budget Alerts" [ref=e237] [cursor=pointer]:
              - img [ref=e238]
              - img [ref=e244]
          - listitem [ref=e251]:
            - button "Settings" [ref=e252] [cursor=pointer]:
              - img [ref=e253]
              - img [ref=e257]
    - generic [ref=e265]:
      - banner [ref=e266]:
        - generic [ref=e267]:
          - generic [ref=e269]:
            - img [ref=e270]
            - textbox "Search transactions, assets..." [ref=e273]
            - generic: ⌘K
          - generic [ref=e274]:
            - generic "Offline sync disabled (schema incompatible)." [ref=e276]:
              - img [ref=e277]
            - button "Notifications" [ref=e279]:
              - img [ref=e280]
            - button "User profile" [ref=e283]:
              - generic [ref=e284]: U
      - main [ref=e285]:
        - generic [ref=e289]:
          - generic [ref=e290]:
            - heading "Recurring Transactions" [level=1] [ref=e294]
            - button "Create Recurring" [ref=e295]:
              - img [ref=e296]
              - text: Create Recurring
          - generic [ref=e299]:
            - generic [ref=e300]:
              - paragraph [ref=e301]:
                - img [ref=e302]
                - text: Auto-Pay Liquidity Protection
              - heading "₹32,000.00/mo" [level=3] [ref=e305]
              - paragraph [ref=e306]: Aggregate monthly projection of active recurring liabilities. Ensure your linked accounts retain sufficient balance before the due date.
            - generic [ref=e307]:
              - text: Active schedules
              - paragraph [ref=e308]: 1 Profiles
          - generic [ref=e310]:
            - generic [ref=e311]:
              - img [ref=e313]
              - generic [ref=e315]:
                - heading "Rent & Housing expense" [level=4] [ref=e316]:
                  - text: Rent & Housing
                  - generic [ref=e317]: expense
                - generic [ref=e318]:
                  - generic [ref=e319]: utilities
                  - generic [ref=e321]: monthly
                  - generic [ref=e323]:
                    - img [ref=e324]
                    - text: "Next: 1 Jul 2026"
            - generic [ref=e326]:
              - generic [ref=e327]:
                - generic [ref=e328]: Liability
                - paragraph [ref=e329]: ₹32,000.00
              - generic [ref=e330]:
                - button "Pause" [ref=e331]
                - button "Delete" [ref=e332]:
                  - img [ref=e333]
  - region "Notifications alt+T":
    - list:
      - listitem [ref=e336]:
        - button "Close toast" [ref=e337] [cursor=pointer]:
          - img [ref=e338]
        - img [ref=e342]
        - generic [ref=e345]: "\"Rent & Housing\" created"
```

# Test source

```ts
  1  | import { Locator, Page, expect } from '@playwright/test';
  2  | import { BasePage } from './BasePage';
  3  | 
  4  | export class RecurringPage extends BasePage {
  5  |   // Selectors
  6  |   readonly toggleFormBtn: Locator;
  7  |   readonly nameInput: Locator;
  8  |   readonly amountInput: Locator;
  9  |   readonly typeSelect: Locator;
  10 |   readonly categoryInput: Locator;
  11 |   readonly frequencySelect: Locator;
  12 |   readonly nextDueDateInput: Locator;
  13 |   readonly accountSelect: Locator;
  14 |   readonly submitBtn: Locator;
  15 | 
  16 |   constructor(page: Page) {
  17 |     super(page);
  18 |     this.toggleFormBtn = page.getByRole('button', { name: /Create Recurring|Close/i });
  19 |     this.nameInput = page.locator('input[placeholder*="Spotify" i]');
  20 |     this.amountInput = page.locator('input[placeholder="0.00"]');
  21 |     this.typeSelect = page.locator('select').nth(0);
  22 |     this.categoryInput = page.locator('input[placeholder*="Rent" i]');
  23 |     this.frequencySelect = page.locator('select').nth(1);
  24 |     this.nextDueDateInput = page.locator('input[type="date"]');
  25 |     this.accountSelect = page.locator('select').nth(2);
  26 |     this.submitBtn = page.getByRole('button', { name: /Create Schedule/i });
  27 |   }
  28 | 
  29 |   async clickToggleForm() {
  30 |     await this.toggleFormBtn.first().click();
  31 |     await this.wait(500);
  32 |   }
  33 | 
  34 |   async createSchedule(options: {
  35 |     name: string;
  36 |     amount: string;
  37 |     type: 'expense' | 'income' | 'transfer';
  38 |     category: string;
  39 |     frequency: 'weekly' | 'monthly' | 'yearly';
  40 |     nextDueDate: string;
  41 |     accountName: string;
  42 |   }) {
  43 |     // Open form if not open
  44 |     const isFormOpen = await this.nameInput.first().isVisible().catch(() => false);
  45 |     if (!isFormOpen) {
  46 |       await this.clickToggleForm();
  47 |     }
  48 | 
  49 |     await this.nameInput.first().fill(options.name);
  50 |     await this.amountInput.first().fill(options.amount);
  51 |     await this.typeSelect.first().selectOption(options.type);
  52 |     await this.categoryInput.first().fill(options.category);
  53 |     await this.frequencySelect.first().selectOption(options.frequency);
  54 |     await this.nextDueDateInput.first().fill(options.nextDueDate);
  55 | 
  56 |     // Select account
  57 |     if (await this.accountSelect.first().isVisible()) {
  58 |       // Find option containing the account name
  59 |       await this.accountSelect.first().selectOption({ label: options.accountName });
  60 |     }
  61 | 
  62 |     await this.submitBtn.first().click();
  63 |     await this.wait(2000);
  64 |   }
  65 | 
  66 |   async assertScheduleExists(name: string, amount?: string) {
  67 |     const pageText = await this.page.textContent('body');
> 68 |     expect(pageText, `Recurring schedule "${name}" should exist`).toContain(name);
     |                                                                   ^ Error: Recurring schedule "Office Space Rent" should exist
  69 |     if (amount) {
  70 |       const formatted = Number(amount).toLocaleString();
  71 |       expect(pageText, `Recurring schedule amount should show ${formatted}`).toContain(formatted);
  72 |     }
  73 |   }
  74 | 
  75 |   async pauseSchedule(name: string) {
  76 |     const card = this.page.locator('div, article, .card').filter({ hasText: name }).first();
  77 |     const pauseBtn = card.getByRole('button', { name: 'Pause' }).first();
  78 |     await pauseBtn.click();
  79 |     await this.wait(1000);
  80 |   }
  81 | 
  82 |   async deleteSchedule(name: string) {
  83 |     const card = this.page.locator('div, article, .card').filter({ hasText: name }).first();
  84 |     const deleteBtn = card.locator('button').filter({ has: this.page.locator('svg') }).last(); // Last button with icon inside card
  85 |     await deleteBtn.click();
  86 |     await this.wait(1500);
  87 |   }
  88 | }
  89 | 
```