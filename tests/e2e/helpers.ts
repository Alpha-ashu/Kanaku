import { Page, expect, Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

export async function isElementVisible(locator: Locator, timeout = 5000): Promise<boolean> {
  return locator.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
}

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
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  await page.waitForSelector('h1, button, nav', { timeout: 30000 });
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
  const { accessToken, refreshToken, user: userObj } = json.data ?? {};

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


  // 2. Open the app and wipe localStorage / IndexedDB to start with a clean slate
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  await page.evaluate(({ at, rt, email, userObj, verifiedAt }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('auth_token', at);
    localStorage.setItem('refresh_token', rt);
    localStorage.setItem('user_email', email);
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('onboarding_slides_viewed', 'true');
    localStorage.setItem('user_data', JSON.stringify(userObj));
    localStorage.setItem('pin_setup_completed', 'true');
    localStorage.setItem('pin_created', 'true');
    localStorage.setItem('pin_verified', 'true');
    localStorage.setItem('pin_verified_at', verifiedAt);
    return new Promise<void>((resolve) => {
      const req = indexedDB.open('KANAKUDB');
      req.onsuccess = (event) => {
        const db = (event.target as any).result;
        if (!db.objectStoreNames || db.objectStoreNames.length === 0) {
          db.close();
          resolve();
          return;
        }
        try {
          const tx = db.transaction(db.objectStoreNames, 'readwrite');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
          for (const storeName of db.objectStoreNames) {
            tx.objectStore(storeName).clear();
          }
        } catch (e) {
          db.close();
          resolve();
        }
      };
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
      setTimeout(resolve, 2000); // safety fallback
    });
  }, { at: accessToken, rt: refreshToken, email: user.email, userObj, verifiedAt: new Date().toISOString() }).catch(() => null);

  // 3. Reload so React EnhancedAuthContext picks up the stored tokens.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(2000);

  // 4. Wait for "Syncing your account..." loading screen to disappear
  const syncScreen = page.getByText(/syncing your account/i).first();
  if (await isElementVisible(syncScreen, 2000)) {
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
  if (await isElementVisible(getStarted, 5000)) {
    await getStarted.click();
    await page.waitForTimeout(800);
  }

  // "Get Started" navigates to AuthFlow 'welcome' step (Create Account / Sign In / etc.).
  // Click "Create Account" to reach the actual signup form.
  const createAccountCTA = page.getByRole('button', { name: /^create account$/i }).first();
  if (await isElementVisible(createAccountCTA, 3000)) {
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
  if (await isElementVisible(termsCheckbox, 2000)) {
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
  if (await isElementVisible(earlyDuplicateText, 5000)) {
    return 'already_exists';
  }

  // "Account Created Successfully!" appears for BOTH real registrations and duplicates.
  // For REAL new users the app navigates away (onboarding) within ~3s.
  // For DUPLICATE users the app stays on the success screen indefinitely (no auth change).
  const accountCreatedText = page.getByText(/Account Created Successfully/i).first();
  if (await isElementVisible(accountCreatedText, 5000)) {
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
  const formStillVisible = await isElementVisible(page.locator('input[name="firstName"]').first(), 1000);
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

  for (const digit of pin) {
    // Primary: Playwright getByRole — most robust, works regardless of CSS class names
    const btn = page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first();
    const clicked = await btn.click({ force: true, timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (!clicked) {
      // Fallback: evaluate-based dispatchEvent
      await page.evaluate((d) => {
        const b = Array.from(document.querySelectorAll('button'))
          .find(el => (el.textContent ?? '').trim() === d);
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }, digit);
    }
    await page.waitForTimeout(200);
  }

  await page.waitForTimeout(5000);
}

/** Complete PIN setup and any onboarding screens */
export async function skipOnboardingIfPresent(page: Page) {
  const isDashboardVisible = await page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first()
    .isVisible().catch(() => false);
  if (isDashboardVisible) return;

  // Handle App Feature Slides (shown to new users before PIN setup)
  const slidesContainer = page.getByTestId('onboarding-slides-container');
  if (await isElementVisible(slidesContainer, 5000)) {
    // Click Skip to jump to the last slide, then click Complete
    const skipBtn = page.getByTestId('onboarding-slides-skip-button');
    if (await isElementVisible(skipBtn, 2000)) {
      await skipBtn.click();
      await page.waitForTimeout(600);
    }
    const completeBtn = page.getByTestId('onboarding-slides-complete-button');
    if (await isElementVisible(completeBtn, 3000)) {
      await completeBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  const STRONG_PIN = '142536'; // non-repeating, non-sequential

  // PINAuth makes an API call on mount before rendering the numpad (isLoading state).
  // Wait up to 30s: pinService.getStatus() can be slow for some users/environments.
  const anyPinText = page.getByText(/create your pin|enter your pin|secure unlock/i).first();
  const hasPinScreen = await isElementVisible(anyPinText, 20000);

  if (hasPinScreen) {
    const isCreateMode = await isElementVisible(page.getByText(/create your pin/i).first(), 500);

    // Step 1: verify mode enters PIN once; create mode enters it for Step 1 of 2
    await enterPin(page, STRONG_PIN);
    // enterPin waits 5s internally; add extra buffer for slow server (PBKDF2 + API call)
    await page.waitForTimeout(2000);

    if (isCreateMode) {
      // Step 2 of 2 — Confirm your PIN (only in create mode).
      // Server processes step 1 asynchronously; increase timeout for under-load scenarios.
      const confirmVisible = await isElementVisible(page.getByText(/confirm your pin/i).first(), 12000);
      if (confirmVisible) {
        await enterPin(page, STRONG_PIN);
        await page.waitForTimeout(2000);
      }
    } else {
      // Verify mode: if PIN screen still showing after entry, it likely means
      // the previous run used PIN=142536 — retry once (server still has that hash).
      const pinStillAfterVerify = await isElementVisible(page.getByText(/enter your pin/i).first(), 1000);
      if (pinStillAfterVerify) {
        // isSubmitting may be stuck — wait for it to reset before retrying
        await page.waitForTimeout(3000);
        await enterPin(page, STRONG_PIN);
        await page.waitForTimeout(2000);
      }
    }
  }

  // If any PIN screen still showing (e.g. mismatch or wrong PIN), try skip
  const pinStillShowing = page.getByText(/create your pin|confirm your pin|enter your pin/i).first();
  if (await isElementVisible(pinStillShowing, 1000)) {
    const skipPin = page.getByRole('button', { name: /skip|later|not now/i }).first();
    if (await isElementVisible(skipPin, 1000)) await skipPin.click();
  }

  // Handle any remaining onboarding steps
  for (let i = 0; i < 6; i++) {
    const skipBtn = page.getByRole('button', { name: /skip|later|not now|continue|next|done|finish|complete/i }).first();
    if (await isElementVisible(skipBtn, 1000)) {
      await skipBtn.click();
      await page.waitForTimeout(600);
    } else break;
  }

  // Wait for the main app to load past all auth + sync gates.
  // The sidebar nav items (data-nav-id attributes) only render after isAuthenticated=true AND dataReady=true.
  // Wait for nav elements — presence of [data-nav-id] means app is authenticated and mounted.
  // Do NOT wait for sync completion (isSyncing check); that can block for 30s+ under load.
  await page.waitForFunction(
    () => !!document.querySelector('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]'),
    { timeout: 30000 }
  ).catch(() => null);

  await page.waitForTimeout(500);
}

/** Click a nav item by label text — finds sidebar data-nav-id items and bottom nav buttons */
export async function clickNav(page: Page, label: string): Promise<boolean> {
  const re = new RegExp(label, 'i');

  // Priority 1: sidebar items tagged with data-nav-id or aria-label (motion.div, not button)
  const sidebarById = page.locator(`[data-nav-id*="${label}" i]`).first();
  if (await isElementVisible(sidebarById, 1000)) {
    await sidebarById.click();
    await page.waitForTimeout(800);
    return true;
  }

  const sidebarByAria = page.locator(`[aria-label*="${label}" i]`).first();
  if (await isElementVisible(sidebarByAria, 1000)) {
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
    if (await isElementVisible(el, 500)) {
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
