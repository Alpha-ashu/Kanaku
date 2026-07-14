import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class RecurringPage extends BasePage {
  // Selectors
  readonly toggleFormBtn: Locator;
  readonly nameInput: Locator;
  readonly amountInput: Locator;
  readonly typeSelect: Locator;
  readonly categoryInput: Locator;
  readonly frequencySelect: Locator;
  readonly nextDueDateInput: Locator;
  readonly accountSelect: Locator;
  readonly submitBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.toggleFormBtn = page.getByRole('button', { name: /Create Recurring|Close/i });
    this.nameInput = page.locator('[data-testid="recurring-form-name-input"]');
    this.amountInput = page.locator('[data-testid="recurring-form-amount-input"]');
    this.typeSelect = page.locator('[data-testid="recurring-form-type-select"]');
    this.categoryInput = page.locator('[data-testid="recurring-form-category-input"]');
    this.frequencySelect = page.locator('[data-testid="recurring-form-frequency-select"]');
    this.nextDueDateInput = page.locator('[data-testid="recurring-form-date-input"]');
    this.accountSelect = page.locator('[data-testid="recurring-form-account-select"]');
    this.submitBtn = page.locator('[data-testid="recurring-form-submit-button"]');
  }

  async clickToggleForm() {
    await this.toggleFormBtn.first().click();
    await this.wait(500);
  }

  async createSchedule(options: {
    name: string;
    amount: string;
    type: 'expense' | 'income' | 'transfer';
    category: string;
    frequency: 'weekly' | 'monthly' | 'yearly';
    nextDueDate: string;
    accountName: string;
  }) {
    // Open form if not open
    const isFormOpen = await this.nameInput.first().isVisible().catch(() => false);
    if (!isFormOpen) {
      await this.clickToggleForm();
    }

    await this.nameInput.first().fill(options.name);
    await this.amountInput.first().fill(options.amount);
    await this.typeSelect.first().selectOption(options.type);
    await this.categoryInput.first().fill(options.category);
    await this.frequencySelect.first().selectOption(options.frequency);
    await this.nextDueDateInput.first().fill(options.nextDueDate);

    // Select account
    if (await this.accountSelect.first().isVisible()) {
      // Find option containing the account name
      await this.accountSelect.first().selectOption({ label: options.accountName });
    }

    await this.submitBtn.first().click();
    await this.wait(2000);
  }

  async assertScheduleExists(name: string, amount?: string) {
    const pageText = await this.page.textContent('body');
    expect(pageText, `Recurring schedule "${name}" should exist`).toContain(name);
    if (amount) {
      const formatted = Number(amount).toLocaleString();
      expect(pageText, `Recurring schedule amount should show ${formatted}`).toContain(formatted);
    }
  }

  async pauseSchedule(name: string) {
    const card = this.page.locator('div, article, .card').filter({ hasText: name }).first();
    const pauseBtn = card.getByRole('button', { name: 'Pause' }).first();
    await pauseBtn.click();
    await this.wait(1000);
  }

  async deleteSchedule(name: string) {
    const card = this.page.locator('div, article, .card').filter({ hasText: name }).first();
    const deleteBtn = card.locator('button').filter({ has: this.page.locator('svg') }).last(); // Last button with icon inside card
    await deleteBtn.click();
    await this.wait(1500);
  }
}
