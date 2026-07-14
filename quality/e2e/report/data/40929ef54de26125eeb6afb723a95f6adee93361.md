# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-pom-regression.spec.ts >> Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite >> 06. Todo List Planning & Team Split Share
- Location: quality\e2e\09-pom-regression.spec.ts:216:3

# Error details

```
Error: Failed to navigate to page: todo-lists
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic:
      - textbox: arjun.test@kanaku.app
      - textbox "PIN entry" [active]
    - generic [ref=e4]:
      - generic [ref=e5]:
        - img [ref=e7]
        - heading "KANAKU" [level=1] [ref=e13]
        - paragraph [ref=e14]: Enter your PIN to access KANAKU
      - generic [ref=e15]:
        - generic [ref=e16]:
          - paragraph [ref=e17]: Secure Unlock
          - heading "Enter your PIN" [level=2] [ref=e18]
        - generic [ref=e27]:
          - button "SHOW PIN" [ref=e28]:
            - img [ref=e29]
            - text: SHOW PIN
          - paragraph [ref=e33]:
            - img [ref=e34]
            - text: Failed to verify PIN
        - generic [ref=e36]:
          - button "1" [ref=e37]
          - button "2" [ref=e38]
          - button "3" [ref=e39]
          - button "4" [ref=e40]
          - button "5" [ref=e41]
          - button "6" [ref=e42]
          - button "7" [ref=e43]
          - button "8" [ref=e44]
          - button "9" [ref=e45]
          - button "Forgot PIN" [ref=e46]:
            - img [ref=e47]
          - button "0" [ref=e50]
          - button "⌫" [ref=e51]
        - button "Use a different account" [ref=e52]:
          - img [ref=e53]
          - text: Use a different account
        - generic [ref=e56]:
          - img [ref=e57]
          - generic [ref=e60]:
            - paragraph [ref=e61]: Secure Encryption
            - paragraph [ref=e62]: Your financial data stays encrypted on this device. Only PIN verification metadata is stored securely.
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
     |             ^ Error: Failed to navigate to page: todo-lists
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