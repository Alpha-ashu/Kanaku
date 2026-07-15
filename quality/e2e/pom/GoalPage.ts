import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class GoalPage extends BasePage {
  // Selectors
  readonly addGoalBtn: Locator;
  readonly nameInput: Locator;
  readonly targetAmountInput: Locator;
  readonly targetDateInput: Locator;
  readonly saveGoalBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.addGoalBtn = page.locator('[data-testid="goals-add-goal-button"]');
    this.nameInput = page.locator('[data-testid="goals-create-name-input"]');
    this.targetAmountInput = page.locator('[data-testid="goals-create-target-amount-input"]');
    this.targetDateInput = page.locator('[data-testid="goals-create-target-date-input"]');
    this.saveGoalBtn = page.locator('[data-testid="goals-create-save-button"]');
  }

  async clickAddGoal() {
    const btn = this.addGoalBtn.first();
    await btn.waitFor({ state: 'visible', timeout: 15000 });
    try {
      await btn.click();
    } catch (e) {
      // Retry in case element was detached due to React re-render
      await this.page.waitForTimeout(1000);
      await this.addGoalBtn.first().click();
    }
    await this.wait(800);
  }

  async createGoal(options: {
    name: string;
    targetAmount: string;
    targetDate: string;
  }) {
    await this.clickAddGoal();
    await this.nameInput.first().fill(options.name);
    await this.targetAmountInput.first().fill(options.targetAmount);
    await this.targetDateInput.first().fill(options.targetDate);
    await this.saveGoalBtn.first().click();
    await this.wait(2000);
  }

  async clickGoal(name: string) {
    const card = this.page.locator('div, [data-testid*="card"]').filter({ hasText: name }).first();
    const viewDetailsBtn = card.getByRole('button', { name: /view details/i }).first();
    await viewDetailsBtn.click();
    await this.wait(1000);
  }

  async addContribution(amount: string, accountName?: string) {
    const amtInput = this.page.locator('[data-testid="goals-detail-amount-input"]').first();
    await amtInput.fill(amount);

    if (accountName) {
      const select = this.page.locator('[data-testid="goals-detail-account-select"]').first();
      await select.selectOption({ label: accountName });
      await this.wait(400);
    }

    const saveBtn = this.page.locator('[data-testid="goals-detail-submit-button"]').first();
    await saveBtn.click();
    await this.wait(2000);
  }

  async assertGoalExists(name: string, targetAmount?: string) {
    const pageText = await this.page.textContent('body');
    expect(pageText, `Goal "${name}" should exist in the goals list`).toContain(name);
    if (targetAmount) {
      const formatted = Number(targetAmount).toLocaleString();
      expect(pageText, `Goal target amount should show ${formatted}`).toContain(formatted);
    }
  }
}
