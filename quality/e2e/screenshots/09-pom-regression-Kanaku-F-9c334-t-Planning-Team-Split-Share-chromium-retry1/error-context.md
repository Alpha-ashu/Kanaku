# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-pom-regression.spec.ts >> Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite >> 06. Todo List Planning & Team Split Share
- Location: quality\e2e\09-pom-regression.spec.ts:216:3

# Error details

```
Error: Login challenge failed for arjun.test@kanaku.app: {"success":false,"error":"Our servers are temporarily unavailable. Please try again in a moment.","code":"DATABASE_UNAVAILABLE","requestId":"dac6735d-81f1-4e3c-9066-f0ad8239e8ec"}
```

# Test source

```ts
  1   | import { Page, expect, Locator } from '@playwright/test';
  2   | import * as path from 'path';
  3   | import * as fs from 'fs';
  4   | import { createHash } from 'crypto';
  5   | 
  6   | export async function isElementVisible(locator: Locator, timeout = 5000): Promise<boolean> {
  7   |   return locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  8   | }
  9   | 
  10  | export const BASE = 'http://localhost:9002';
  11  | export const API = 'http://localhost:3000';
  12  | 
  13  | const testPassword = process.env.SEED_TEST_PASSWORD || 'example-Test-password-123!';
  14  | 
  15  | export const USERS = {
  16  |   U1: { firstName: 'Arjun', lastName: 'Sharma', email: 'arjun.test@kanaku.app', mobile: '9000000001', password: testPassword, persona: 'Debt Manager' },
  17  |   U2: { firstName: 'Priya', lastName: 'Mehta', email: 'priya.test@kanaku.app', mobile: '9000000002', password: testPassword, persona: 'Group Splitter' },
  18  |   U3: { firstName: 'Rohan', lastName: 'Verma', email: 'rohan.test@kanaku.app', mobile: '9000000003', password: testPassword, persona: 'Investor' },
  19  |   U4: { firstName: 'Sneha', lastName: 'Kapoor', email: 'sneha.test@kanaku.app', mobile: '9000000004', password: testPassword, persona: 'Goal Setter' },
  20  |   U5: { firstName: 'Dev', lastName: 'Nair', email: 'dev.test@kanaku.app', mobile: '9000000005', password: testPassword, persona: 'Portfolio Builder' },
  21  |   U6: { firstName: 'Isha', lastName: 'Patel', email: 'isha.test@kanaku.app', mobile: '9000000006', password: testPassword, persona: 'Planner' },
  22  |   U7: { firstName: 'Power', lastName: 'User', email: 'admin.test@kanaku.app', mobile: '9000000007', password: testPassword, persona: 'Power User' },
  23  | };
  24  | 
  25  | export async function screenshot(page: Page, name: string) {
  26  |   const dir = path.join('quality', 'e2e', 'screenshots');
  27  |   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  28  |   await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false, timeout: 8000 }).catch(() => null);
  29  | }
  30  | 
  31  | /** Navigate to the app root and wait for landing page */
  32  | export async function gotoApp(page: Page) {
  33  |   await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  34  |   await page.waitForSelector('h1, button, nav', { timeout: 30000 });
  35  | }
  36  | 
  37  | /**
  38  |  * Login via API + inject tokens directly into localStorage.
  39  |  * Mimics exactly what the frontend SignInForm does after a successful API login,
  40  |  * bypassing the marketing landing page navigation flow.
  41  |  */
  42  | export async function loginUser(page: Page, user: typeof USERS.U1) {
  43  |   // ── Step 1: SHA-256 hash the password (matches frontend api.ts behaviour) ──
  44  |   // Use Node.js crypto so this works before any page navigation.
  45  |   const sha256Hex = createHash('sha256').update(user.password, 'utf8').digest('hex');
  46  | 
  47  |   // ── Step 2: Challenge request (mirrors frontend /auth/login/challenge flow) ──
  48  |   const tryChallenge = async (password: string, encoding: string) => {
  49  |     for (let attempt = 0; attempt < 3; attempt++) {
  50  |       try {
  51  |         return await page.request.post(`${API}/api/v1/auth/login/challenge`, {
  52  |           data: { email: user.email, password },
  53  |           headers: { 'x-pw-encoding': encoding, 'Content-Type': 'application/json' },
  54  |         });
  55  |       } catch (e: any) {
  56  |         if (attempt === 2) throw e;
  57  |         await page.waitForTimeout(3000);
  58  |       }
  59  |     }
  60  |   };
  61  | 
  62  |   let challengeResp = await tryChallenge(sha256Hex, 'sha256');
  63  |   let challengeJson = await challengeResp!.json();
  64  | 
  65  |   // Fallback: if SHA-256 challenge fails, retry with plain password (legacy accounts)
  66  |   if (!challengeJson?.success || !challengeJson?.data?.code) {
  67  |     challengeResp = await tryChallenge(user.password, 'plain');
  68  |     challengeJson = await challengeResp!.json();
  69  |   }
  70  | 
  71  |   if (!challengeJson?.success || !challengeJson?.data?.code) {
> 72  |     throw new Error(
      |           ^ Error: Login challenge failed for arjun.test@kanaku.app: {"success":false,"error":"Our servers are temporarily unavailable. Please try again in a moment.","code":"DATABASE_UNAVAILABLE","requestId":"dac6735d-81f1-4e3c-9066-f0ad8239e8ec"}
  73  |       `Login challenge failed for ${user.email}: ${JSON.stringify(challengeJson)}`
  74  |     );
  75  |   }
  76  | 
  77  |   // ── Step 3: Exchange challenge code for tokens ──
  78  |   const tokenResp = await page.request.post(`${API}/api/v1/auth/login`, {
  79  |     data: { email: user.email, challengeCode: challengeJson.data.code },
  80  |     headers: { 'Content-Type': 'application/json' },
  81  |   });
  82  |   const json = await tokenResp.json();
  83  |   const { accessToken, refreshToken, user: userObj } = json.data ?? {};
  84  | 
  85  |   if (!accessToken) {
  86  |     throw new Error(`Token exchange failed for ${user.email}: ${JSON.stringify(json)}`);
  87  |   }
  88  | 
  89  |   // 1b. Pre-create a default cash account so AddTransaction/group expense flows work
  90  |   //     Uses a deterministic ID so repeated runs don't create duplicates.
  91  |   await page.request.post(`${API}/api/v1/accounts`, {
  92  |     headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  93  |     data: {
  94  |       name: 'Savings Account',
  95  |       type: 'bank',
  96  |       balance: 50000,
  97  |       currency: 'INR',
  98  |       clientRequestId: `test-acct-${user.email}`,
  99  |     },
  100 |   }).catch(() => { }); // ignore if already exists
  101 | 
  102 | 
  103 |   // 2. Open the app and wipe localStorage / IndexedDB to start with a clean slate
  104 |   await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  105 |   await page.evaluate(({ at, rt, email, userObj, verifiedAt }) => {
  106 |     localStorage.clear();
  107 |     sessionStorage.clear();
  108 |     localStorage.setItem('auth_token', at);
  109 |     localStorage.setItem('refresh_token', rt);
  110 |     localStorage.setItem('user_email', email);
  111 |     localStorage.setItem('onboarding_completed', 'true');
  112 |     localStorage.setItem('onboarding_slides_viewed', 'true');
  113 |     localStorage.setItem('user_data', JSON.stringify(userObj));
  114 |     localStorage.setItem('pin_setup_completed', 'true');
  115 |     localStorage.setItem('pin_created', 'true');
  116 |     localStorage.setItem('pin_verified', 'true');
  117 |     localStorage.setItem('pin_verified_at', verifiedAt);
  118 |     return new Promise<void>((resolve) => {
  119 |       const req = indexedDB.open('KANAKUDB');
  120 |       req.onsuccess = (event) => {
  121 |         const db = (event.target as any).result;
  122 |         if (!db.objectStoreNames || db.objectStoreNames.length === 0) {
  123 |           db.close();
  124 |           resolve();
  125 |           return;
  126 |         }
  127 |         try {
  128 |           const tx = db.transaction(db.objectStoreNames, 'readwrite');
  129 |           tx.oncomplete = () => {
  130 |             db.close();
  131 |             resolve();
  132 |           };
  133 |           tx.onerror = () => {
  134 |             db.close();
  135 |             resolve();
  136 |           };
  137 |           for (const storeName of db.objectStoreNames) {
  138 |             tx.objectStore(storeName).clear();
  139 |           }
  140 |         } catch (e) {
  141 |           db.close();
  142 |           resolve();
  143 |         }
  144 |       };
  145 |       req.onerror = () => resolve();
  146 |       req.onblocked = () => resolve();
  147 |       setTimeout(resolve, 2000); // safety fallback
  148 |     });
  149 |   }, { at: accessToken, rt: refreshToken, email: user.email, userObj, verifiedAt: new Date().toISOString() }).catch(() => null);
  150 | 
  151 |   // 3. Reload so React EnhancedAuthContext picks up the stored tokens.
  152 |   await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
  153 |   await page.waitForTimeout(2000);
  154 | 
  155 |   // 4. Wait for "Syncing your account..." loading screen to disappear
  156 |   const syncScreen = page.getByText(/syncing your account/i).first();
  157 |   if (await isElementVisible(syncScreen, 2000)) {
  158 |     await syncScreen.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => null);
  159 |     await page.waitForTimeout(1000);
  160 |   }
  161 | 
  162 |   await screenshot(page, `login_${user.firstName}_after`);
  163 |   return page.url();
  164 | }
  165 | 
  166 | /** Register a new user through the actual UI (signup form) */
  167 | export async function registerUser(page: Page, user: typeof USERS.U1) {
  168 |   await gotoApp(page);
  169 | 
  170 |   // Click "Get Started" on the marketing landing page
  171 |   const getStarted = page.getByRole('button', { name: /get started/i }).first();
  172 |   if (await isElementVisible(getStarted, 5000)) {
```