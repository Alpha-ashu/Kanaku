# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 11-user-advisor-scenarios.spec.ts >> Kanaku Advisor Role Scenario-Level Testing Suite >> AD-04 to AD-09: Advisor Workspace Operations & Profile Customizations
- Location: quality\e2e\11-user-advisor-scenarios.spec.ts:294:3

# Error details

```
Error: Failed to navigate to page: advisor-panel
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
            - button "Accounts" [ref=e17] [cursor=pointer]:
              - img [ref=e18]
              - img [ref=e22]
          - listitem [ref=e29]:
            - button "Transactions" [ref=e30] [cursor=pointer]:
              - img [ref=e31]
              - img [ref=e35]
          - listitem [ref=e42]:
            - button "Calendar" [ref=e43] [cursor=pointer]:
              - img [ref=e44]
              - img [ref=e47]
          - listitem [ref=e54]:
            - button "Investments" [ref=e55] [cursor=pointer]:
              - img [ref=e56]
              - img [ref=e60]
          - listitem [ref=e67]:
            - button "Loans" [ref=e68] [cursor=pointer]:
              - img [ref=e69]
              - img [ref=e76]
          - listitem [ref=e83]:
            - button "Goals" [ref=e84] [cursor=pointer]:
              - img [ref=e85]
              - img [ref=e90]
          - listitem [ref=e97]:
            - button "Group Expenses" [ref=e98] [cursor=pointer]:
              - img [ref=e99]
              - img [ref=e105]
          - listitem [ref=e112]:
            - button "Reports" [ref=e113] [cursor=pointer]:
              - img [ref=e114]
              - img [ref=e117]
          - listitem [ref=e124]:
            - button "Todo Lists" [ref=e125] [cursor=pointer]:
              - img [ref=e126]
              - img [ref=e130]
          - listitem [ref=e137]:
            - button "Book Advisor" [ref=e138] [cursor=pointer]:
              - img [ref=e139]
              - img [ref=e145]
          - listitem [ref=e152]:
            - button "Voice Logging" [ref=e153] [cursor=pointer]:
              - img [ref=e154]
              - img [ref=e158]
          - listitem [ref=e165]:
            - button "Receipt Scanner" [ref=e166] [cursor=pointer]:
              - img [ref=e167]
              - img [ref=e173]
          - listitem [ref=e180]:
            - button "Notifications" [ref=e181] [cursor=pointer]:
              - img [ref=e182]
              - img [ref=e186]
          - listitem [ref=e193]:
            - button "Recurring" [ref=e194] [cursor=pointer]:
              - img [ref=e195]
              - img [ref=e201]
          - listitem [ref=e208]:
            - button "Budget Alerts" [ref=e209] [cursor=pointer]:
              - img [ref=e210]
              - img [ref=e216]
          - listitem [ref=e223]:
            - button "Clients" [ref=e224] [cursor=pointer]:
              - img [ref=e225]
              - img [ref=e230]
          - listitem [ref=e237]:
            - button "Settings" [ref=e238] [cursor=pointer]:
              - img [ref=e240]
              - img [ref=e244]
          - listitem [ref=e251]:
            - button "Admin Console" [ref=e252] [cursor=pointer]:
              - img [ref=e253]
              - img [ref=e256]
          - listitem [ref=e263]:
            - button "Feature Panel" [ref=e264] [cursor=pointer]:
              - img [ref=e265]
              - img [ref=e269]
          - listitem [ref=e276]:
            - button "AI Management" [ref=e277] [cursor=pointer]:
              - img [ref=e278]
              - img [ref=e289]
          - listitem [ref=e296]:
            - button "Advisor Verification" [ref=e297] [cursor=pointer]:
              - img [ref=e298]
              - img [ref=e302]
    - generic [ref=e310]:
      - banner [ref=e311]:
        - generic [ref=e312]:
          - generic [ref=e314]:
            - img [ref=e315]
            - textbox "Search transactions, assets..." [ref=e318]
            - generic: ⌘K
          - generic [ref=e319]:
            - generic "Offline sync disabled (schema incompatible)." [ref=e321]:
              - img [ref=e322]
            - button [ref=e324]:
              - img [ref=e325]
            - button "Profile" [ref=e328]:
              - img "Profile" [ref=e329]
      - main [ref=e330]:
        - generic [ref=e332]:
          - heading "Settings" [level=1] [ref=e336]
          - generic [ref=e337]:
            - generic [ref=e338]:
              - generic [ref=e339]:
                - heading "Preferences" [level=3] [ref=e341]
                - generic [ref=e342]:
                  - generic [ref=e344]:
                    - generic [ref=e345]:
                      - img [ref=e347]
                      - heading "Language" [level=4] [ref=e350]
                    - combobox "Select language" [ref=e351]:
                      - option "English" [selected]
                      - option "Español (Spanish)"
                      - option "Français (French)"
                      - option "Deutsch (German)"
                      - option "Italiano (Italian)"
                      - option "Português (Portuguese)"
                      - option "日本語 (Japanese)"
                      - option "中文 (Chinese)"
                      - option "हिंदी (Hindi)"
                      - option "العربية (Arabic)"
                  - generic [ref=e353]:
                    - generic [ref=e354]:
                      - img [ref=e356]
                      - heading "Currency" [level=4] [ref=e361]
                    - combobox "Select currency" [ref=e362]:
                      - option "USD ($)"
                      - option "INR (₹)" [selected]
                      - option "EUR (€)"
                      - option "GBP (£)"
                      - option "JPY (¥)"
                      - option "AUD (A$)"
                      - option "CAD (C$)"
                      - option "SGD (S$)"
                      - option "CHF (CHF)"
              - generic [ref=e365]:
                - generic [ref=e366]:
                  - heading "SMS Transaction Detection" [level=3] [ref=e367]
                  - paragraph [ref=e368]: Auto-detect bank SMS to track expenses
                - button "Turn On" [ref=e369]
            - generic [ref=e370]:
              - generic [ref=e371]:
                - heading "Security" [level=3] [ref=e373]
                - generic [ref=e376]:
                  - generic [ref=e377]:
                    - img [ref=e379]
                    - generic [ref=e382]:
                      - heading "Auto-Lock" [level=4] [ref=e383]
                      - paragraph [ref=e384]: Require your PIN after a period of inactivity
                  - combobox "Select auto-lock timeout" [ref=e385]:
                    - option "Never"
                    - option "1 minute"
                    - option "5 minutes" [selected]
                    - option "10 minutes"
                    - option "15 minutes"
                    - option "30 minutes"
              - generic [ref=e386]:
                - heading "Legal" [level=3] [ref=e388]
                - generic [ref=e389]:
                  - generic [ref=e391]:
                    - generic [ref=e392]:
                      - img [ref=e394]
                      - heading "Privacy Policy" [level=4] [ref=e397]
                    - button "View" [ref=e398]:
                      - text: View
                      - img [ref=e399]
                  - generic [ref=e404]:
                    - generic [ref=e405]:
                      - img [ref=e407]
                      - heading "Terms & Conditions" [level=4] [ref=e410]
                    - button "View" [ref=e411]:
                      - text: View
                      - img [ref=e412]
            - generic [ref=e417]:
              - heading "Notification Settings" [level=3] [ref=e419]
              - generic [ref=e420]:
                - generic [ref=e422]:
                  - generic [ref=e423]:
                    - img [ref=e425]
                    - heading "Transaction Alerts" [level=4] [ref=e428]
                  - button "Toggle Transaction Alerts" [ref=e429] [cursor=pointer]
                - generic [ref=e431]:
                  - generic [ref=e432]:
                    - img [ref=e434]
                    - heading "Budget Alerts" [level=4] [ref=e437]
                  - button "Toggle Budget Alerts" [ref=e438] [cursor=pointer]
                - generic [ref=e440]:
                  - generic [ref=e441]:
                    - img [ref=e443]
                    - heading "Loan & EMI Reminders" [level=4] [ref=e446]
                  - button "Toggle Loan & EMI Reminders" [ref=e447] [cursor=pointer]
                - generic [ref=e449]:
                  - generic [ref=e450]:
                    - img [ref=e452]
                    - heading "Group Expense Updates" [level=4] [ref=e455]
                  - button "Toggle Group Expense Updates" [ref=e456] [cursor=pointer]
                - generic [ref=e458]:
                  - generic [ref=e459]:
                    - img [ref=e461]
                    - heading "Goal Progress Alerts" [level=4] [ref=e464]
                  - button "Toggle Goal Progress Alerts" [ref=e465] [cursor=pointer]
                - generic [ref=e467]:
                  - generic [ref=e468]:
                    - img [ref=e470]
                    - heading "App Updates & Announcements" [level=4] [ref=e473]
                  - button "Toggle App Updates & Announcements" [ref=e474] [cursor=pointer]
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { Page, Locator, expect } from '@playwright/test';
  2  | import * as path from 'path';
  3  | import * as fs from 'fs';
  4  | import { isElementVisible, clickNav, waitForToast, screenshot } from '../helpers';
  5  | 
  6  | export class BasePage {
  7  |   readonly page: Page;
  8  | 
  9  |   constructor(page: Page) {
  10 |     this.page = page;
  11 |   }
  12 | 
  13 |   async navigateTo(label: string) {
  14 |     const success = await clickNav(this.page, label);
  15 |     if (!success) {
> 16 |       throw new Error(`Failed to navigate to page: ${label}`);
     |             ^ Error: Failed to navigate to page: advisor-panel
  17 |     }
  18 |   }
  19 | 
  20 |   async waitForToast(text?: string) {
  21 |     await waitForToast(this.page, text);
  22 |   }
  23 | 
  24 |   async screenshot(name: string) {
  25 |     await screenshot(this.page, name);
  26 |   }
  27 | 
  28 |   async wait(ms: number) {
  29 |     await this.page.waitForTimeout(ms);
  30 |   }
  31 | 
  32 |   async isVisible(locator: Locator, timeout = 5000): Promise<boolean> {
  33 |     return isElementVisible(locator, timeout);
  34 |   }
  35 | }
  36 | 
```