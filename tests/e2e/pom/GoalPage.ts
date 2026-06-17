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
    this.addGoalBtn = page.getByRole('button', { name: /add goal|new goal|\+ goal|create goal/i });
    this.nameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="goal" i], input[placeholder*="name" i]');
    this.targetAmountInput = page.locator('input[name="targetAmount"], input[name="target"], input[name="amount"]');
    this.targetDateInput = page.locator('input[name="deadline"], input[name="targetDate"], input[name="dueDate"], input[type="date"]');
    this.saveGoalBtn = page.locator('button:not([disabled])').filter({ hasText: /save|create|add|confirm/i });
  }

  async clickAddGoal() {
    await this.addGoalBtn.first().click();
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
    await this.saveGoalBtn.last().click();
    await this.wait(2000);
  }

  async clickGoal(name: string) {
    const goalEl = this.page.getByText(name, { exact: false }).first();
    await goalEl.click();
    await this.wait(800);
  }

  async addContribution(amount: string) {
    const addContribBtn = this.page.getByRole('button', { name: /add contribution|contribute|add savings|deposit/i }).first();
    await addContribBtn.click();
    await this.wait(500);

    const amtInput = this.page.locator('input[name="amount"], input[type="number"], input[placeholder*="amount" i]').first();
    await amtInput.fill(amount);

    const saveBtn = this.page.locator('button:not([disabled])').filter({ hasText: /save|add|confirm/i }).last();
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
