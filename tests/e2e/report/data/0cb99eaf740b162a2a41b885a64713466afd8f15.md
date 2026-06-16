# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-refresh-redirect.spec.ts >> P1 Bug: Page Refresh State Persistence >> Scenario 1: Dashboard refresh should stay on Dashboard
- Location: tests\e2e\test-refresh-redirect.spec.ts:17:3

# Error details

```
Error: Login API failed for arjun.test@finora.app: {"success":false,"error":"Incorrect email or password. Please check your credentials and try again.","code":"INVALID_CREDENTIALS"}
```

# Test source

```ts
  1   | import { Page, expect, Locator } from '@playwright/test';
  2   | import * as path from 'path';
  3   | import * as fs from 'fs';
  4   | 
  5   | export async function isElementVisible(locator: Locator, timeout = 5000): Promise<boolean> {
  6   |   return locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  7   | }
  8   | 
  9   | export const BASE = 'http://localhost:9002';
  10  | export const API  = 'http://localhost:3000';
  11  | 
  12  | export const USERS = {
  13  |   U1: { firstName: 'Arjun',  lastName: 'Sharma',  email: 'arjun.test@finora.app',  mobile: '9000000001', password: 'TestFinora@2026', persona: 'Debt Manager' },
  14  |   U2: { firstName: 'Priya',  lastName: 'Mehta',   email: 'priya.test@finora.app',   mobile: '9000000002', password: 'TestFinora@2026', persona: 'Group Splitter' },
  15  |   U3: { firstName: 'Rohan',  lastName: 'Verma',   email: 'rohan.test@finora.app',   mobile: '9000000003', password: 'TestFinora@2026', persona: 'Investor' },
  16  |   U4: { firstName: 'Sneha',  lastName: 'Kapoor',  email: 'sneha.test@finora.app',   mobile: '9000000004', password: 'TestFinora@2026', persona: 'Goal Setter' },
  17  |   U5: { firstName: 'Dev',    lastName: 'Nair',    email: 'dev.test@finora.app',     mobile: '9000000005', password: 'TestFinora@2026', persona: 'Portfolio Builder' },
  18  |   U6: { firstName: 'Isha',   lastName: 'Patel',   email: 'isha.test@finora.app',    mobile: '9000000006', password: 'TestFinora@2026', persona: 'Planner' },
  19  |   U7: { firstName: 'Power',  lastName: 'User',    email: 'admin.test@finora.app',   mobile: '9000000007', password: 'TestFinora@2026', persona: 'Power User' },
  20  | };
  21  | 
  22  | export async function screenshot(page: Page, name: string) {
  23  |   const dir = path.join('tests', 'e2e', 'screenshots');
  24  |   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  25  |   await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false, timeout: 8000 }).catch(() => null);
  26  | }
  27  | 
  28  | /** Navigate to the app root and wait for landing page */
  29  | export async function gotoApp(page: Page) {
  30  |   await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  31  |   await page.waitForSelector('h1, button, nav', { timeout: 30000 });
  32  | }
  33  | 
  34  | /**
  35  |  * Login via API + inject tokens directly into localStorage.
  36  |  * Mimics exactly what the frontend SignInForm does after a successful API login,
  37  |  * bypassing the marketing landing page navigation flow.
  38  |  */
  39  | export async function loginUser(page: Page, user: typeof USERS.U1) {
  40  |   // 1. Get tokens from backend API (retry up to 3x for transient ECONNREFUSED on startup)
  41  |   let resp: Awaited<ReturnType<typeof page.request.post>> | null = null;
  42  |   for (let attempt = 0; attempt < 3; attempt++) {
  43  |     try {
  44  |       resp = await page.request.post(`${API}/api/v1/auth/login`, {
  45  |         data: { email: user.email, password: user.password },
  46  |       });
  47  |       break;
  48  |     } catch (e: any) {
  49  |       if (attempt === 2) throw e;
  50  |       await page.waitForTimeout(3000);
  51  |     }
  52  |   }
  53  |   const json = await resp!.json();
  54  |   const { accessToken, refreshToken, user: userObj } = json.data ?? {};
  55  | 
  56  |   if (!accessToken) {
> 57  |     throw new Error(`Login API failed for ${user.email}: ${JSON.stringify(json)}`);
      |           ^ Error: Login API failed for arjun.test@finora.app: {"success":false,"error":"Incorrect email or password. Please check your credentials and try again.","code":"INVALID_CREDENTIALS"}
  58  |   }
  59  | 
  60  |   // 1b. Pre-create a default cash account so AddTransaction/group expense flows work
  61  |   //     Uses a deterministic ID so repeated runs don't create duplicates.
  62  |   await page.request.post(`${API}/api/v1/accounts`, {
  63  |     headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  64  |     data: {
  65  |       name: 'Savings Account',
  66  |       type: 'bank',
  67  |       balance: 50000,
  68  |       currency: 'INR',
  69  |       clientRequestId: `test-acct-${user.email}`,
  70  |     },
  71  |   }).catch(() => {}); // ignore if already exists
  72  | 
  73  | 
  74  |   // 2. Open the app and wipe localStorage / IndexedDB to start with a clean slate
  75  |   await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  76  |   await page.evaluate(({ at, rt, email, userObj, verifiedAt }) => {
  77  |     localStorage.clear();
  78  |     sessionStorage.clear();
  79  |     localStorage.setItem('auth_token', at);
  80  |     localStorage.setItem('refresh_token', rt);
  81  |     localStorage.setItem('user_email', email);
  82  |     localStorage.setItem('onboarding_completed', 'true');
  83  |     localStorage.setItem('onboarding_slides_viewed', 'true');
  84  |     localStorage.setItem('user_data', JSON.stringify(userObj));
  85  |     localStorage.setItem('pin_setup_completed', 'true');
  86  |     localStorage.setItem('pin_created', 'true');
  87  |     localStorage.setItem('pin_verified', 'true');
  88  |     localStorage.setItem('pin_verified_at', verifiedAt);
  89  |     return new Promise<void>((resolve) => {
  90  |       const req = indexedDB.open('KANAKUDB');
  91  |       req.onsuccess = (event) => {
  92  |         const db = (event.target as any).result;
  93  |         if (!db.objectStoreNames || db.objectStoreNames.length === 0) {
  94  |           db.close();
  95  |           resolve();
  96  |           return;
  97  |         }
  98  |         try {
  99  |           const tx = db.transaction(db.objectStoreNames, 'readwrite');
  100 |           tx.oncomplete = () => {
  101 |             db.close();
  102 |             resolve();
  103 |           };
  104 |           tx.onerror = () => {
  105 |             db.close();
  106 |             resolve();
  107 |           };
  108 |           for (const storeName of db.objectStoreNames) {
  109 |             tx.objectStore(storeName).clear();
  110 |           }
  111 |         } catch (e) {
  112 |           db.close();
  113 |           resolve();
  114 |         }
  115 |       };
  116 |       req.onerror = () => resolve();
  117 |       req.onblocked = () => resolve();
  118 |       setTimeout(resolve, 2000); // safety fallback
  119 |     });
  120 |   }, { at: accessToken, rt: refreshToken, email: user.email, userObj, verifiedAt: new Date().toISOString() }).catch(() => null);
  121 | 
  122 |   // 3. Reload so React EnhancedAuthContext picks up the stored tokens.
  123 |   await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
  124 |   await page.waitForTimeout(2000);
  125 | 
  126 |   // 4. Wait for "Syncing your account..." loading screen to disappear
  127 |   const syncScreen = page.getByText(/syncing your account/i).first();
  128 |   if (await isElementVisible(syncScreen, 2000)) {
  129 |     await syncScreen.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => null);
  130 |     await page.waitForTimeout(1000);
  131 |   }
  132 | 
  133 |   await screenshot(page, `login_${user.firstName}_after`);
  134 |   return page.url();
  135 | }
  136 | 
  137 | /** Register a new user through the actual UI (signup form) */
  138 | export async function registerUser(page: Page, user: typeof USERS.U1) {
  139 |   await gotoApp(page);
  140 | 
  141 |   // Click "Get Started" on the marketing landing page
  142 |   const getStarted = page.getByRole('button', { name: /get started/i }).first();
  143 |   if (await isElementVisible(getStarted, 5000)) {
  144 |     await getStarted.click();
  145 |     await page.waitForTimeout(800);
  146 |   }
  147 | 
  148 |   // "Get Started" navigates to AuthFlow 'welcome' step (Create Account / Sign In / etc.).
  149 |   // Click "Create Account" to reach the actual signup form.
  150 |   const createAccountCTA = page.getByRole('button', { name: /^create account$/i }).first();
  151 |   if (await isElementVisible(createAccountCTA, 3000)) {
  152 |     await createAccountCTA.click();
  153 |     await page.waitForTimeout(800);
  154 |   }
  155 | 
  156 |   const firstNameInput = page.locator('input[name="firstName"], input#firstName').first();
  157 |   const formVisible = await firstNameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
```