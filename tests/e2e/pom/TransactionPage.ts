import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class TransactionPage extends BasePage {
  // Selectors
  readonly addTransactionBtn: Locator;
  readonly amountInput: Locator;
  readonly payeeInput: Locator;
  readonly notesTextarea: Locator;
  readonly saveTransactionBtn: Locator;
  readonly backBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.addTransactionBtn = page.getByRole('button', { name: /add transaction|new transaction|\+ transaction/i });
    this.amountInput = page.locator('[data-testid="transaction-amount-input"]');
    this.payeeInput = page.locator('[data-testid="transaction-recipient-input"]');
    this.notesTextarea = page.locator('[data-testid="transaction-notes-textarea"]');
    this.saveTransactionBtn = page.getByRole('button', { name: /save transaction/i });
    this.backBtn = page.locator('[data-testid="transaction-back-button"]');
  }

  async clickAddTransaction() {
    // If the floating action button (FAB) or normal add transaction button is visible
    const floatBtn = this.page.locator('[class*="fab"], [class*="float"]').first();
    if (await this.addTransactionBtn.first().isVisible()) {
      await this.addTransactionBtn.first().click();
    } else if (await floatBtn.isVisible()) {
      await floatBtn.click();
    } else {
      throw new Error('Could not find Add Transaction button');
    }
    await this.wait(800);
  }

  async selectType(type: 'expense' | 'income' | 'transfer') {
    const tab = this.page.locator(`[data-testid="transaction-type-${type}-tab"]`);
    await tab.first().click();
    await this.wait(500);
  }

  async selectExpenseMode(mode: 'individual' | 'group' | 'loan') {
    const btn = this.page.locator(`[data-testid="transaction-expense-mode-${mode}-button"]`);
    if (await btn.first().isVisible()) {
      await btn.first().click();
      await this.wait(500);
    }
  }

  async selectAccount(accountName: string) {
    // Click SearchableDropdown for Account
    // Account dropdown is the first searchable dropdown or has placeholder "Account"
    const dropdown = this.page.locator('div[role="combobox"]').first();
    await dropdown.click();
    await this.wait(300);

    // Search and select
    const search = this.page.locator('#dropdown-portal-root input[type="text"]').first();
    await search.fill(accountName);
    await this.wait(300);

    const option = this.page.locator('#dropdown-portal-root button[role="option"]').filter({ hasText: new RegExp(accountName, 'i') }).first();
    await option.click();
    await this.wait(500);
  }

  async selectCategory(categoryName: string) {
    // Categories are rendered in a horizontal grid/carousel
    // Look for a div or button that has category text or contains the category name.
    // Since CategoryGrid has pages, let's locate the element. If it's not visible, we can try paging
    const item = this.page.locator('div').filter({ hasText: new RegExp('^' + categoryName + '$', 'i') }).first();
    if (await item.isVisible()) {
      await item.click();
      await this.wait(300);
      return;
    }

    // Try paging in the CategoryGrid
    const dots = await this.page.locator('button[aria-label*="Go to page"]').all();
    for (const dot of dots) {
      await dot.click();
      await this.wait(400);
      if (await item.isVisible()) {
        await item.click();
        await this.wait(300);
        return;
      }
    }

    // Direct click fallback
    const textLoc = this.page.getByText(categoryName, { exact: false }).first();
    await textLoc.click({ force: true });
    await this.wait(300);
  }

  async fillAmount(amount: string) {
    await this.amountInput.fill(amount);
  }

  async fillNotes(notes: string) {
    await this.notesTextarea.fill(notes);
  }

  async save() {
    await this.saveTransactionBtn.first().click();
    await this.wait(2000);
  }

  async createExpense(options: {
    amount: string;
    account: string;
    category: string;
    notes?: string;
    mode?: 'individual' | 'group' | 'loan';
  }) {
    await this.clickAddTransaction();
    await this.selectType('expense');
    if (options.mode) {
      await this.selectExpenseMode(options.mode);
    }
    await this.fillAmount(options.amount);
    await this.selectAccount(options.account);
    await this.selectCategory(options.category);
    if (options.notes) {
      await this.fillNotes(options.notes);
    }
    await this.save();
  }

  async createIncome(options: {
    amount: string;
    account: string;
    category: string;
    notes?: string;
  }) {
    await this.clickAddTransaction();
    await this.selectType('income');
    await this.fillAmount(options.amount);
    await this.selectAccount(options.account);
    await this.selectCategory(options.category);
    if (options.notes) {
      await this.fillNotes(options.notes);
    }
    await this.save();
  }

  async assertTransactionInHistory(description: string, amount: string) {
    const pageText = await this.page.textContent('body');
    expect(pageText, `Transaction "${description}" should exist in history`).toContain(description);
    // Format amount representation
    const formatted = Number(amount).toLocaleString();
    expect(pageText, `Transaction should display amount of ${amount}`).toContain(formatted);
  }
}
