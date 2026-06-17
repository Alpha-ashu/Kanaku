import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { registerUser, loginUser, skipOnboardingIfPresent, isElementVisible, gotoApp } from '../helpers';

export class AuthPage extends BasePage {
  // Selectors
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly mobileInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly agreeTermsCheckbox: Locator;
  readonly signupSubmitBtn: Locator;

  readonly signinEmailInput: Locator;
  readonly signinPasswordInput: Locator;
  readonly signinSubmitBtn: Locator;

  constructor(page: Page) {
    super(page);
    // Signup form locators
    this.firstNameInput = page.locator('input[name="firstName"], input#firstName');
    this.lastNameInput = page.locator('input[name="lastName"], input#lastName');
    this.emailInput = page.locator('input[name="email"], input#email');
    this.mobileInput = page.locator('input[name="mobile"], input#mobile');
    this.passwordInput = page.locator('input[name="password"], input#password');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"], input#confirmPassword');
    this.agreeTermsCheckbox = page.locator('input#agreeToTerms, input[name="agreeToTerms"]');
    this.signupSubmitBtn = page.locator('[data-testid="auth-signup-submit-button"], button[type="submit"]');

    // Signin form locators
    this.signinEmailInput = page.locator('input[name="email"], input[type="email"]');
    this.signinPasswordInput = page.locator('input[name="password"], input[type="password"]');
    this.signinSubmitBtn = page.locator('[data-testid="auth-signin-submit-button"], button[type="submit"]');
  }

  async gotoWelcome() {
    await gotoApp(this.page);
    const getStarted = this.page.getByRole('button', { name: /get started/i }).first();
    if (await this.isVisible(getStarted, 5000)) {
      await getStarted.click();
      await this.wait(800);
    }
  }

  async gotoSignupForm() {
    await this.gotoWelcome();
    const createAccountCTA = this.page.getByRole('button', { name: /^create account$/i }).first();
    if (await this.isVisible(createAccountCTA, 3000)) {
      await createAccountCTA.click();
      await this.wait(800);
    }
  }

  async gotoSigninForm() {
    await this.gotoWelcome();
    const signinCTA = this.page.getByRole('button', { name: /log in|sign in/i }).first();
    if (await this.isVisible(signinCTA, 3000)) {
      await signinCTA.click();
      await this.wait(800);
    }
  }

  async registerViaUI(user: any) {
    return registerUser(this.page, user);
  }

  async loginViaAPI(user: any) {
    return loginUser(this.page, user);
  }

  async loginViaUI(email: string, password: string) {
    await this.gotoSigninForm();
    await this.signinEmailInput.first().fill(email);
    await this.signinPasswordInput.first().fill(password);
    await this.signinSubmitBtn.first().click();
    await this.wait(1500);
  }

  async skipOnboarding() {
    await skipOnboardingIfPresent(this.page);
  }

  async assertAuthenticated() {
    const isStillOnAuth = await this.firstNameInput.first().isVisible().catch(() => false);
    expect(isStillOnAuth, 'Should not be on auth page').toBe(false);
  }

  async assertErrorMessageVisible(messageRegex: RegExp) {
    const errorEl = this.page.getByText(messageRegex).first();
    await expect(errorEl).toBeVisible({ timeout: 5000 });
  }
}
