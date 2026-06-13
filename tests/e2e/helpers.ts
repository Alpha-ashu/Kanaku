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
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
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
  // 1. Get tokens from backend API
  const resp = await page.request.post(`${API}/api/v1/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  const json = await resp.json();
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
  //     This prevents stale server PINs from blocking the verify flow for test users.
  const secTokenResp = await page.request.post(`${API}/api/v1/pin/verify-security`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    data: {},
  }).catch(() => null);
  if (secTokenResp?.ok()) {
    const secJson = await secTokenResp.json().catch(() => ({}));
    if (secJson?.securityToken) {
      await page.request.post(`${API}/api/v1/pin/self-reset`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-security-token': secJson.securityToken,
        },
        data: {},
      }).catch(() => {}); // ignore if already no PIN
    }
  }

  // 2. Open the app and inject tokens before React fully boots
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
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
  // Use 'load' not 'networkidle' — the app has background syncing that prevents networkidle
  await page.reload({ waitUntil: 'load', timeout: 35000 });
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

  const submitBtn = page.getByRole('button', { name: /create account|sign up|register|get started/i }).last();
  await submitBtn.click();
  await page.waitForTimeout(3000);
  await screenshot(page, `register_${user.firstName}_after_submit`);

  const pageText = await page.content();
  if (pageText.includes('already') || pageText.includes('exists') || pageText.includes('PHONE_EXISTS')) {
    return 'already_exists';
  }
  return 'registered';
}

/** Enter a 6-digit PIN using the on-screen numpad (buttons labelled 1-9, 0) */
async function enterPin(page: Page, pin = '111111') {
  // PINAuth makes an API call on mount (isLoading=true) before showing the enabled numpad.
  // Wait for a numpad digit button to become visible before clicking.
  const anyDigitBtn = page.getByRole('button', { name: /^[1-9]$/ }).first();
  await anyDigitBtn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(500); // buffer for isLoading state to fully clear and focus to settle

  for (const digit of pin) {
    const btn = page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first();
    // waitFor ensures the button is in the DOM; force:true bypasses any actionability
    // interceptors (pointer-events:none during re-renders, covered elements, etc.)
    await btn.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null);
    await btn.click({ force: true });
    await page.waitForTimeout(200);
  }
}

/** Complete PIN setup and any onboarding screens */
export async function skipOnboardingIfPresent(page: Page) {
  const STRONG_PIN = '142536'; // non-repeating, non-sequential

  // PINAuth makes an API call on mount before rendering the numpad (isLoading state).
  // Wait up to 12s for it to finish and show either create-mode or verify-mode UI.
  const anyPinText = page.getByText(/create your pin|enter your pin|secure unlock/i).first();
  const hasPinScreen = await anyPinText.isVisible({ timeout: 12000 }).catch(() => false);

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
