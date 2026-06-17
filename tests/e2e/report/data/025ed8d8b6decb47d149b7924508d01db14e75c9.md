# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-pom-regression.spec.ts >> Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite >> 03. Account Creation & Invalid Numeric Validation
- Location: tests\e2e\09-pom-regression.spec.ts:61:3

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /add account|new account|\+ account/i }).first()

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
          - generic [ref=e277]:
            - heading "New Account" [level=1] [ref=e278]
            - paragraph [ref=e279]: Configuration & Setup
          - main [ref=e280]:
            - generic [ref=e281]:
              - generic [ref=e283]:
                - generic [ref=e284]:
                  - generic [ref=e285]: 1. Asset Type
                  - generic [ref=e286]:
                    - button "Bank" [ref=e287]:
                      - img [ref=e288]
                      - generic [ref=e290]: Bank
                    - button "Credit Card" [ref=e291]:
                      - img [ref=e292]
                      - generic [ref=e294]: Credit Card
                    - button "Cash" [ref=e295]:
                      - img [ref=e296]
                      - generic [ref=e299]: Cash
                    - button "Wallet" [ref=e300]:
                      - img [ref=e301]
                      - generic [ref=e304]: Wallet
                - generic [ref=e305]:
                  - generic [ref=e306]:
                    - generic [ref=e307]: 2. Institution / Provider
                    - combobox [ref=e310] [cursor=pointer]:
                      - generic [ref=e311]:
                        - img [ref=e312]
                        - generic [ref=e314]:
                          - generic [ref=e318]: HDFC
                          - generic [ref=e319]: HDFC Bank
                  - generic [ref=e320]:
                    - generic [ref=e321]: 3. Custom Label (Optional)
                    - generic [ref=e322]:
                      - img [ref=e323]
                      - textbox "e.g. My Savings" [ref=e326]: HDFC Savings Premium
                  - generic [ref=e327]:
                    - generic [ref=e328]: 4. Account Category
                    - generic [ref=e329]:
                      - button "Saving" [ref=e330]
                      - button "Current" [ref=e331]
                      - button "FD" [ref=e332]
                      - button "Salary" [ref=e333]
                      - button "Joint" [ref=e334]
              - generic [ref=e335]:
                - generic [ref=e336]:
                  - generic [ref=e337]:
                    - img [ref=e343]
                    - generic [ref=e345]:
                      - generic [ref=e346]:
                        - paragraph [ref=e347]: Account / Institution
                        - paragraph [ref=e348]: HDFC Savings Premium
                      - generic [ref=e349]:
                        - generic [ref=e350]:
                          - paragraph [ref=e351]: Available Balance
                          - generic [ref=e352]:
                            - generic [ref=e353]: INR
                            - generic [ref=e354]: 120,000.00
                        - img [ref=e357]
                  - generic [ref=e359]:
                    - generic [ref=e360]:
                      - generic [ref=e361]: Choose Card Aesthetic
                      - generic [ref=e362]:
                        - button [ref=e363]
                        - button [ref=e364]
                        - button [ref=e365]
                        - button [ref=e366]
                        - button [ref=e367]
                        - button [ref=e368]
                    - generic [ref=e370]:
                      - generic [ref=e372]: Custom Spectrum
                      - slider "Color hue" [ref=e375] [cursor=pointer]: "50"
                - generic [ref=e377]:
                  - generic [ref=e380]:
                    - generic [ref=e381]:
                      - generic [ref=e382]: Setup Initial Capital
                      - heading "Opening Balance" [level=3] [ref=e383]
                    - generic [ref=e384]:
                      - img [ref=e385]
                      - generic [ref=e387]: Starting Amount
                  - generic [ref=e389]:
                    - generic [ref=e390]: INR
                    - spinbutton [ref=e391]: "120000"
                  - generic [ref=e393]:
                    - generic [ref=e394]:
                      - paragraph [ref=e395]: Quick Balance Presets
                      - generic [ref=e396]: Add to balance
                    - generic [ref=e397]:
                      - button "+1,000" [ref=e398]
                      - button "+5,000" [ref=e399]
                      - button "+10,000" [ref=e400]
          - generic [ref=e402]:
            - button "Discard" [ref=e403]:
              - img [ref=e404]
              - text: Discard
            - button "Create Account" [ref=e407]:
              - img [ref=e408]
              - text: Create Account
  - region "Notifications alt+T"
```

# Test source

```ts
  1   | import { Locator, Page, expect } from '@playwright/test';
  2   | import { BasePage } from './BasePage';
  3   | 
  4   | export class AccountPage extends BasePage {
  5   |   // Selectors
  6   |   readonly addAccountBtn: Locator;
  7   |   readonly balanceInput: Locator;
  8   |   readonly providerInput: Locator;
  9   |   readonly customNameInput: Locator;
  10  |   readonly saveAccountBtn: Locator;
  11  | 
  12  |   constructor(page: Page) {
  13  |     super(page);
  14  |     this.addAccountBtn = page.getByRole('button', { name: /add account|new account|\+ account/i });
  15  |     this.balanceInput = page.locator('[data-testid="account-create-balance-input"]');
  16  |     this.providerInput = page.locator('[data-testid="account-create-provider-input"]');
  17  |     this.customNameInput = page.locator('[data-testid="account-create-name-input"]');
  18  |     this.saveAccountBtn = page.getByRole('button', { name: /create account/i });
  19  |   }
  20  | 
  21  |   async clickAddAccount() {
> 22  |     await this.addAccountBtn.first().click();
      |                                      ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  23  |     await this.wait(800);
  24  |   }
  25  | 
  26  |   async selectType(type: 'bank' | 'card' | 'cash' | 'wallet') {
  27  |     const btn = this.page.locator(`[data-testid="account-create-type-${type}-button"]`);
  28  |     await btn.first().click();
  29  |     await this.wait(500);
  30  |   }
  31  | 
  32  |   async selectSubtype(subtype: string) {
  33  |     const btn = this.page.locator(`[data-testid="account-create-subtype-${subtype}-button"]`);
  34  |     if (await btn.first().isVisible()) {
  35  |       await btn.first().click();
  36  |       await this.wait(500);
  37  |     }
  38  |   }
  39  | 
  40  |   async selectCardNetwork(network: string) {
  41  |     const btn = this.page.locator(`[data-testid="account-create-network-${network}-button"]`);
  42  |     if (await btn.first().isVisible()) {
  43  |       await btn.first().click();
  44  |       await this.wait(500);
  45  |     }
  46  |   }
  47  | 
  48  |   async selectWalletBrand(brand: string) {
  49  |     const btn = this.page.locator(`[data-testid="account-create-wallet-${brand.toLowerCase()}-button"]`);
  50  |     if (await btn.first().isVisible()) {
  51  |       await btn.first().click();
  52  |       await this.wait(500);
  53  |     }
  54  |   }
  55  | 
  56  |   async selectColor(colorId: string) {
  57  |     const btn = this.page.locator(`[data-testid="account-create-color-${colorId}-button"]`);
  58  |     if (await btn.first().isVisible()) {
  59  |       await btn.first().click();
  60  |       await this.wait(300);
  61  |     }
  62  |   }
  63  | 
  64  |   async selectInstitution(name: string) {
  65  |     // Click the SearchableDropdown trigger
  66  |     const dropdownTrigger = this.page.locator('div[role="combobox"]').first();
  67  |     await dropdownTrigger.click();
  68  |     await this.wait(300);
  69  | 
  70  |     // Fill search input inside the portal
  71  |     const searchInput = this.page.locator('#dropdown-portal-root input[type="text"]').first();
  72  |     await searchInput.fill(name);
  73  |     await this.wait(300);
  74  | 
  75  |     // Click the matching option
  76  |     const option = this.page.locator('#dropdown-portal-root button[role="option"]').filter({ hasText: new RegExp(name, 'i') }).first();
  77  |     await option.click();
  78  |     await this.wait(500);
  79  |   }
  80  | 
  81  |   async createAccount(options: {
  82  |     type: 'bank' | 'card' | 'cash' | 'wallet';
  83  |     balance: string;
  84  |     name?: string;
  85  |     institution?: string;
  86  |     subtypeOrNetworkOrBrand?: string;
  87  |     color?: string;
  88  |   }) {
  89  |     await this.clickAddAccount();
  90  |     await this.selectType(options.type);
  91  |     
  92  |     if (options.type === 'bank' || options.type === 'card') {
  93  |       if (options.institution) {
  94  |         await this.selectInstitution(options.institution);
  95  |       }
  96  |       if (options.subtypeOrNetworkOrBrand) {
  97  |         if (options.type === 'bank') {
  98  |           await this.selectSubtype(options.subtypeOrNetworkOrBrand);
  99  |         } else {
  100 |           await this.selectCardNetwork(options.subtypeOrNetworkOrBrand);
  101 |         }
  102 |       }
  103 |     } else if (options.type === 'wallet') {
  104 |       if (options.subtypeOrNetworkOrBrand) {
  105 |         await this.selectWalletBrand(options.subtypeOrNetworkOrBrand);
  106 |       }
  107 |     }
  108 | 
  109 |     if (options.name) {
  110 |       await this.customNameInput.fill(options.name);
  111 |     }
  112 | 
  113 |     if (options.color) {
  114 |       await this.selectColor(options.color);
  115 |     }
  116 | 
  117 |     await this.balanceInput.fill(options.balance);
  118 |     
  119 |     // Save account using FloatingSaveBar button
  120 |     await this.saveAccountBtn.first().click();
  121 |     await this.wait(2000);
  122 |   }
```