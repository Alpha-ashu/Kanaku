import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoanPage extends BasePage {
  // Selectors
  readonly addLoanBtn: Locator;
  readonly lenderNameInput: Locator;
  readonly amountInput: Locator;
  readonly interestRateInput: Locator;
  readonly tenureMonthsInput: Locator;
  readonly notesInput: Locator;
  readonly saveLoanBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.addLoanBtn = page.getByRole('button', { name: /add loan|new loan|\+ loan|add debt/i });
    this.lenderNameInput = page.locator('input[name="name"]');
    this.amountInput = page.locator('input[name="amount"]');
    this.interestRateInput = page.locator('input[name="rate"]');
    this.tenureMonthsInput = page.locator('input[type="number"]').nth(1); // Tenure input is second number input in grid
    this.notesInput = page.locator('textarea');
    this.saveLoanBtn = page.getByRole('button', { name: /create loan/i });
  }

  async clickAddLoan() {
    await this.addLoanBtn.first().click();
    await this.wait(800);
  }

  async createLoan(options: {
    lenderName: string;
    principal: string;
    rate: string;
    tenure: string;
    account: string;
    notes?: string;
  }) {
    await this.clickAddLoan();
    
    // Fill lender name
    await this.lenderNameInput.fill(options.lenderName);
    
    // Fill principal
    await this.amountInput.fill(options.principal);
    
    // Fill interest rate
    await this.interestRateInput.fill(options.rate);
    
    // Fill tenure
    // Find input by value or position. Let's find input following "rate" or the second number input.
    // The second number input in the DOM is tenureMonths.
    await this.tenureMonthsInput.fill(options.tenure);
    
    // Select disbursement account
    const dropdown = this.page.locator('div[role="combobox"]').first();
    await dropdown.click();
    await this.wait(300);

    const search = this.page.locator('#dropdown-portal-root input[type="text"]').first();
    await search.fill(options.account);
    await this.wait(300);

    const option = this.page.locator('#dropdown-portal-root button[role="option"]').filter({ hasText: new RegExp(options.account, 'i') }).first();
    await option.click();
    await this.wait(500);

    if (options.notes) {
      await this.notesInput.fill(options.notes);
    }

    // Save
    await this.saveLoanBtn.first().click();
    await this.wait(2000);
  }

  async assertLoanExists(name: string, principal?: string) {
    const pageText = await this.page.textContent('body');
    expect(pageText, `Loan "${name}" should exist in the list`).toContain(name);
    if (principal) {
      const formatted = Number(principal).toLocaleString();
      expect(pageText, `Loan principal should show ${formatted}`).toContain(formatted);
    }
  }
}
