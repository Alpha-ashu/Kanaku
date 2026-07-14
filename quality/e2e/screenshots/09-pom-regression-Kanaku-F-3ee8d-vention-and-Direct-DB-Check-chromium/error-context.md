# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-pom-regression.spec.ts >> Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite >> 04. Transactions, Double-Submit Prevention, and Direct DB Check
- Location: quality\e2e\09-pom-regression.spec.ts:125:3

# Error details

```
Error: Could not find Add Transaction button
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
              - img [ref=e47]
              - img [ref=e51]
          - listitem [ref=e58]:
            - button "Calendar" [ref=e59] [cursor=pointer]:
              - img [ref=e60]
              - img [ref=e63]
          - listitem [ref=e70]:
            - button "Investments" [ref=e71] [cursor=pointer]:
              - img [ref=e72]
              - img [ref=e76]
          - listitem [ref=e83]:
            - button "Loans" [ref=e84] [cursor=pointer]:
              - img [ref=e85]
              - img [ref=e92]
          - listitem [ref=e99]:
            - button "Goals" [ref=e100] [cursor=pointer]:
              - img [ref=e101]
              - img [ref=e106]
          - listitem [ref=e113]:
            - button "Group Expenses" [ref=e114] [cursor=pointer]:
              - img [ref=e115]
              - img [ref=e121]
          - listitem [ref=e128]:
            - button "Reports" [ref=e129] [cursor=pointer]:
              - img [ref=e130]
              - img [ref=e133]
          - listitem [ref=e140]:
            - button "Todo Lists" [ref=e141] [cursor=pointer]:
              - img [ref=e142]
              - img [ref=e146]
          - listitem [ref=e153]:
            - button "Book Advisor" [ref=e154] [cursor=pointer]:
              - img [ref=e155]
              - img [ref=e161]
          - listitem [ref=e168]:
            - button "Voice Logging" [ref=e169] [cursor=pointer]:
              - img [ref=e170]
              - img [ref=e174]
          - listitem [ref=e181]:
            - button "Receipt Scanner" [ref=e182] [cursor=pointer]:
              - img [ref=e183]
              - img [ref=e189]
          - listitem [ref=e196]:
            - button "Notifications" [ref=e197] [cursor=pointer]:
              - img [ref=e198]
              - img [ref=e202]
          - listitem [ref=e209]:
            - button "AI Insights" [ref=e210] [cursor=pointer]:
              - img [ref=e211]
              - img [ref=e214]
          - listitem [ref=e221]:
            - button "Recurring" [ref=e222] [cursor=pointer]:
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
            - heading "Transactions" [level=1] [ref=e292]
            - generic [ref=e293]:
              - button "Scan Bill" [ref=e294]:
                - img [ref=e295]
                - text: Scan Bill
              - button "Add Transaction" [ref=e298]:
                - img [ref=e299]
                - text: Add Transaction
          - generic [ref=e301]:
            - button "2026 JAN" [ref=e302]:
              - generic [ref=e303]: "2026"
              - generic [ref=e304]: JAN
            - button "2026 FEB" [ref=e305]:
              - generic [ref=e306]: "2026"
              - generic [ref=e307]: FEB
            - button "2026 MAR" [ref=e308]:
              - generic [ref=e309]: "2026"
              - generic [ref=e310]: MAR
            - button "2026 APR" [ref=e311]:
              - generic [ref=e312]: "2026"
              - generic [ref=e313]: APR
            - button "2026 MAY" [ref=e314]:
              - generic [ref=e315]: "2026"
              - generic [ref=e316]: MAY
            - button "2026 JUN" [ref=e317]:
              - generic [ref=e318]: "2026"
              - generic [ref=e319]: JUN
            - button "2026 JUL" [ref=e320]:
              - generic [ref=e321]: "2026"
              - generic [ref=e322]: JUL
            - button "2026 AUG" [ref=e324]:
              - generic [ref=e325]: "2026"
              - generic [ref=e326]: AUG
            - button "2026 SEP" [ref=e327]:
              - generic [ref=e328]: "2026"
              - generic [ref=e329]: SEP
            - button "2026 OCT" [ref=e330]:
              - generic [ref=e331]: "2026"
              - generic [ref=e332]: OCT
            - button "2026 NOV" [ref=e333]:
              - generic [ref=e334]: "2026"
              - generic [ref=e335]: NOV
            - button "2026 DEC" [ref=e336]:
              - generic [ref=e337]: "2026"
              - generic [ref=e338]: DEC
            - button "2027 JAN" [ref=e339]:
              - generic [ref=e340]: "2027"
              - generic [ref=e341]: JAN
          - generic [ref=e343]:
            - button "Daily" [ref=e344]:
              - generic [ref=e345]: Daily
            - button "Weekly" [ref=e346]:
              - generic [ref=e347]: Weekly
            - button "Monthly" [ref=e348]:
              - generic [ref=e350]: Monthly
            - button "Yearly" [ref=e351]:
              - generic [ref=e352]: Yearly
          - generic [ref=e353]:
            - generic [ref=e355]:
              - generic [ref=e356]:
                - img [ref=e358]
                - generic [ref=e361]: Total Income
              - paragraph [ref=e362]: ₹95,000.00
            - generic [ref=e365]:
              - generic [ref=e366]:
                - img [ref=e368]
                - generic [ref=e371]: Total Expense
              - paragraph [ref=e372]: ₹450.00
            - generic [ref=e375]:
              - generic [ref=e376]:
                - img [ref=e378]
                - generic [ref=e381]: Net Flow
              - paragraph [ref=e382]: +₹94,550.00
          - generic [ref=e383]:
            - img [ref=e385]
            - generic [ref=e388]:
              - heading "Tax Tracker" [level=3] [ref=e389]
              - paragraph [ref=e390]: Scan bills to automatically track GST, VAT, and other taxes paid per category.
            - button "Scan Bill" [ref=e391]:
              - img [ref=e392]
              - text: Scan Bill
          - generic [ref=e395]:
            - generic [ref=e396]:
              - img [ref=e397]
              - textbox "Search transactions..." [ref=e400]
            - generic [ref=e401]:
              - button "all" [ref=e402]:
                - generic [ref=e404]: all
              - button "income" [ref=e405]:
                - generic [ref=e406]: income
              - button "expense" [ref=e407]:
                - generic [ref=e408]: expense
          - table [ref=e411]:
            - rowgroup [ref=e412]:
              - row "Details Category Account Amount Actions" [ref=e413]:
                - columnheader "Details" [ref=e414]
                - columnheader "Category" [ref=e415]
                - columnheader "Account" [ref=e416]
                - columnheader "Amount" [ref=e417]
                - columnheader "Actions" [ref=e418]
            - rowgroup [ref=e419]:
              - row "Double Submit Test Item 7/14/2026 Food & Dining HDFC Savings Premium -₹450.00" [ref=e420]:
                - cell "Double Submit Test Item 7/14/2026" [ref=e421]:
                  - generic [ref=e422]:
                    - img [ref=e424]
                    - generic [ref=e432]:
                      - paragraph [ref=e433]: Double Submit Test Item
                      - paragraph [ref=e434]: 7/14/2026
                - cell "Food & Dining" [ref=e435]:
                  - generic [ref=e436]: Food & Dining
                - cell "HDFC Savings Premium" [ref=e437]
                - cell "-₹450.00" [ref=e438]:
                  - generic [ref=e439]: "-₹450.00"
                - cell [ref=e440]:
                  - button [ref=e443]:
                    - img [ref=e444]
              - row "Monthly payout June 2026 7/14/2026 Salary HDFC Savings Premium +₹95,000.00" [ref=e446]:
                - cell "Monthly payout June 2026 7/14/2026" [ref=e447]:
                  - generic [ref=e448]:
                    - img [ref=e450]:
                      - generic [ref=e454]: $
                    - generic [ref=e456]:
                      - paragraph [ref=e457]: Monthly payout June 2026
                      - paragraph [ref=e458]: 7/14/2026
                - cell "Salary" [ref=e459]:
                  - generic [ref=e460]: Salary
                - cell "HDFC Savings Premium" [ref=e461]
                - cell "+₹95,000.00" [ref=e462]:
                  - generic [ref=e463]: +₹95,000.00
                - cell [ref=e464]:
                  - button [ref=e467]:
                    - img [ref=e468]
  - region "Notifications alt+T"
```

# Test source

```ts
  1   | import { Locator, Page, expect } from '@playwright/test';
  2   | import { BasePage } from './BasePage';
  3   | 
  4   | export class TransactionPage extends BasePage {
  5   |   // Selectors
  6   |   readonly addTransactionBtn: Locator;
  7   |   readonly amountInput: Locator;
  8   |   readonly payeeInput: Locator;
  9   |   readonly notesTextarea: Locator;
  10  |   readonly saveTransactionBtn: Locator;
  11  |   readonly backBtn: Locator;
  12  | 
  13  |   constructor(page: Page) {
  14  |     super(page);
  15  |     this.addTransactionBtn = page.getByRole('button', { name: /add transaction|new transaction|\+ transaction/i });
  16  |     this.amountInput = page.locator('[data-testid="transaction-amount-input"]');
  17  |     this.payeeInput = page.locator('[data-testid="transaction-recipient-input"]');
  18  |     this.notesTextarea = page.locator('[data-testid="transaction-notes-textarea"]');
  19  |     this.saveTransactionBtn = page.getByRole('button', { name: /save transaction/i });
  20  |     this.backBtn = page.locator('[data-testid="transaction-back-button"]');
  21  |   }
  22  | 
  23  |   async clickAddTransaction() {
  24  |     // If the floating action button (FAB) or normal add transaction button is visible
  25  |     const floatBtn = this.page.locator('[class*="fab"], [class*="float"]').first();
  26  |     if (await this.addTransactionBtn.first().isVisible()) {
  27  |       await this.addTransactionBtn.first().click();
  28  |     } else if (await floatBtn.isVisible()) {
  29  |       await floatBtn.click();
  30  |     } else {
> 31  |       throw new Error('Could not find Add Transaction button');
      |             ^ Error: Could not find Add Transaction button
  32  |     }
  33  |     await this.wait(800);
  34  |   }
  35  | 
  36  |   async selectType(type: 'expense' | 'income' | 'transfer') {
  37  |     const modalBtn = this.page.locator(`[data-testid="transaction-modal-type-${type}-button"]`).first();
  38  |     const tab = this.page.locator(`[data-testid="transaction-type-${type}-tab"]`).first();
  39  |     if (await modalBtn.isVisible()) {
  40  |       await modalBtn.click();
  41  |     } else {
  42  |       await tab.click();
  43  |     }
  44  |     await this.wait(500);
  45  |   }
  46  | 
  47  |   async selectExpenseMode(mode: 'individual' | 'group' | 'loan') {
  48  |     const btn = this.page.locator(`[data-testid="transaction-expense-mode-${mode}-button"]`);
  49  |     if (await btn.first().isVisible()) {
  50  |       await btn.first().click();
  51  |       await this.wait(500);
  52  |     }
  53  |   }
  54  | 
  55  |   async selectAccount(accountName: string) {
  56  |     // Click SearchableDropdown for Account using explicit test ID or fallback
  57  |     const dropdown = this.page.locator('[data-testid="add-transaction-account"], [data-testid="add-transaction-select-account"], div[role="combobox"]').first();
  58  |     await dropdown.click();
  59  |     await this.wait(400);
  60  | 
  61  |     // Search input target scoped inside the dropdown portal root to prevent global search collision
  62  |     const search = this.page.locator('#dropdown-portal-root input[type="text"]').first();
  63  |     await search.fill(accountName);
  64  |     await this.wait(400);
  65  | 
  66  |     // Select the filtered option scoped inside the dropdown portal
  67  |     const option = this.page.locator('#dropdown-portal-root button[role="option"]').filter({ hasText: new RegExp(accountName, 'i') }).first();
  68  |     await option.evaluate(el => (el as HTMLElement).click());
  69  |     await this.wait(600);
  70  |   }
  71  | 
  72  |   async selectCategory(categoryName: string) {
  73  |     // Categories are rendered in a horizontal grid/carousel
  74  |     // Look for a div or button that has category text or contains the category name.
  75  |     // Since CategoryGrid has pages, let's locate the element. If it's not visible, we can try paging
  76  |     const item = this.page.locator('div').filter({ hasText: new RegExp('^' + categoryName + '$', 'i') }).first();
  77  |     if (await item.isVisible()) {
  78  |       await item.click();
  79  |       await this.wait(300);
  80  |       return;
  81  |     }
  82  | 
  83  |     // Try paging in the CategoryGrid
  84  |     const dots = await this.page.locator('button[aria-label*="Go to page"]').all();
  85  |     for (const dot of dots) {
  86  |       await dot.click();
  87  |       await this.wait(400);
  88  |       if (await item.isVisible()) {
  89  |         await item.click();
  90  |         await this.wait(300);
  91  |         return;
  92  |       }
  93  |     }
  94  | 
  95  |     // Direct click fallback
  96  |     const textLoc = this.page.getByText(categoryName, { exact: false }).first();
  97  |     await textLoc.click({ force: true });
  98  |     await this.wait(300);
  99  |   }
  100 | 
  101 |   async fillAmount(amount: string) {
  102 |     await this.amountInput.fill(amount);
  103 |   }
  104 | 
  105 |   async fillNotes(notes: string) {
  106 |     const descInput = this.page.locator('[data-testid="transaction-description-input"]').first();
  107 |     if (await descInput.isVisible()) {
  108 |       await descInput.fill(notes);
  109 |     }
  110 |     const notesInput = this.page.locator('[data-testid="transaction-notes-textarea"]').first();
  111 |     if (await notesInput.isVisible()) {
  112 |       await notesInput.fill(notes);
  113 |     }
  114 |   }
  115 | 
  116 |   async save() {
  117 |     await this.saveTransactionBtn.first().click();
  118 |     await this.wait(2000);
  119 |   }
  120 | 
  121 |   async createExpense(options: {
  122 |     amount: string;
  123 |     account: string;
  124 |     category: string;
  125 |     notes?: string;
  126 |     mode?: 'individual' | 'group' | 'loan';
  127 |   }) {
  128 |     await this.clickAddTransaction();
  129 |     await this.selectType('expense');
  130 |     if (options.mode) {
  131 |       await this.selectExpenseMode(options.mode);
```