import { test, expect } from '@playwright/test';
import { AuthPage } from '../../e2e/pom/AuthPage';
import { generateValidUser } from './test_data';
import { isElementVisible, screenshot } from '../../e2e/helpers';

test.describe('Registration UI validation', () => {
  test.setTimeout(120_000);

  test('happy path: complete registration flow on UI and redirects to onboarding', async ({ page }) => {
    const authPage = new AuthPage(page);
    const user = generateValidUser();

    console.log(`Registering valid user: ${user.email} via UI`);
    await authPage.gotoSignupForm();

    // Fill form
    await authPage.firstNameInput.fill(user.firstName);
    await authPage.lastNameInput.fill(user.lastName);
    await authPage.emailInput.fill(user.email);
    await authPage.mobileInput.fill(user.mobile);
    await authPage.passwordInput.fill(user.password);
    await authPage.confirmPasswordInput.fill(user.password);
    
    // Check terms
    if (!(await authPage.agreeTermsCheckbox.isChecked())) {
      await authPage.agreeTermsCheckbox.check();
    }

    // Submit button should be enabled
    await expect(authPage.signupSubmitBtn).toBeEnabled();

    // Submit
    await authPage.signupSubmitBtn.click();
    
    // Wait for transition away from auth (indicating success)
    const onboardingHeading = page.getByRole('heading', { name: /Complete Your Profile/i }).first();
    const confirmEmailText = page.getByText(/Confirm your email/i).first();
    
    await expect.poll(async () => {
      const url = page.url();
      const hasOnboardingHeader = await onboardingHeading.isVisible().catch(() => false);
      const hasConfirmEmail = await confirmEmailText.isVisible().catch(() => false);
      return url.includes('/onboarding') || hasOnboardingHeader || hasConfirmEmail;
    }, { timeout: 20000 }).toBe(true);

    await screenshot(page, 'ui_register_success_submitted');

    // Skip onboarding to verify we reach the dashboard
    await authPage.skipOnboarding();
    await authPage.assertAuthenticated();
  });

  test('UI Validation: blocks registration with invalid email format', async ({ page }) => {
    const authPage = new AuthPage(page);
    const user = generateValidUser({ email: 'not-an-email' });

    await authPage.gotoSignupForm();
    await authPage.firstNameInput.fill(user.firstName);
    await authPage.lastNameInput.fill(user.lastName);
    await authPage.emailInput.fill(user.email);
    await authPage.mobileInput.fill(user.mobile);
    await authPage.passwordInput.fill(user.password);
    await authPage.confirmPasswordInput.fill(user.password);
    await authPage.agreeTermsCheckbox.check();

    // Assert submit button is disabled due to invalid email format
    await expect(authPage.signupSubmitBtn).toBeDisabled();

    // Verify presence of email error hint/warning
    const emailError = page.locator('text=/valid email/i').first();
    await expect(emailError).toBeVisible();
  });

  test('UI Validation: blocks registration with mismatched passwords', async ({ page }) => {
    const authPage = new AuthPage(page);
    const user = generateValidUser();

    await authPage.gotoSignupForm();
    await authPage.firstNameInput.fill(user.firstName);
    await authPage.lastNameInput.fill(user.lastName);
    await authPage.emailInput.fill(user.email);
    await authPage.mobileInput.fill(user.mobile);
    await authPage.passwordInput.fill(user.password);
    await authPage.confirmPasswordInput.fill('DifferentPassword123!');
    await authPage.agreeTermsCheckbox.check();

    // Assert submit button is disabled due to password mismatch
    await expect(authPage.signupSubmitBtn).toBeDisabled();
  });

  test('UI Validation: blocks registration when terms are unchecked', async ({ page }) => {
    const authPage = new AuthPage(page);
    const user = generateValidUser();

    await authPage.gotoSignupForm();
    await authPage.firstNameInput.fill(user.firstName);
    await authPage.lastNameInput.fill(user.lastName);
    await authPage.emailInput.fill(user.email);
    await authPage.mobileInput.fill(user.mobile);
    await authPage.passwordInput.fill(user.password);
    await authPage.confirmPasswordInput.fill(user.password);
    
    // Ensure terms checkbox is unchecked
    if (await authPage.agreeTermsCheckbox.isChecked()) {
      await authPage.agreeTermsCheckbox.uncheck();
    }

    // Assert submit button is disabled due to unchecked terms
    await expect(authPage.signupSubmitBtn).toBeDisabled();
  });

  test('duplicate email is blocked with generic message, no success screen', async ({ page }) => {
    const authPage = new AuthPage(page);
    const user = generateValidUser();

    // 1) First registration of this unique email
    await authPage.gotoSignupForm();
    await authPage.firstNameInput.fill(user.firstName);
    await authPage.lastNameInput.fill(user.lastName);
    await authPage.emailInput.fill(user.email);
    await authPage.mobileInput.fill(user.mobile);
    await authPage.passwordInput.fill(user.password);
    await authPage.confirmPasswordInput.fill(user.password);
    await authPage.agreeTermsCheckbox.check();
    
    await expect(authPage.signupSubmitBtn).toBeEnabled();
    await authPage.signupSubmitBtn.click();

    // Wait for registration to complete and redirect
    const onboardingHeading = page.getByRole('heading', { name: /Complete Your Profile/i }).first();
    const confirmEmailText = page.getByText(/Confirm your email/i).first();
    
    await expect.poll(async () => {
      const url = page.url();
      const hasOnboardingHeader = await onboardingHeading.isVisible().catch(() => false);
      const hasConfirmEmail = await confirmEmailText.isVisible().catch(() => false);
      return url.includes('/onboarding') || hasOnboardingHeader || hasConfirmEmail;
    }, { timeout: 20000 }).toBe(true);

    // 2) Clean cookies/storage to simulate another session
    await page.context().clearCookies().catch(() => {});
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {});

    // 3) Try to register the same user again
    await authPage.gotoSignupForm();
    await authPage.firstNameInput.fill(user.firstName);
    await authPage.lastNameInput.fill(user.lastName);
    await authPage.emailInput.fill(user.email);
    // Blur the email input to trigger the async validation check
    await authPage.emailInput.blur();

    await authPage.mobileInput.fill(user.mobile);
    await authPage.passwordInput.fill(user.password);
    await authPage.confirmPasswordInput.fill(user.password);
    await authPage.agreeTermsCheckbox.check();

    // Assert that the submit button becomes disabled and the inline error appears
    const duplicateInlineError = page.getByText(/This email can.*t be used for a new account/i).first();
    await expect(duplicateInlineError).toBeVisible({ timeout: 10000 });
    await expect(authPage.signupSubmitBtn).toBeDisabled();

    // 4) Assert success screen/onboarding redirect never occurred
    const successScreen = page.getByText(/Account Created Successfully/i).first();
    expect(await isElementVisible(successScreen, 2000)).toBe(false);

    // 5) Assert error message is non-enumerable (generic)
    const body = ((await page.locator('body').textContent().catch(() => '')) ?? '').toLowerCase();
    expect(body).not.toContain('email_exists');
    expect(body).not.toContain('user already registered');
  });
});
