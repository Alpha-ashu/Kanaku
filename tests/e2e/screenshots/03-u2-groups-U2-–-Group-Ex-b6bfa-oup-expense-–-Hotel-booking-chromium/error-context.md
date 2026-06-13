# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 03-u2-groups.spec.ts >> U2 – Group Expense Splitter (Priya) >> U2-05: Add group expense – Hotel booking
- Location: tests\e2e\03-u2-groups.spec.ts:147:3

# Error details

```
TimeoutError: page.reload: Timeout 35000ms exceeded.
Call log:
  - waiting for navigation until "load"

```

# Test source

```ts
  1   | import { Page, expect } from '@playwright/test';
  2   | import * as path from 'path';
  3   | import * as fs from 'fs';
  4   | 
  5   | export const BASE = 'http://localhost:9002';
  6   | export const API  = 'http://localhost:3000';
  7   | 
  8   | export const USERS = {
  9   |   U1: { firstName: 'Arjun',  lastName: 'Sharma',  email: 'arjun.test@finora.app',  mobile: '9000000001', password: 'TestFinora@2026', persona: 'Debt Manager' },
  10  |   U2: { firstName: 'Priya',  lastName: 'Mehta',   email: 'priya.test@finora.app',   mobile: '9000000002', password: 'TestFinora@2026', persona: 'Group Splitter' },
  11  |   U3: { firstName: 'Rohan',  lastName: 'Verma',   email: 'rohan.test@finora.app',   mobile: '9000000003', password: 'TestFinora@2026', persona: 'Investor' },
  12  |   U4: { firstName: 'Sneha',  lastName: 'Kapoor',  email: 'sneha.test@finora.app',   mobile: '9000000004', password: 'TestFinora@2026', persona: 'Goal Setter' },
  13  |   U5: { firstName: 'Dev',    lastName: 'Nair',    email: 'dev.test@finora.app',     mobile: '9000000005', password: 'TestFinora@2026', persona: 'Portfolio Builder' },
  14  |   U6: { firstName: 'Isha',   lastName: 'Patel',   email: 'isha.test@finora.app',    mobile: '9000000006', password: 'TestFinora@2026', persona: 'Planner' },
  15  |   U7: { firstName: 'Power',  lastName: 'User',    email: 'admin.test@finora.app',   mobile: '9000000007', password: 'TestFinora@2026', persona: 'Power User' },
  16  | };
  17  | 
  18  | export async function screenshot(page: Page, name: string) {
  19  |   const dir = path.join('tests', 'e2e', 'screenshots');
  20  |   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  21  |   await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
  22  | }
  23  | 
  24  | /** Navigate to the app root and wait for landing page */
  25  | export async function gotoApp(page: Page) {
  26  |   await page.goto(BASE, { waitUntil: 'networkidle' });
  27  |   await page.waitForSelector('h1, button, nav', { timeout: 15000 });
  28  | }
  29  | 
  30  | /**
  31  |  * Login via API + inject tokens directly into localStorage.
  32  |  * Mimics exactly what the frontend SignInForm does after a successful API login,
  33  |  * bypassing the marketing landing page navigation flow.
  34  |  */
  35  | export async function loginUser(page: Page, user: typeof USERS.U1) {
  36  |   // 1. Get tokens from backend API
  37  |   const resp = await page.request.post(`${API}/api/v1/auth/login`, {
  38  |     data: { email: user.email, password: user.password },
  39  |   });
  40  |   const json = await resp.json();
  41  |   const { accessToken, refreshToken } = json.data ?? {};
  42  | 
  43  |   if (!accessToken) {
  44  |     throw new Error(`Login API failed for ${user.email}: ${JSON.stringify(json)}`);
  45  |   }
  46  | 
  47  |   // 1b. Pre-create a default cash account so AddTransaction/group expense flows work
  48  |   //     Uses a deterministic ID so repeated runs don't create duplicates.
  49  |   await page.request.post(`${API}/api/v1/accounts`, {
  50  |     headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  51  |     data: {
  52  |       name: 'Savings Account',
  53  |       type: 'bank',
  54  |       balance: 50000,
  55  |       currency: 'INR',
  56  |       clientRequestId: `test-acct-${user.email}`,
  57  |     },
  58  |   }).catch(() => {}); // ignore if already exists
  59  | 
  60  |   // 1c. Delete server-side PIN so PINAuth enters create mode (always succeeds locally).
  61  |   //     This prevents stale server PINs from blocking the verify flow for test users.
  62  |   const secTokenResp = await page.request.post(`${API}/api/v1/pin/verify-security`, {
  63  |     headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  64  |     data: {},
  65  |   }).catch(() => null);
  66  |   if (secTokenResp?.ok()) {
  67  |     const secJson = await secTokenResp.json().catch(() => ({}));
  68  |     if (secJson?.securityToken) {
  69  |       await page.request.post(`${API}/api/v1/pin/self-reset`, {
  70  |         headers: {
  71  |           Authorization: `Bearer ${accessToken}`,
  72  |           'Content-Type': 'application/json',
  73  |           'x-security-token': secJson.securityToken,
  74  |         },
  75  |         data: {},
  76  |       }).catch(() => {}); // ignore if already no PIN
  77  |     }
  78  |   }
  79  | 
  80  |   // 2. Open the app and inject tokens before React fully boots
  81  |   await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  82  |   await page.evaluate(({ at, rt, email }) => {
  83  |     localStorage.setItem('auth_token', at);
  84  |     localStorage.setItem('refresh_token', rt);
  85  |     localStorage.setItem('user_email', email);
  86  |     localStorage.setItem('onboarding_completed', 'true');
  87  |     // Clear local PIN keys so PINAuth starts fresh in create mode (server PIN was just reset above).
  88  |     // Create mode: user enters 142536 twice → local key stored → isAuthenticated = true.
  89  |     localStorage.removeItem('KANAKU_encrypted_key');
  90  |     localStorage.removeItem('KANAKU_salt');
  91  |     // Legacy pinService status keys — clear so pinService.hasPin() reads from server
  92  |     localStorage.removeItem('pin_verified');
  93  |     localStorage.removeItem('pin_verified_at');
  94  |     localStorage.removeItem('pin_setup_completed');
  95  |     localStorage.removeItem('pin_created');
  96  |   }, { at: accessToken, rt: refreshToken, email: user.email });
  97  | 
  98  |   // 3. Reload so React EnhancedAuthContext picks up the stored tokens
  99  |   // Use 'load' not 'networkidle' — the app has background syncing that prevents networkidle
> 100 |   await page.reload({ waitUntil: 'load', timeout: 35000 });
      |              ^ TimeoutError: page.reload: Timeout 35000ms exceeded.
  101 |   await page.waitForTimeout(2000);
  102 | 
  103 |   // 4. Wait for "Syncing your account..." loading screen to disappear
  104 |   const syncScreen = page.getByText(/syncing your account/i).first();
  105 |   if (await syncScreen.isVisible({ timeout: 2000 }).catch(() => false)) {
  106 |     await syncScreen.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => null);
  107 |     await page.waitForTimeout(1000);
  108 |   }
  109 | 
  110 |   await screenshot(page, `login_${user.firstName}_after`);
  111 |   return page.url();
  112 | }
  113 | 
  114 | /** Register a new user through the actual UI (signup form) */
  115 | export async function registerUser(page: Page, user: typeof USERS.U1) {
  116 |   await gotoApp(page);
  117 | 
  118 |   // Click "Get Started" on the marketing landing page
  119 |   const getStarted = page.getByRole('button', { name: /get started/i }).first();
  120 |   if (await getStarted.isVisible({ timeout: 5000 }).catch(() => false)) {
  121 |     await getStarted.click();
  122 |     await page.waitForTimeout(800);
  123 |   }
  124 | 
  125 |   const firstNameInput = page.locator('input[name="firstName"], input#firstName').first();
  126 |   const formVisible = await firstNameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  127 |   if (!formVisible) return 'form_not_found';
  128 | 
  129 |   await firstNameInput.fill(user.firstName);
  130 |   await page.locator('input[name="lastName"], input#lastName').first().fill(user.lastName);
  131 |   await page.locator('input[name="email"], input#email').first().fill(user.email);
  132 |   await page.keyboard.press('Escape');
  133 |   await page.locator('input[name="mobile"], input#mobile').first().fill(user.mobile);
  134 |   await page.locator('input[name="password"], input#password').first().fill(user.password);
  135 |   await page.locator('input[name="confirmPassword"], input#confirmPassword').first().fill(user.password);
  136 | 
  137 |   const termsCheckbox = page.locator('input#agreeToTerms, input[name="agreeToTerms"]').first();
  138 |   if (await termsCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
  139 |     if (!await termsCheckbox.isChecked()) await termsCheckbox.check();
  140 |   }
  141 | 
  142 |   await page.waitForTimeout(400);
  143 |   await screenshot(page, `register_${user.firstName}_before_submit`);
  144 | 
  145 |   const submitBtn = page.getByRole('button', { name: /create account|sign up|register|get started/i }).last();
  146 |   await submitBtn.click();
  147 |   await page.waitForTimeout(3000);
  148 |   await screenshot(page, `register_${user.firstName}_after_submit`);
  149 | 
  150 |   const pageText = await page.content();
  151 |   if (pageText.includes('already') || pageText.includes('exists') || pageText.includes('PHONE_EXISTS')) {
  152 |     return 'already_exists';
  153 |   }
  154 |   return 'registered';
  155 | }
  156 | 
  157 | /** Enter a 6-digit PIN using the on-screen numpad (buttons labelled 1-9, 0) */
  158 | async function enterPin(page: Page, pin = '111111') {
  159 |   // PINAuth makes an API call on mount (isLoading=true) before showing the enabled numpad.
  160 |   // Wait for a numpad digit button to become visible and enabled before clicking.
  161 |   const anyDigitBtn = page.getByRole('button', { name: /^[1-9]$/ }).first();
  162 |   await anyDigitBtn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);
  163 |   await page.waitForTimeout(400); // buffer for isLoading state to clear
  164 | 
  165 |   for (const digit of pin) {
  166 |     const btn = page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first();
  167 |     if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
  168 |       await btn.click();
  169 |       await page.waitForTimeout(150);
  170 |     }
  171 |   }
  172 | }
  173 | 
  174 | /** Complete PIN setup and any onboarding screens */
  175 | export async function skipOnboardingIfPresent(page: Page) {
  176 |   const STRONG_PIN = '142536'; // non-repeating, non-sequential
  177 | 
  178 |   // PINAuth makes an API call on mount before rendering the numpad (isLoading state).
  179 |   // Wait up to 12s for it to finish and show either create-mode or verify-mode UI.
  180 |   const anyPinText = page.getByText(/create your pin|enter your pin|secure unlock/i).first();
  181 |   const hasPinScreen = await anyPinText.isVisible({ timeout: 12000 }).catch(() => false);
  182 | 
  183 |   if (hasPinScreen) {
  184 |     const isCreateMode = await page.getByText(/create your pin/i).first()
  185 |       .isVisible({ timeout: 500 }).catch(() => false);
  186 | 
  187 |     // Step 1: verify mode enters PIN once; create mode enters it for Step 1 of 2
  188 |     await enterPin(page, STRONG_PIN);
  189 |     await page.waitForTimeout(1500);
  190 | 
  191 |     if (isCreateMode) {
  192 |       // Step 2 of 2 — Confirm your PIN (only in create mode)
  193 |       const confirmVisible = await page.getByText(/confirm your pin/i).first()
  194 |         .isVisible({ timeout: 5000 }).catch(() => false);
  195 |       if (confirmVisible) {
  196 |         await enterPin(page, STRONG_PIN);
  197 |         await page.waitForTimeout(1500);
  198 |       }
  199 |     }
  200 |   }
```