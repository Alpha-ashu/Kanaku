# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-pom-regression.spec.ts >> Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite >> 07. Advisor Registration, Manager Compliance Review, and Approval
- Location: quality\e2e\09-pom-regression.spec.ts:239:3

# Error details

```
Error: Failed to navigate to page: book-advisor
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic:
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
     |             ^ Error: Failed to navigate to page: book-advisor
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