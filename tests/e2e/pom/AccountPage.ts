import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AccountPage extends BasePage {
  // Selectors
  readonly addAccountBtn: Locator;
  readonly balanceInput: Locator;
  readonly providerInput: Locator;
  readonly customNameInput: Locator;
  readonly saveAccountBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.addAccountBtn = page.getByRole('button', { name: /add account|new account|\+ account/i });
    this.balanceInput = page.locator('[data-testid="account-create-balance-input"]');
    this.providerInput = page.locator('[data-testid="account-create-provider-input"]');
    this.customNameInput = page.locator('[data-testid="account-create-name-input"]');
    this.saveAccountBtn = page.getByRole('button', { name: /create account/i });
  }

  async clickAddAccount() {
    await this.addAccountBtn.first().click();
    await this.wait(800);
  }

  async selectType(type: 'bank' | 'card' | 'cash' | 'wallet') {
    const btn = this.page.locator(`[data-testid="account-create-type-${type}-button"]`);
    await btn.first().click();
    await this.wait(500);
  }

  async selectSubtype(subtype: string) {
    const btn = this.page.locator(`[data-testid="account-create-subtype-${subtype}-button"]`);
    if (await btn.first().isVisible()) {
      await btn.first().click();
      await this.wait(500);
    }
  }

  async selectCardNetwork(network: string) {
    const btn = this.page.locator(`[data-testid="account-create-network-${network}-button"]`);
    if (await btn.first().isVisible()) {
      await btn.first().click();
      await this.wait(500);
    }
  }

  async selectWalletBrand(brand: string) {
    const btn = this.page.locator(`[data-testid="account-create-wallet-${brand.toLowerCase()}-button"]`);
    if (await btn.first().isVisible()) {
      await btn.first().click();
      await this.wait(500);
    }
  }

  async selectColor(colorId: string) {
    const btn = this.page.locator(`[data-testid="account-create-color-${colorId}-button"]`);
    if (await btn.first().isVisible()) {
      await btn.first().click();
      await this.wait(300);
    }
  }

  async selectInstitution(name: string) {
    // Click the SearchableDropdown trigger
    const dropdownTrigger = this.page.locator('div[role="combobox"]').first();
    await dropdownTrigger.click();
    await this.wait(300);

    // Fill search input inside the portal
    const searchInput = this.page.locator('#dropdown-portal-root input[type="text"]').first();
    await searchInput.fill(name);
    await this.wait(300);

    // Click the matching option
    const option = this.page.locator('#dropdown-portal-root button[role="option"]').filter({ hasText: new RegExp(name, 'i') }).first();
    await option.click();
    await this.wait(500);
  }

  async createAccount(options: {
    type: 'bank' | 'card' | 'cash' | 'wallet';
    balance: string;
    name?: string;
    institution?: string;
    subtypeOrNetworkOrBrand?: string;
    color?: string;
  }) {
    await this.clickAddAccount();
    await this.selectType(options.type);
    
    if (options.type === 'bank' || options.type === 'card') {
      if (options.institution) {
        await this.selectInstitution(options.institution);
      }
      if (options.subtypeOrNetworkOrBrand) {
        if (options.type === 'bank') {
          await this.selectSubtype(options.subtypeOrNetworkOrBrand);
        } else {
          await this.selectCardNetwork(options.subtypeOrNetworkOrBrand);
        }
      }
    } else if (options.type === 'wallet') {
      if (options.subtypeOrNetworkOrBrand) {
        await this.selectWalletBrand(options.subtypeOrNetworkOrBrand);
      }
    }

    if (options.name) {
      await this.customNameInput.fill(options.name);
    }

    if (options.color) {
      await this.selectColor(options.color);
    }

    await this.balanceInput.fill(options.balance);
    
    // Save account using FloatingSaveBar button
    await this.saveAccountBtn.first().click();
    await this.wait(2000);
  }

  async assertAccountExists(name: string, expectedBalance?: string) {
    const pageText = await this.page.textContent('body');
    expect(pageText, `Account ${name} should exist on the accounts page`).toContain(name);
    if (expectedBalance) {
      // Format number representation
      const formatted = Number(expectedBalance).toLocaleString();
      expect(pageText, `Account ${name} should have balance of ${expectedBalance}`).toContain(formatted);
    }
  }
}
