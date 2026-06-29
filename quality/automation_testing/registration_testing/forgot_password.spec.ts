import { test, expect } from '@playwright/test';
import { config } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generateValidUser } from './test_data';
import { AuthPage } from '../../e2e/pom/AuthPage';

// Resolve directory name and load env from root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '../../../backend/generated/prisma/index.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

test.describe('Forgot Password E2E & API flow', () => {
  test.setTimeout(120_000);

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('happy path: request OTP, verify and reset password successfully', async ({ page, request }) => {
    page.on('console', msg => console.log(`BROWSER CONSOLE: [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

    // 1. Register a valid user via API first to make sure they exist
    const user = generateValidUser();
    console.log(`Registering user ${user.email} for password reset test`);
    const registerResponse = await request.post('/api/v1/auth/register', {
      data: {
        email: user.email,
        name: user.name,
        password: user.password,
        mobile: user.mobile,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(registerResponse.status()).toBe(201);

    // 2. Go to Forgot Password UI directly and click Log In
    await page.goto('http://localhost:9002/');
    const logInButton = page.locator('[data-testid="public-navbar-log-in"], button:has-text("Log In"), button:has-text("Sign In")').first();
    await logInButton.waitFor({ state: 'visible', timeout: 15000 });
    await logInButton.click();

    // Wait for the Sign In form to render and click Forgot Password
    const forgotPasswordLink = page.getByTestId('sign-in-form-forgot-password');
    await forgotPasswordLink.waitFor({ state: 'visible', timeout: 15000 });
    await forgotPasswordLink.click();

    // Verify Forgot Password screen is shown
    await expect(page.getByRole('heading', { name: /Forgot Password/i })).toBeVisible();

    // Setup listener to intercept the OTP response from the UI submit click
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/auth/forgot-password') && response.status() === 200,
      { timeout: 15000 }
    );

    // Fill email and submit
    await page.getByTestId('forgot-password-email-input').fill(user.email);
    await page.getByTestId('forgot-password-submit-button').click();

    // Wait for the response and extract the OTP code
    const forgotResponse = await responsePromise;
    const forgotBody = await forgotResponse.json();
    const otpCode = forgotBody.code;
    expect(otpCode).toBeDefined();
    console.log(`Retrieved reset OTP: ${otpCode}`);

    // Verify we redirected to reset password screen
    await expect(page.getByRole('heading', { name: /Reset Password/i })).toBeVisible();

    // Fill OTP and new password in the UI
    const newPassword = 'NewCoolPassword123!';
    await page.getByTestId('reset-password-otp-input').fill(otpCode);
    await page.getByTestId('reset-password-password-input').fill(newPassword);
    await page.getByTestId('reset-password-confirm-input').fill(newPassword);
    await page.getByTestId('reset-password-submit-button').click();

    // Verify redirect back to Welcome Back / Sign In screen
    await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible();

    // Try logging in with the NEW password to verify it replaced the old password
    const authPage = new AuthPage(page);
    await page.getByTestId('auth-signin-email-input').fill(user.email);
    await page.getByTestId('auth-signin-password-input').fill(newPassword);
    await page.getByTestId('auth-signin-submit-button').click();

    // Skip onboarding/PIN setup since this is a newly registered user who has never logged in/onboarded
    await authPage.skipOnboarding();

    // Assert that we log in successfully (dashboard is visible)
    const dashboardHeader = page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first();
    await expect(dashboardHeader).toBeVisible({ timeout: 15000 });
  });
});
