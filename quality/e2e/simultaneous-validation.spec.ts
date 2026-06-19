import { test, expect } from '@playwright/test';
import { config } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from workspace root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '../../backend/generated/prisma/index.js';
import { uniqueUiUser } from './test-data';
import { isElementVisible, skipOnboardingIfPresent } from './helpers';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

test.describe('Simultaneous UI, API, and DB Validation', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('Registration, Onboarding, PIN, Logout, and Login E2E Flow', async ({ page }) => {
    test.setTimeout(180_000);

    const user = uniqueUiUser();
    console.log(`\n=== Starting Simultaneous Validation for User: ${user.email} ===`);

    // Intercept and log all auth and pin API calls
    const apiTraffic: Array<{ type: 'request' | 'response'; url: string; method?: string; status?: number; data: any }> = [];

    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });

    page.on('request', async (req) => {
      const url = req.url();
      if (url.includes('/api/v1/auth/') || url.includes('/api/v1/pin/')) {
        let postData: any = null;
        try {
          const text = req.postData();
          if (text) postData = JSON.parse(text);
        } catch {
          postData = req.postData();
        }
        const entry = {
          type: 'request' as const,
          url,
          method: req.method(),
          data: postData,
        };
        apiTraffic.push(entry);
        console.log(`[API Request] ${entry.method} -> ${entry.url}`, postData ? `\nPayload: ${JSON.stringify(postData, null, 2)}` : '');
      }
    });

    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('/api/v1/auth/') || url.includes('/api/v1/pin/')) {
        let body: any = null;
        try {
          body = await res.json();
        } catch {
          try {
            body = await res.text();
          } catch {
            body = '[binary/empty]';
          }
        }
        const entry = {
          type: 'response' as const,
          url,
          status: res.status(),
          data: body,
        };
        apiTraffic.push(entry);
        console.log(`[API Response] ${entry.status} <- ${entry.url}`, body ? `\nBody: ${JSON.stringify(body, null, 2)}` : '');
      }
    });

    // 1. Navigate to Sign Up form
    console.log('\n--- Step 1: Navigating to Sign Up Form ---');
    await page.goto('http://localhost:9002', { waitUntil: 'domcontentloaded' });
    
    // Clear storage to start with a clean slate
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    const getStartedBtn = page.getByRole('button', { name: /get started/i }).first();
    if (await isElementVisible(getStartedBtn, 8000)) {
      await getStartedBtn.click();
      await page.waitForTimeout(1000);
    }

    const createAccountCTA = page.getByRole('button', { name: /^create account$/i }).first();
    if (await isElementVisible(createAccountCTA, 5000)) {
      await createAccountCTA.click();
      await page.waitForTimeout(1000);
    }

    // Locate fields
    const firstNameInput = page.locator('input[name="firstName"], input#firstName').first();
    await expect(firstNameInput).toBeVisible({ timeout: 10000 });

    const lastNameInput = page.locator('input[name="lastName"], input#lastName').first();
    const emailInput = page.locator('input[name="email"], input#email').first();
    const mobileInput = page.locator('input[name="mobile"], input#mobile').first();
    const passwordInput = page.locator('input[name="password"], input#password').first();
    const confirmPasswordInput = page.locator('input[name="confirmPassword"], input#confirmPassword').first();
    const termsCheckbox = page.locator('input#agreeToTerms, input[name="agreeToTerms"]').first();

    // Fill form fields
    console.log('Filling registration details...');
    await firstNameInput.fill(user.firstName);
    await firstNameInput.blur();
    
    await lastNameInput.fill(user.lastName);
    await lastNameInput.blur();

    await emailInput.fill(user.email);
    // Explicitly blur to trigger duplicate email checking API request
    await emailInput.blur();
    await page.waitForTimeout(1000); // Wait for checkEmail promise

    await mobileInput.fill(user.mobile);
    await mobileInput.blur();

    await passwordInput.fill(user.password);
    await passwordInput.blur();

    await confirmPasswordInput.fill(user.password);
    await confirmPasswordInput.blur();

    if (!(await termsCheckbox.isChecked())) {
      await termsCheckbox.check();
    }

    // Wait for stability and print form validation status
    await page.waitForTimeout(1500);
    
    const submitBtn = page.locator('[data-testid="auth-signup-submit-button"], button[type="submit"]').first();
    const submitText = await submitBtn.textContent();
    console.log(`Form Submit Button state text: "${submitText}"`);

    // If the button shows a "Complete more fields" state, inspect DOM state to debug
    if (submitText && submitText.includes('Complete')) {
      console.log('WARNING: Form is not ready. Printing diagnostics:');
      const diagnostics = await page.evaluate(() => {
        const errors: any[] = [];
        // Look for validation indicators or red border classes
        document.querySelectorAll('input').forEach(input => {
          errors.push({
            id: input.id,
            name: input.name,
            value: input.value,
            classes: input.className,
            touched: input.outerHTML.includes('touched')
          });
        });
        return {
          inputs: errors,
          bodyHtml: document.body.innerHTML.slice(0, 1000)
        };
      });
      console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
    }

    // Submit registration
    console.log('\n--- Step 2: Submitting Registration Form ---');
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    // Wait for signup success screen
    await page.waitForSelector('text=Account Created Successfully', { timeout: 15000 });
    console.log('UI reports Account Created Successfully.');

    // 2. Validate Database Records immediately after registration (with retry since it happens via async middleware check)
    console.log('\n--- Step 3: Validating Registration in Postgres Database ---');
    let dbUser = null;
    const maxDbRetries = 15;

    for (let i = 0; i < maxDbRetries; i++) {
      dbUser = await prisma.user.findUnique({
        where: { email: user.email },
      });
      if (dbUser) {
        break;
      }
      console.log(`Waiting for database User record to sync... Attempt ${i + 1}/${maxDbRetries}`);
      await page.waitForTimeout(1000);
    }

    console.log('Database User query result:', dbUser ? 'FOUND' : 'NOT FOUND');
    expect(dbUser).not.toBeNull();
    console.log(`Database User ID: ${dbUser?.id}`);
    console.log(`Database User Email: ${dbUser?.email}`);
    console.log(`Database User Name: ${dbUser?.name}`);
    console.log(`Database User Role: ${dbUser?.role}`);
    console.log(`Database User Status: ${dbUser?.status}`);

    // 3. Complete Onboarding and PIN setup
    console.log('\n--- Step 4: Completing Onboarding and Setting up PIN ---');
    
    // Step 4a: Profile Setup Step (Onboarding Step 1)
    console.log('Waiting for Profile Setup onboarding screen...');
    try {
      await page.locator('select#gender').waitFor({ state: 'visible', timeout: 20000 });
    } catch (err) {
      console.log('Timeout waiting for select#gender. Printing storage content:');
      const localStorageContent = await page.evaluate(() => JSON.stringify(localStorage));
      console.log('localStorage:', JSON.stringify(JSON.parse(localStorageContent), null, 2));
      const sessionStorageContent = await page.evaluate(() => JSON.stringify(sessionStorage));
      console.log('sessionStorage:', JSON.stringify(JSON.parse(sessionStorageContent), null, 2));
      const bodyHtml = await page.evaluate(() => document.body.innerHTML);
      console.log(bodyHtml);
      throw err;
    }
    
    console.log('Selecting gender "male"...');
    await page.locator('select#gender').selectOption('male');
    
    console.log('Filling Date of Birth "2000-01-01"...');
    await page.locator('input#dateOfBirth').fill('2000-01-01');
    
    console.log('Selecting Job Type "Full-time Employment"...');
    await page.locator('select#jobType').selectOption('Full-time Employment');
    
    console.log('Filling Annual Salary "1200000"...');
    await page.locator('input#salary').fill('1200000');
    
    console.log('Clicking "Continue to Bank Account Setup"...');
    await page.getByRole('button', { name: /Continue to Bank Account Setup/i }).click();

    // Step 4b: Country and Language Step (Onboarding Step 2)
    console.log('Waiting for Country and Language onboarding screen...');
    const skipStep2Btn = page.getByRole('button', { name: /Skip for now/i }).first();
    await skipStep2Btn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Clicking skip on Country and Language step...');
    await skipStep2Btn.click();

    // Step 4c: Onboarding Complete Step (Onboarding Step 4)
    console.log('Waiting for Onboarding Complete screen...');
    const completeSetupBtn = page.getByRole('button', { name: /Complete Setup/i }).first();
    await completeSetupBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Clicking Complete Setup...');
    await completeSetupBtn.click();

    // Step 4d: App Feature Slides
    console.log('Waiting for App Feature Slides...');
    const slidesContainer = page.getByTestId('onboarding-slides-container');
    await slidesContainer.waitFor({ state: 'visible', timeout: 15000 });
    
    console.log('Skipping slides...');
    const skipSlidesBtn = page.getByTestId('onboarding-slides-skip-button');
    await skipSlidesBtn.click();
    await page.waitForTimeout(600);
    
    console.log('Completing slides...');
    const completeSlidesBtn = page.getByTestId('onboarding-slides-complete-button');
    await completeSlidesBtn.click();

    // Step 4e: PIN setup for new users (Create PIN & Confirm PIN)
    console.log('Waiting for PIN setup screen...');
    const createPinText = page.getByText(/create your pin/i).first();
    await createPinText.waitFor({ state: 'visible', timeout: 20000 });
    
    const STRONG_PIN = '142536';
    console.log('Entering new PIN...');
    for (const digit of STRONG_PIN) {
      await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first().click();
      await page.waitForTimeout(200);
    }
    
    console.log('Waiting for Confirm PIN screen...');
    const confirmPinText = page.getByText(/confirm your pin/i).first();
    await confirmPinText.waitFor({ state: 'visible', timeout: 15000 });
    
    console.log('Confirming PIN...');
    for (const digit of STRONG_PIN) {
      await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first().click();
      await page.waitForTimeout(200);
    }

    // Verify we're on the dashboard
    await expect(page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first()).toBeVisible({ timeout: 20000 });
    console.log('Successfully reached Dashboard.');

    // 4. Validate profile and PIN in Postgres DB
    console.log('\n--- Step 5: Validating Profile and PIN in Postgres Database ---');
    let dbProfile = null;
    let dbPin = null;
    for (let i = 0; i < maxDbRetries; i++) {
      dbProfile = await prisma.profiles.findUnique({
        where: { email: user.email },
      });
      dbPin = await prisma.userPin.findUnique({
        where: { userId: dbUser!.id },
      });
      if (dbProfile && dbPin) {
        break;
      }
      console.log(`Waiting for database records to sync... Attempt ${i + 1}/${maxDbRetries}`);
      await page.waitForTimeout(1000);
    }

    console.log('Database Profile query result:', dbProfile ? 'FOUND' : 'NOT FOUND');
    expect(dbProfile).not.toBeNull();
    console.log(`Database Profile First Name: ${dbProfile?.first_name}`);
    console.log(`Database Profile Last Name: ${dbProfile?.last_name}`);
    console.log(`Database Profile Phone: ${dbProfile?.phone}`);

    console.log('Database UserPin query result:', dbPin ? 'FOUND' : 'NOT FOUND');
    expect(dbPin).not.toBeNull();
    console.log(`Database PIN Active Status: ${dbPin?.isActive}`);
    console.log(`Database PIN Hash: ${dbPin?.pinHash}`);

    // 4. Perform UI Logout
    console.log('\n--- Step 6: Logging Out via UI ---');
    // Click the profile avatar to navigate to profile page
    const profileBtn = page.locator('header button').filter({ has: page.locator('img') }).first();
    if (await isElementVisible(profileBtn, 5000)) {
      await profileBtn.click();
    } else {
      // Fallback: click the profile icon button or text U
      await page.locator('header button:has-text("U")').first().click();
    }

    await page.waitForTimeout(1000);
    const logoutBtn = page.locator('[data-testid="profile-signout-button"]').first();
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();

    // Verify redirected back to landing
    const loginCTA = page.getByRole('button', { name: /log in|sign in/i }).first();
    await expect(loginCTA).toBeVisible({ timeout: 10000 });
    console.log('Successfully logged out and redirected to landing page.');

    // 5. Perform UI Login
    console.log('\n--- Step 7: Logging Back In via UI ---');
    await loginCTA.click();
    await page.waitForTimeout(1000);

    const signinEmailInput = page.locator('input[name="email"], input[type="email"]').first();
    const signinPasswordInput = page.locator('input[name="password"], input[type="password"]').first();
    const signinSubmitBtn = page.locator('[data-testid="auth-signin-submit-button"], button[type="submit"]').first();

    await signinEmailInput.fill(user.email);
    await signinPasswordInput.fill(user.password);
    await signinSubmitBtn.click();

    // Verify PIN entry screen is shown again for login
    console.log('Entering PIN for login validation...');
    await page.getByText(/enter your pin/i).first().waitFor({ state: 'visible', timeout: 15000 });
    
    // Enter the same PIN used during onboarding: '142536'
    const pin = '142536';
    for (const digit of pin) {
      await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first().click();
      await page.waitForTimeout(200);
    }

    // Verify we reached the dashboard again
    await expect(page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first()).toBeVisible({ timeout: 15000 });
    console.log('Successfully completed login and PIN verification.');
    
    console.log('\n=== E2E Flow Completed Successfully! ===');
  });
});
