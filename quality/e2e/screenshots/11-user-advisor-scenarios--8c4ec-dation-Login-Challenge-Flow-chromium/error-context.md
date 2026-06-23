# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 11-user-advisor-scenarios.spec.ts >> Kanaku User Role Scenario-Level Testing Suite >> US-01 & US-02: User Registration, Validation & Login Challenge Flow
- Location: quality\e2e\11-user-advisor-scenarios.spec.ts:39:3

# Error details

```
Error: expect(received).not.toBe(expected) // Object.is equality

Expected: not "already_exists"
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner:
      - generic [ref=e4]:
        - generic [ref=e5] [cursor=pointer]:
          - img [ref=e7]
          - generic [ref=e13]: KANAKU
        - navigation [ref=e14]:
          - button "Home" [ref=e15]
          - button "About" [ref=e16]
          - button "Features" [ref=e17]
          - button "Pricing" [ref=e18]
          - button "Privacy" [ref=e19]
          - button "Terms" [ref=e20]
          - button "Support" [ref=e21]
        - generic [ref=e22]:
          - button "Log In" [ref=e23]
          - button "Get Started" [ref=e24]
    - generic [ref=e25]:
      - generic [ref=e27]:
        - button "← Back" [ref=e28]:
          - generic [ref=e29]: ←
          - text: Back
        - heading "Create Account" [level=2] [ref=e30]
        - paragraph [ref=e31]: Join KANAKU to start mastering your wealth.
      - generic [ref=e33]:
        - generic [ref=e35]:
          - generic [ref=e36]: Account Setup
          - generic [ref=e37]: 100%
        - generic [ref=e40]:
          - generic [ref=e41]:
            - generic:
              - img
            - textbox "First Name" [disabled] [ref=e42]:
              - /placeholder: " "
              - text: Test
            - generic: First Name
            - generic:
              - img
          - generic [ref=e43]:
            - generic:
              - img
            - textbox "Last Name" [disabled] [ref=e44]:
              - /placeholder: " "
              - text: One
            - generic: Last Name
            - generic:
              - img
        - generic [ref=e45]:
          - generic:
            - img
          - textbox "Email Address" [disabled] [ref=e46]:
            - /placeholder: " "
            - text: qa.test1.1782226665327.2867@kanaku.test
          - generic: Email Address
          - generic:
            - img
        - generic [ref=e47]:
          - generic:
            - img
            - combobox "Country code" [disabled] [ref=e49] [cursor=pointer]:
              - option "+91" [selected]
              - option "+1"
              - option "+44"
              - option "+971"
              - option "+65"
              - option "+61"
          - textbox "Mobile Number" [disabled] [ref=e50]:
            - /placeholder: " "
            - text: 99836 06225
          - generic: Mobile Number
          - generic:
            - img
        - generic [ref=e51]:
          - generic [ref=e52]:
            - generic:
              - img
            - textbox "Password" [disabled] [ref=e53]:
              - /placeholder: " "
              - text: StrongPassword@2026
            - generic: Password
            - button [ref=e54]:
              - img [ref=e55]
          - generic [ref=e58]:
            - button "Suggest a strong password" [ref=e59]:
              - img [ref=e60]
              - text: Suggest a strong password
            - generic [ref=e62]: Strong
          - generic [ref=e68]:
            - generic [ref=e69]: Password Check
            - generic [ref=e70]:
              - generic [ref=e71]:
                - img [ref=e73]
                - generic [ref=e75]: Min 8 characters
              - generic [ref=e76]:
                - img [ref=e78]
                - generic [ref=e80]: Uppercase letter
              - generic [ref=e81]:
                - img [ref=e83]
                - generic [ref=e85]: Lowercase letter
              - generic [ref=e86]:
                - img [ref=e88]
                - generic [ref=e90]: Number (0-9)
              - generic [ref=e91]:
                - img [ref=e93]
                - generic [ref=e95]: Special character (!@#$ etc.)
        - generic [ref=e96]:
          - generic:
            - img
          - textbox "Confirm Password" [disabled] [ref=e97]:
            - /placeholder: " "
            - text: StrongPassword@2026
          - generic: Confirm Password
          - generic:
            - img
          - button [ref=e98]:
            - img [ref=e99]
        - generic [ref=e102]:
          - checkbox "I agree to the Terms of Service and Privacy Policy" [checked] [disabled] [ref=e103] [cursor=pointer]
          - generic [ref=e104] [cursor=pointer]:
            - text: I agree to the
            - button "Terms of Service" [ref=e105]
            - text: and
            - button "Privacy Policy" [ref=e106]
        - button "Creating account..." [disabled] [ref=e107]: Creating account...
        - paragraph [ref=e109]:
          - text: Already have an account?
          - button "Sign in" [ref=e110]
  - region "Notifications alt+T"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { USERS, gotoApp, screenshot, loginUser, registerUser } from './helpers';
  3   | import { uniqueUiUser } from './test-data';
  4   | import { AuthPage } from './pom/AuthPage';
  5   | import { AccountPage } from './pom/AccountPage';
  6   | import { TransactionPage } from './pom/TransactionPage';
  7   | import { GoalPage } from './pom/GoalPage';
  8   | import { LoanPage } from './pom/LoanPage';
  9   | import { TodoPage } from './pom/TodoPage';
  10  | import { AdvisorPage } from './pom/AdvisorPage';
  11  | 
  12  | // Multiple datasets for User and Advisor testing
  13  | const USER_SIGNUP_DATASETS = [
  14  |   {
  15  |     id: "dataset_user_1",
  16  |     firstName: "Test",
  17  |     lastName: "One",
  18  |     email: `qa.test1.${Date.now()}@kanaku.test`,
  19  |     mobile: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
  20  |     password: "StrongPassword@2026",
  21  |     persona: "Goal Setter"
  22  |   }
  23  | ];
  24  | 
  25  | const ADVISOR_APP_DATASETS = [
  26  |   {
  27  |     id: "advisor_app_1",
  28  |     fullName: "Arjun Tax Services",
  29  |     phone: "+91 9000000010",
  30  |     expertise: "Personal Income Tax & GST",
  31  |     experience: "8",
  32  |     bio: "Fiduciary tax advisor. Helps individuals file tax returns and maximize rebates."
  33  |   }
  34  | ];
  35  | 
  36  | test.describe('Kanaku User Role Scenario-Level Testing Suite', () => {
  37  |   test.setTimeout(180_000);
  38  | 
  39  |   test('US-01 & US-02: User Registration, Validation & Login Challenge Flow', async ({ page }) => {
  40  |     const authPage = new AuthPage(page);
  41  | 
  42  |     // Scenario 1: Negative Registration Case (Mismatch Password)
  43  |     await authPage.gotoSignupForm();
  44  |     await authPage.firstNameInput.first().fill('Invalid');
  45  |     await authPage.lastNameInput.first().fill('User');
  46  |     await authPage.emailInput.first().fill('invalid.pw.test@kanaku.test');
  47  |     await authPage.mobileInput.first().fill('9876543210');
  48  |     await authPage.passwordInput.first().fill('Password@123');
  49  |     await authPage.confirmPasswordInput.first().fill('Different@123');
  50  |     await authPage.agreeTermsCheckbox.first().check();
  51  |     
  52  |     // Verify signup button is disabled due to password mismatch
  53  |     await expect(authPage.signupSubmitBtn.first()).toBeDisabled();
  54  |     await screenshot(page, 'us_01_registration_password_mismatch');
  55  | 
  56  |     // Scenario 2: Positive Registration Case
  57  |     const user1 = {
  58  |       ...USER_SIGNUP_DATASETS[0],
  59  |       email: `qa.test1.${Date.now()}.${Math.floor(Math.random() * 10000)}@kanaku.test`,
  60  |       mobile: `9${Math.floor(100000000 + Math.random() * 899999999)}`
  61  |     };
  62  |     const result1 = await authPage.registerViaUI(user1);
> 63  |     expect(result1).not.toBe('already_exists');
      |                         ^ Error: expect(received).not.toBe(expected) // Object.is equality
  64  |     await authPage.skipOnboarding();
  65  |     await authPage.assertAuthenticated();
  66  |     await screenshot(page, 'us_01_registration_success');
  67  | 
  68  |     // Logout safely (guaranteeing we are on localhost:9002 origin)
  69  |     await page.goto('http://localhost:9002');
  70  |     await page.evaluate(() => {
  71  |       localStorage.clear();
  72  |       sessionStorage.clear();
  73  |     });
  74  | 
  75  |     // Scenario 3: Negative Login Case (Wrong password)
  76  |     await authPage.gotoSigninForm();
  77  |     await authPage.signinEmailInput.first().fill(USERS.U1.email);
  78  |     await authPage.signinPasswordInput.first().fill('WrongPassword123');
  79  |     await authPage.signinSubmitBtn.first().click();
  80  |     await authPage.assertErrorMessageVisible(/invalid email or password|invalid credentials|failed|incorrect/i);
  81  |     await screenshot(page, 'us_02_login_failure');
  82  |   });
  83  | 
  84  |   test('US-03 to US-10: Complete User Financial Lifecycle Flow', async ({ page }) => {
  85  |     const authPage = new AuthPage(page);
  86  |     
  87  |     // Log in U1 via API once
  88  |     await authPage.loginViaAPI(USERS.U1);
  89  |     await authPage.skipOnboarding();
  90  |     await authPage.assertAuthenticated();
  91  | 
  92  |     // --- US-03: Account Setup & Ingestion ---
  93  |     const accountPage = new AccountPage(page);
  94  |     await accountPage.navigateTo('account');
  95  |     await page.waitForTimeout(1000);
  96  | 
  97  |     // Dataset 1: Savings Account
  98  |     await accountPage.createAccount({
  99  |       type: 'bank',
  100 |       name: 'E2E HDFC Savings',
  101 |       institution: 'HDFC Bank',
  102 |       subtypeOrNetworkOrBrand: 'savings',
  103 |       balance: '150000',
  104 |       color: 'blue'
  105 |     });
  106 |     await accountPage.waitForToast('Account created');
  107 |     await accountPage.assertAccountExists('E2E HDFC Savings', '150000');
  108 | 
  109 |     // Dataset 2: Cash Wallet
  110 |     await accountPage.createAccount({
  111 |       type: 'cash',
  112 |       name: 'E2E Cash Wallet',
  113 |       balance: '8500',
  114 |       color: 'slate'
  115 |     });
  116 |     await accountPage.waitForToast('Account created');
  117 |     await accountPage.assertAccountExists('E2E Cash Wallet', '8500');
  118 |     await screenshot(page, 'us_03_accounts_created');
  119 | 
  120 |     // --- US-04 & US-05: Income/Expense Logs and Transfers ---
  121 |     const txnPage = new TransactionPage(page);
  122 |     await txnPage.navigateTo('transaction');
  123 |     await page.waitForTimeout(1000);
  124 | 
  125 |     // Expense Log
  126 |     await txnPage.clickAddTransaction();
  127 |     await txnPage.selectType('expense');
  128 |     await txnPage.fillAmount('1200');
  129 |     await txnPage.selectAccount('Savings Account');
  130 |     await txnPage.selectCategory('Food & Dining');
  131 |     await txnPage.fillNotes('E2E Test Lunch Expense');
  132 |     await txnPage.saveTransactionBtn.first().click();
  133 |     await txnPage.waitForToast('Transaction saved');
  134 | 
  135 |     // Income Log
  136 |     await txnPage.createIncome({
  137 |       amount: '50000',
  138 |       account: 'Savings Account',
  139 |       category: 'Salary',
  140 |       notes: 'E2E Test Bonus Credit'
  141 |     });
  142 |     await txnPage.waitForToast('Transaction saved');
  143 |     await txnPage.assertTransactionInHistory('E2E Test Bonus Credit', '50000');
  144 | 
  145 |     // Transfer Verification
  146 |     await txnPage.clickAddTransaction();
  147 |     await txnPage.selectType('transfer');
  148 |     await txnPage.fillAmount('3000');
  149 |     // Select Source Account
  150 |     await page.locator('div[role="combobox"]').first().click();
  151 |     await page.locator('#dropdown-portal-root button[role="option"]').filter({ hasText: /Savings Account/i }).first().click();
  152 |     await page.waitForTimeout(300);
  153 |     // Select Destination Account
  154 |     await page.locator('div[role="combobox"]').nth(1).click();
  155 |     await page.locator('#dropdown-portal-root button[role="option"]').filter({ hasText: /Savings Account/i }).first().click();
  156 |     await page.waitForTimeout(300);
  157 |     await txnPage.fillNotes('E2E Self Account Sync Transfer');
  158 |     await txnPage.saveTransactionBtn.first().click();
  159 |     await txnPage.waitForToast(/saved|success/i);
  160 |     await screenshot(page, 'us_04_us_05_transactions_completed');
  161 | 
  162 |     // --- US-06: Goal Setting & Contributions ---
  163 |     const goalPage = new GoalPage(page);
```