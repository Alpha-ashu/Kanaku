import { Page, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

export const BASE = 'http://localhost:9002';
export const API  = 'http://localhost:3000';

export const USERS = {
  U1: { firstName: 'Arjun',  lastName: 'Sharma',  email: 'arjun.test@finora.app',  mobile: '9000000001', password: 'TestFinora@2026', persona: 'Debt Manager' },
  U2: { firstName: 'Priya',  lastName: 'Mehta',   email: 'priya.test@finora.app',   mobile: '9000000002', password: 'TestFinora@2026', persona: 'Group Splitter' },
  U3: { firstName: 'Rohan',  lastName: 'Verma',   email: 'rohan.test@finora.app',   mobile: '9000000003', password: 'TestFinora@2026', persona: 'Investor' },
  U4: { firstName: 'Sneha',  lastName: 'Kapoor',  email: 'sneha.test@finora.app',   mobile: '9000000004', password: 'TestFinora@2026', persona: 'Goal Setter' },
  U5: { firstName: 'Dev',    lastName: 'Nair',    email: 'dev.test@finora.app',     mobile: '9000000005', password: 'TestFinora@2026', persona: 'Portfolio Builder' },
  U6: { firstName: 'Isha',   lastName: 'Patel',   email: 'isha.test@finora.app',    mobile: '9000000006', password: 'TestFinora@2026', persona: 'Planner' },
  U7: { firstName: 'Power',  lastName: 'User',    email: 'admin.test@finora.app',   mobile: '9000000007', password: 'TestFinora@2026', persona: 'Power User' },
};

export async function screenshot(page: Page, name: string) {
  const dir = path.join('tests', 'e2e', 'screenshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false, timeout: 8000 }).catch(() => null);
}

/** Navigate to the app root and wait for landing page */
export async function gotoApp(page: Page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1, button, nav', { timeout: 15000 });
}

/**
 * Login via API + inject tokens directly into localStorage.
 * Mimics exactly what the frontend SignInForm does after a successful API login,
 * bypassing the marketing landing page navigation flow.
 */
export async function loginUser(page: Page, user: typeof USERS.U1) {
  // 1. Get tokens from backend API (retry up to 3x for transient ECONNREFUSED on startup)
  let resp: Awaited<ReturnType<typeof page.request.post>> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      resp = await page.request.post(`${API}/api/v1/auth/login`, {
        data: { email: user.email, password: user.password },
      });
      break;
    } catch (e: any) {
      if (attempt === 2) throw e;
      await page.waitForTimeout(3000);
    }
  }
  const json = await resp!.json();
  const { accessToken, refreshToken } = json.data ?? {};

  if (!accessToken) {
    throw new Error(`Login API failed for ${user.email}: ${JSON.stringify(json)}`);
  }

  // 1b. Pre-create a default cash account so AddTransaction/group expense flows work
  //     Uses a deterministic ID so repeated runs don't create duplicates.
  await page.request.post(`${API}/api/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    data: {
      name: 'Savings Account',
      type: 'bank',
      balance: 50000,
      currency: 'INR',
      clientRequestId: `test-acct-${user.email}`,
    },
  }).catch(() => {}); // ignore if already exists

  // 1c. Delete server-side PIN so PINAuth enters create mode (always succeeds locally).
  //     Retry up to 3× with increasing delays — server can be slow under test load.
  for (let pinReset = 0; pinReset < 3; pinReset++) {
    const secTokenResp = await page.request.post(`${API}/api/v1/pin/verify-security`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      data: {},
    }).catch(() => null);
    if (secTokenResp?.ok()) {
      const secJson = await secTokenResp.json().catch(() => ({}));
      if (secJson?.securityToken) {
        const resetResp = await page.request.post(`${API}/api/v1/pin/self-reset`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'x-security-token': secJson.securityToken,
          },
          data: {},
        }).catch(() => null);
        if (resetResp?.ok()) break; // Reset succeeded — exit retry loop
      }
    }
    if (pinReset < 2) await page.waitForTimeout(2000 * (pinReset + 1));
  }

  // 2. Open the app and inject tokens before React fully boots
  // Catch timeout: late in a long test run the dev server may be slow to fire domcontentloaded.
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  await page.evaluate(({ at, rt, email }) => {
    localStorage.setItem('auth_token', at);
    localStorage.setItem('refresh_token', rt);
    localStorage.setItem('user_email', email);
    localStorage.setItem('onboarding_completed', 'true');
    // Clear local PIN keys so PINAuth starts fresh in create mode (server PIN was just reset above).
    // Create mode: user enters 142536 twice → local key stored → isAuthenticated = true.
    localStorage.removeItem('KANAKU_encrypted_key');
    localStorage.removeItem('KANAKU_salt');
    // Legacy pinService status keys — clear so pinService.hasPin() reads from server
    localStorage.removeItem('pin_verified');
    localStorage.removeItem('pin_verified_at');
    localStorage.removeItem('pin_setup_completed');
    localStorage.removeItem('pin_created');
  }, { at: accessToken, rt: refreshToken, email: user.email });

  // 3. Reload so React EnhancedAuthContext picks up the stored tokens
  // Use 'load' not 'networkidle' — the app has background syncing that prevents networkidle.
  // Catch timeout: the app may keep background connections open after load (WebSocket, polling)
  // which delays the 'load' event on slow dev servers. The page is usable even if timeout fires.
  await page.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(2000);

  // 4. Wait for "Syncing your account..." loading screen to disappear
  const syncScreen = page.getByText(/syncing your account/i).first();
  if (await syncScreen.isVisible({ timeout: 2000 }).catch(() => false)) {
    await syncScreen.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => null);
    await page.waitForTimeout(1000);
  }

  await screenshot(page, `login_${user.firstName}_after`);
  return page.url();
}

/** Register a new user through the actual UI (signup form) */
export async function registerUser(page: Page, user: typeof USERS.U1) {
  await gotoApp(page);

  // Click "Get Started" on the marketing landing page
  const getStarted = page.getByRole('button', { name: /get started/i }).first();
  if (await getStarted.isVisible({ timeout: 5000 }).catch(() => false)) {
    await getStarted.click();
    await page.waitForTimeout(800);
  }

  // "Get Started" navigates to AuthFlow 'welcome' step (Create Account / Sign In / etc.).
  // Click "Create Account" to reach the actual signup form.
  const createAccountCTA = page.getByRole('button', { name: /^create account$/i }).first();
  if (await createAccountCTA.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createAccountCTA.click();
    await page.waitForTimeout(800);
  }

  const firstNameInput = page.locator('input[name="firstName"], input#firstName').first();
  const formVisible = await firstNameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (!formVisible) return 'form_not_found';

  await firstNameInput.fill(user.firstName);
  await page.locator('input[name="lastName"], input#lastName').first().fill(user.lastName);
  await page.locator('input[name="email"], input#email').first().fill(user.email);
  await page.keyboard.press('Escape');
  await page.locator('input[name="mobile"], input#mobile').first().fill(user.mobile);
  await page.locator('input[name="password"], input#password').first().fill(user.password);
  await page.locator('input[name="confirmPassword"], input#confirmPassword').first().fill(user.password);

  const termsCheckbox = page.locator('input#agreeToTerms, input[name="agreeToTerms"]').first();
  if (await termsCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
    if (!await termsCheckbox.isChecked()) await termsCheckbox.check();
  }

  await page.waitForTimeout(400);
  await screenshot(page, `register_${user.firstName}_before_submit`);

  const submitBtn = page.getByRole('button', { name: /create account.*ready|create account|sign up|register/i }).last();
  await submitBtn.click();
  await screenshot(page, `register_${user.firstName}_after_submit`);

  // For already-registered users, handleSignUp fires toast.error("already registered")
  // within ~2s, then SignUpForm shows "Account Created Successfully!" (app bug: success shown
  // even for duplicate). The toast text contains "already" and is visible for ~4s.
  // Detect duplicate early before the toast dismisses.
  const earlyDuplicateText = page.getByText(/already registered|already.*email|phone.*already|already.*use/i).first();
  if (await earlyDuplicateText.isVisible({ timeout: 5000 }).catch(() => false)) {
    return 'already_exists';
  }

  // "Account Created Successfully!" appears for BOTH real registrations and duplicates.
  // For REAL new users the app navigates away (onboarding) within ~3s.
  // For DUPLICATE users the app stays on the success screen indefinitely (no auth change).
  const accountCreatedText = page.getByText(/Account Created Successfully/i).first();
  if (await accountCreatedText.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Wait to see if the app navigates away (real new user) or stays stuck (duplicate)
    const dashEl = page.locator('[data-nav-id]').first();
    const navigatedAway = await dashEl.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    if (!navigatedAway) {
      // Still on success screen with no dashboard → duplicate user (app bug: success shown incorrectly)
      return 'already_exists';
    }
    return 'registered';
  }

  // Fallback: check body text for error keywords (form inline errors, etc.)
  const bodyText = (await page.locator('body').textContent().catch(() => null)) ?? '';
  const lowerBody = bodyText.toLowerCase();
  if (lowerBody.includes('already') || lowerBody.includes('taken') || lowerBody.includes('in use') ||
      lowerBody.includes('email_exists') || lowerBody.includes('phone_exists')) {
    return 'already_exists';
  }
  // If form is still visible, the submission was rejected (validation or inline error)
  const formStillVisible = await page.locator('input[name="firstName"]').isVisible({ timeout: 1000 }).catch(() => false);
  if (formStillVisible) return 'already_exists';
  return 'registered';
}

/** Enter a 6-digit PIN by clicking the PINAuth numpad buttons.
 *  Primary: Playwright .click({ force: true }) on the numpad container buttons.
 *  Fallback: evaluate-based dispatchEvent.
 *  Both bypass pointer-events and focus requirements. */
async function enterPin(page: Page, pin = '111111') {
  await page.getByText(/create your pin|confirm your pin|enter your pin/i).first()
    .waitFor({ state: 'visible', timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(500);

  // Locate the numpad grid container (grid-cols-3 = the 3-column number pad)
  const numpadContainer = page.locator('[class*="grid-cols-3"]').last();

  for (const digit of pin) {
    // Primary: Playwright force-click on the scoped numpad button
    const numpadBtn = numpadContainer.locator('button')
      .filter({ hasText: new RegExp(`^${digit}$`) }).first();
    const clicked = await numpadBtn.click({ force: true, timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (!clicked) {
      // Fallback: find button across whole page via evaluate
      await page.evaluate((d) => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => (b.textContent ?? '').trim() === d);
        if (btn) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }, digit);
    }
    await page.waitForTimeout(200);
  }

  // Wait for auto-submit (120ms) + crypto key derivation + server round-trip.
  // Increased to 5000ms to handle slow server under long test runs.
  await page.waitForTimeout(5000);
}

/** Complete PIN setup and any onboarding screens */
export async function skipOnboardingIfPresent(page: Page) {
  const STRONG_PIN = '142536'; // non-repeating, non-sequential

  // PINAuth makes an API call on mount before rendering the numpad (isLoading state).
  // Wait up to 30s: pinService.getStatus() can be slow for some users/environments.
  const anyPinText = page.getByText(/create your pin|enter your pin|secure unlock/i).first();
  const hasPinScreen = await anyPinText.isVisible({ timeout: 30000 }).catch(() => false);

  if (hasPinScreen) {
    const isCreateMode = await page.getByText(/create your pin/i).first()
      .isVisible({ timeout: 500 }).catch(() => false);

    // Step 1: verify mode enters PIN once; create mode enters it for Step 1 of 2
    await enterPin(page, STRONG_PIN);
    await page.waitForTimeout(1500);

    if (isCreateMode) {
      // Step 2 of 2 — Confirm your PIN (only in create mode)
      const confirmVisible = await page.getByText(/confirm your pin/i).first()
        .isVisible({ timeout: 5000 }).catch(() => false);
      if (confirmVisible) {
        await enterPin(page, STRONG_PIN);
        await page.waitForTimeout(1500);
      }
    }
  }

  // If any PIN screen still showing (e.g. mismatch or wrong PIN), try skip
  const pinStillShowing = page.getByText(/create your pin|confirm your pin|enter your pin/i).first();
  if (await pinStillShowing.isVisible({ timeout: 2000 }).catch(() => false)) {
    const skipPin = page.getByRole('button', { name: /skip|later|not now/i }).first();
    if (await skipPin.isVisible({ timeout: 2000 }).catch(() => false)) await skipPin.click();
  }

  // Handle any remaining onboarding steps
  for (let i = 0; i < 6; i++) {
    const skipBtn = page.getByRole('button', { name: /skip|later|not now|continue|next|done|finish|complete/i }).first();
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(600);
    } else break;
  }

  // Wait for the main app to load past all auth + sync gates.
  // The sidebar nav items (data-nav-id attributes) only render after isAuthenticated=true AND dataReady=true.
  await page.waitForFunction(
    () => {
      const hasSidebarNav = !!document.querySelector('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]');
      const isSyncing = (document.body?.textContent ?? '').includes('Syncing your account') ||
                        (document.body?.textContent ?? '').includes('Loading your account');
      return hasSidebarNav && !isSyncing;
    },
    { timeout: 60000 }
  ).catch(() => null);

  await page.waitForTimeout(500);
}

/** Click a nav item by label text — finds sidebar data-nav-id items and bottom nav buttons */
export async function clickNav(page: Page, label: string): Promise<boolean> {
  const re = new RegExp(label, 'i');

  // Priority 1: sidebar items tagged with data-nav-id or aria-label (motion.div, not button)
  const sidebarById = page.locator(`[data-nav-id*="${label}" i]`).first();
  if (await sidebarById.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sidebarById.click();
    await page.waitForTimeout(800);
    return true;
  }

  const sidebarByAria = page.locator(`[aria-label*="${label}" i]`).first();
  if (await sidebarByAria.isVisible({ timeout: 3000 }).catch(() => false)) {
    await sidebarByAria.click();
    await page.waitForTimeout(800);
    return true;
  }

  // Priority 2: enabled buttons in nav containers
  const candidates = [
    page.locator('nav button:not([disabled]), nav a').filter({ hasText: re }),
    page.locator('[class*="nav"] button:not([disabled])').filter({ hasText: re }),
    page.getByRole('button', { name: re }).filter({ hasNot: page.locator('[disabled]') }),
    page.getByRole('link', { name: re }),
  ];
  for (const loc of candidates) {
    const el = loc.first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(800);
      return true;
    }
  }

  return false;
}

/** Wait for a toast / success message */
export async function waitForToast(page: Page, text?: string) {
  const toast = text
    ? page.locator(`[role="status"], .toast, [data-sonner-toast]`).filter({ hasText: new RegExp(text, 'i') })
    : page.locator(`[role="status"], .toast, [data-sonner-toast]`);
  await toast.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);
}
