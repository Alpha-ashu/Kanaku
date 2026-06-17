import { test, expect } from '@playwright/test';
import { USERS, screenshot, gotoApp } from './helpers';
import { AuthPage } from './pom/AuthPage';
import { AccountPage } from './pom/AccountPage';
import { TransactionPage } from './pom/TransactionPage';
import { LoanPage } from './pom/LoanPage';
import { GoalPage } from './pom/GoalPage';
import { TodoPage } from './pom/TodoPage';
import { AdvisorPage } from './pom/AdvisorPage';
import { RecurringPage } from './pom/RecurringPage';

// Generate a unique user so registration succeeds on every test run
const uniqueUser = {
  firstName: 'E2E',
  lastName: 'Tester',
  email: `e2e.tester.${Date.now()}.${Math.floor(Math.random() * 1000)}@Kanaku.app`,
  mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  password: 'TestKanaku@2026',
  persona: 'Power User'
};

test.describe('Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite', () => {
  test.setTimeout(240_000);

  test('01. Negative Validations - Sign In & Sign Up Errors', async ({ page }) => {
    const authPage = new AuthPage(page);

    // Case 1.1: Sign In with invalid credentials
    await authPage.gotoSigninForm();
    await authPage.signinEmailInput.first().fill(USERS.U1.email);
    await authPage.signinPasswordInput.first().fill('WrongPassword123');
    await authPage.signinSubmitBtn.first().click();
    await authPage.assertErrorMessageVisible(/invalid credentials|failed|incorrect/i);
    await authPage.screenshot('neg_01_invalid_signin');

    // Case 1.2: Sign Up with an email that is already registered
    await authPage.gotoSignupForm();
    await authPage.firstNameInput.first().fill('Arjun');
    await authPage.lastNameInput.first().fill('Sharma');
    await authPage.emailInput.first().fill(USERS.U1.email);
    await authPage.mobileInput.first().fill(USERS.U1.mobile);
    await authPage.passwordInput.first().fill(USERS.U1.password);
    await authPage.confirmPasswordInput.first().fill(USERS.U1.password);
    await authPage.agreeTermsCheckbox.first().check();
    await authPage.signupSubmitBtn.first().click();
    await authPage.assertErrorMessageVisible(/already registered|already.*email|phone.*already|already.*use/i);
    await authPage.screenshot('neg_02_duplicate_signup');
  });

  test('02. Positive Registration & Onboarding Flow', async ({ page }) => {
    const authPage = new AuthPage(page);

    // Register our fresh unique user
    const result = await authPage.registerViaUI(uniqueUser);
    expect(result).not.toBe('already_exists');

    await authPage.skipOnboarding();
    await authPage.assertAuthenticated();
    await authPage.screenshot('pos_03_registered_dashboard');
  });

  test('03. Account Creation & Invalid Numeric Validation', async ({ page }) => {
    // Log in with U1 for consistent data workspace
    const authPage = new AuthPage(page);
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    const accountPage = new AccountPage(page);
    await accountPage.navigateTo('account');
    await page.waitForTimeout(1000);

    // Case 3.1: Negative - empty account name
    await accountPage.clickAddAccount();
    await accountPage.selectType('bank');
    await accountPage.balanceInput.fill('50000');
    // Keep name empty
    await accountPage.customNameInput.fill('');
    await accountPage.saveAccountBtn.first().click();
    await accountPage.waitForToast('Enter an account name');
    await accountPage.screenshot('neg_04_empty_account_name');

    // Close Add Account form (navigate back or click discard)
    await accountPage.navigateTo('account');
    await page.waitForTimeout(500);

    // Case 3.2: Positive - Create Savings, Cash, and Credit Card accounts
    await accountPage.createAccount({
      type: 'bank',
      name: 'HDFC Savings Premium',
      institution: 'HDFC Bank',
      subtypeOrNetworkOrBrand: 'savings',
      balance: '120000',
      color: 'blue'
    });
    await accountPage.waitForToast('Account created');
    await accountPage.assertAccountExists('HDFC Savings Premium', '120000');

    await accountPage.createAccount({
      type: 'cash',
      name: 'Main Wallet Cash',
      balance: '15000',
      color: 'amber'
    });
    await accountPage.waitForToast('Account created');
    await accountPage.assertAccountExists('Main Wallet Cash', '15000');

    await accountPage.createAccount({
      type: 'card',
      name: 'ICICI Amazon Pay Card',
      institution: 'ICICI Bank',
      subtypeOrNetworkOrBrand: 'visa',
      balance: '0',
      color: 'emerald'
    });
    await accountPage.waitForToast('Account created');
    await accountPage.screenshot('pos_05_accounts_list');
  });

  test('04. Transactions, Double-Submit Prevention, and Direct DB Check', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    const txnPage = new TransactionPage(page);
    await txnPage.navigateTo('transaction');
    await page.waitForTimeout(1000);

    // Case 4.1: Negative - Zero/Empty amount validation
    await txnPage.clickAddTransaction();
    await txnPage.selectType('expense');
    await txnPage.amountInput.fill('0');
    await txnPage.saveTransactionBtn.first().click();
    await txnPage.waitForToast('Enter amount');
    await txnPage.screenshot('neg_06_zero_amount');
    
    await txnPage.navigateTo('transaction');
    await page.waitForTimeout(500);

    // Case 4.2: Positive - Add Salary Credit Income
    await txnPage.createIncome({
      amount: '95000',
      account: 'HDFC Savings Premium',
      category: 'Salary',
      notes: 'Monthly payout June 2026'
    });
    await txnPage.waitForToast('Transaction saved');
    await txnPage.assertTransactionInHistory('Monthly payout June 2026', '95000');

    // Case 4.3: Negative - Double-Submit Prevention toast
    await txnPage.clickAddTransaction();
    await txnPage.selectType('expense');
    await txnPage.fillAmount('450');
    await txnPage.selectAccount('HDFC Savings Premium');
    await txnPage.selectCategory('Food & Dining');
    await txnPage.fillNotes('Double Submit Test Item');
    
    // Save once
    await txnPage.saveTransactionBtn.first().click();
    await txnPage.waitForToast('Transaction saved');
    
    // Try saving immediate duplicate
    await txnPage.clickAddTransaction();
    await txnPage.selectType('expense');
    await txnPage.fillAmount('450');
    await txnPage.selectAccount('HDFC Savings Premium');
    await txnPage.selectCategory('Food & Dining');
    await txnPage.fillNotes('Double Submit Test Item');
    await txnPage.saveTransactionBtn.first().click();
    await txnPage.waitForToast('This transaction was recently saved. Duplicate prevented.');
    await txnPage.screenshot('neg_07_double_submit_prevented');

    // Case 4.4: Direct Dexie IndexedDB Evaluation
    await txnPage.navigateTo('dashboard');
    await page.waitForTimeout(1000);
    const dbAccounts = await page.evaluate(async () => {
      // Access the exposed Dexie db instance directly from the window
      return await (window as any).db.accounts.toArray();
    });
    expect(dbAccounts.length).toBeGreaterThan(0);
    console.log(`Verified DB state directly: found ${dbAccounts.length} accounts in Dexie.`);
  });

  test('05. Goals & Contribution Tracking', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    const goalPage = new GoalPage(page);
    await goalPage.navigateTo('goal');
    await page.waitForTimeout(1000);

    // Case 5.1: Positive - Create European Trip goal
    await goalPage.createGoal({
      name: 'Dream Europe Tour',
      targetAmount: '250000',
      targetDate: '2027-08-31'
    });
    await goalPage.assertGoalExists('Dream Europe Tour', '250000');

    // Case 5.2: Positive - Add Contribution
    await goalPage.clickGoal('Dream Europe Tour');
    await goalPage.addContribution('35000');
    
    const pageText = await page.textContent('body');
    expect(pageText).toContain('35,000');
    await goalPage.screenshot('pos_08_goal_contributed');
  });

  test('06. Todo List Planning & Team Split Share', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    const todoPage = new TodoPage(page);
    await todoPage.navigateTo('todo-lists');
    await page.waitForTimeout(1000);

    // Case 6.1: Positive - Create Personal List & Add Tasks
    await todoPage.createPersonalList('Rent Collection Checklist');
    await todoPage.assertListExists('Rent Collection Checklist');

    await todoPage.openList('Rent Collection Checklist');
    await todoPage.addTask('Contact flat 3B for rent');
    await todoPage.addTask('Send invoice receipt to flat 4A');
    await todoPage.assertTaskExists('Contact flat 3B for rent');

    // Case 6.2: Positive - Mark completed & toggle status
    await todoPage.toggleTaskCompletion();
    await todoPage.screenshot('pos_09_todo_completed');
  });

  test('07. Advisor Registration, Manager Compliance Review, and Approval', async ({ page }) => {
    const authPage = new AuthPage(page);
    
    // U1 registers as an advisor
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    const advisorPage = new AdvisorPage(page);
    await advisorPage.navigateTo('book-advisor');
    await page.waitForTimeout(1000);

    // U1 submits application
    await advisorPage.submitApplication({
      fullName: 'Arjun Financial Services',
      phone: '+91 9000000001',
      expertise: 'Tax planning & investments',
      experience: '7',
      bio: 'Fiduciary financial planner specializing in personal taxation and wealth growth.'
    });
    await advisorPage.waitForToast('Application submitted');
    await advisorPage.screenshot('pos_10_advisor_applied');

    // Logout U1
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Login U7 (Admin) to review and approve
    await authPage.loginViaAPI(USERS.U7);
    await authPage.skipOnboarding();
    
    // Navigate to Manager Compliance Review
    await advisorPage.navigateTo('advisor-verification');
    await page.waitForTimeout(1000);

    // Review and Approve Arjun
    await advisorPage.reviewAndApprove('Arjun Financial Services');
    await advisorPage.waitForToast('profile is now ACTIVE');
    await advisorPage.screenshot('pos_11_advisor_approved');
  });

  test('08. Recurring Liability Schedule Management', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    const recPage = new RecurringPage(page);
    await recPage.navigateTo('recurring-transactions');
    await page.waitForTimeout(1000);

    // Case 8.1: Positive - Create Rent Schedule
    await recPage.createSchedule({
      name: 'Office Space Rent',
      amount: '32000',
      type: 'expense',
      category: 'Rent & Housing',
      frequency: 'monthly',
      nextDueDate: '2026-07-01',
      accountName: 'HDFC Savings Premium'
    });
    await recPage.waitForToast('created');
    await recPage.assertScheduleExists('Office Space Rent', '32000');

    // Case 8.2: Positive - Pause and delete schedule
    await recPage.pauseSchedule('Office Space Rent');
    await recPage.waitForToast('paused');
    
    await recPage.deleteSchedule('Office Space Rent');
    await recPage.waitForToast('deleted');
    await recPage.screenshot('pos_12_recurring_deleted');
  });

  test('09. Regression - Add Loan Navigation & Redirection Bug', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    // Case 9.1: Quick Actions redirection regression test
    const quickAddButton = page.locator('[data-testid="nav-quick-add-button"]').first();
    await quickAddButton.waitFor({ state: 'visible', timeout: 5000 });
    await quickAddButton.click();
    await page.waitForTimeout(800);

    const loanActionBtn = page.locator('[data-testid="quickaction-add-loan-button"], button:has-text("Add Loan")').first();
    await loanActionBtn.click();
    await page.waitForTimeout(1500);

    // Verify correct redirection: Header title should read "New Borrowed Loan" (AddLoan page)
    const addLoanTitle = page.getByRole('heading', { name: /new borrowed loan/i }).first();
    await expect(addLoanTitle).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder*="HDFC Bank" i]')).toBeVisible(); // Check unique AddLoan field
    await page.screenshot('reg_13_quickaction_redirection');

    // Close and navigate back
    await page.locator('header button').first().click();
    await page.waitForTimeout(500);

    // Case 9.2: Dashboard loans button redirection check
    const loanPage = new LoanPage(page);
    await loanPage.navigateTo('loans');
    await page.waitForTimeout(1000);

    // Case 9.3: Principal and tenure negative checks
    await loanPage.clickAddLoan();
    await loanPage.lenderNameInput.fill('John Doe');
    await loanPage.amountInput.fill('0'); // zero principal amount
    await loanPage.saveLoanBtn.first().click();
    await loanPage.waitForToast('Principal amount must be greater than 0');
    await loanPage.screenshot('neg_14_zero_principal');

    await loanPage.amountInput.fill('150000');
    await loanPage.tenureMonthsInput.fill('0'); // zero tenure
    await loanPage.saveLoanBtn.first().click();
    await loanPage.waitForToast('Tenure must be greater than 0');
    await loanPage.screenshot('neg_15_zero_tenure');

    // Discard and retry with positive creation
    await loanPage.navigateTo('loans');
    await page.waitForTimeout(500);

    await loanPage.createLoan({
      lenderName: 'SBI Home Finance',
      principal: '800000',
      rate: '8.7',
      tenure: '24',
      account: 'HDFC Savings Premium',
      notes: 'Collateral house loan'
    });
    await loanPage.waitForToast('successfully');
    await loanPage.assertLoanExists('SBI Home Finance', '800000');
    await loanPage.screenshot('pos_16_loan_created');
  });

  test('10. Logout/Login Session Retention & State Check', async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    // Verify existing state is shown in UI
    const accountPage = new AccountPage(page);
    await accountPage.navigateTo('account');
    await page.waitForTimeout(1000);
    await accountPage.assertAccountExists('HDFC Savings Premium');

    // Logout
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // Confirm redirected to landing
    const loginCTA = page.getByRole('button', { name: /log in|sign in/i }).first();
    await expect(loginCTA).toBeVisible({ timeout: 5000 });

    // Log back in
    await authPage.loginViaAPI(USERS.U1);
    await authPage.skipOnboarding();

    // Check account balances are still present (persistence check)
    await accountPage.navigateTo('account');
    await page.waitForTimeout(1000);
    await accountPage.assertAccountExists('HDFC Savings Premium');
    await accountPage.screenshot('pos_17_persistence_check');
  });
});
