# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 11-user-advisor-scenarios.spec.ts >> Kanaku User Role Scenario-Level Testing Suite >> US-03 to US-10: Complete User Financial Lifecycle Flow
- Location: quality\e2e\11-user-advisor-scenarios.spec.ts:84:3

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
        - generic [ref=e274]:
          - generic [ref=e278]:
            - heading "New Account" [level=1] [ref=e279]
            - paragraph [ref=e280]: Configuration & Setup
          - main [ref=e281]:
            - generic [ref=e282]:
              - generic [ref=e284]:
                - generic [ref=e285]:
                  - generic [ref=e286]: 1. Asset Type
                  - generic [ref=e287]:
                    - button "Bank" [ref=e288]:
                      - img [ref=e289]
                      - generic [ref=e291]: Bank
                    - button "Credit Card" [ref=e292]:
                      - img [ref=e293]
                      - generic [ref=e295]: Credit Card
                    - button "Cash" [ref=e296]:
                      - img [ref=e297]
                      - generic [ref=e300]: Cash
                    - button "Wallet" [ref=e301]:
                      - img [ref=e302]
                      - generic [ref=e305]: Wallet
                - generic [ref=e306]:
                  - generic [ref=e307]:
                    - generic [ref=e308]: 2. Institution / Provider
                    - combobox [ref=e311] [cursor=pointer]:
                      - generic [ref=e312]:
                        - img [ref=e313]
                        - generic [ref=e315]:
                          - generic [ref=e319]: HDFC
                          - generic [ref=e320]: HDFC Bank
                  - generic [ref=e321]:
                    - generic [ref=e322]: 3. Custom Label (Optional)
                    - generic [ref=e323]:
                      - img [ref=e324]
                      - textbox "e.g. My Savings" [ref=e327]: E2E HDFC Savings
                  - generic [ref=e328]:
                    - generic [ref=e329]: 4. Account Category
                    - generic [ref=e330]:
                      - button "Saving" [ref=e331]
                      - button "Current" [ref=e332]
                      - button "FD" [ref=e333]
                      - button "Salary" [ref=e334]
                      - button "Joint" [ref=e335]
              - generic [ref=e336]:
                - generic [ref=e337]:
                  - generic [ref=e338]:
                    - img [ref=e344]
                    - generic [ref=e346]:
                      - generic [ref=e347]:
                        - paragraph [ref=e348]: Account / Institution
                        - paragraph [ref=e349]: E2E HDFC Savings
                      - generic [ref=e350]:
                        - generic [ref=e351]:
                          - paragraph [ref=e352]: Available Balance
                          - generic [ref=e353]:
                            - generic [ref=e354]: INR
                            - generic [ref=e355]: 150,000.00
                        - img [ref=e358]
                  - generic [ref=e360]:
                    - generic [ref=e361]:
                      - generic [ref=e362]: Choose Card Aesthetic
                      - generic [ref=e363]:
                        - button [ref=e364]
                        - button [ref=e365]
                        - button [ref=e366]
                        - button [ref=e367]
                        - button [ref=e368]
                        - button [ref=e369]
                    - generic [ref=e371]:
                      - generic [ref=e373]: Custom Spectrum
                      - slider "Color hue" [ref=e376] [cursor=pointer]: "50"
                - generic [ref=e378]:
                  - generic [ref=e381]:
                    - generic [ref=e382]:
                      - generic [ref=e383]: Setup Initial Capital
                      - heading "Opening Balance" [level=3] [ref=e384]
                    - generic [ref=e385]:
                      - img [ref=e386]
                      - generic [ref=e388]: Starting Amount
                  - generic [ref=e390]:
                    - generic [ref=e391]: INR
                    - spinbutton [ref=e392]: "150000"
                  - generic [ref=e394]:
                    - generic [ref=e395]:
                      - paragraph [ref=e396]: Quick Balance Presets
                      - generic [ref=e397]: Add to balance
                    - generic [ref=e398]:
                      - button "+1,000" [ref=e399]
                      - button "+5,000" [ref=e400]
                      - button "+10,000" [ref=e401]
          - generic [ref=e403]:
            - button "Discard" [ref=e404]:
              - img [ref=e405]
              - text: Discard
            - button "Create Account" [ref=e408]:
              - img [ref=e409]
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