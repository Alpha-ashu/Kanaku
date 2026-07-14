# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 09-pom-regression.spec.ts >> Kanaku/Finora - Comprehensive Playwright POM & Regression Test Suite >> 09. Regression - Add Loan Navigation & Redirection Bug
- Location: quality\e2e\09-pom-regression.spec.ts:321:3

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="quickaction-add-loan-button"], button:has-text("Add Loan")').first()

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e5]:
      - banner [ref=e6]:
        - generic [ref=e7]:
          - generic [ref=e8]:
            - button "Open navigation menu" [ref=e9]:
              - img [ref=e10]
            - generic [ref=e11]:
              - img [ref=e12]
              - generic [ref=e18]: KANAKU
          - generic [ref=e19]:
            - button "Search" [ref=e20]:
              - img [ref=e21]
            - button "Notifications" [ref=e24]:
              - img [ref=e25]
            - button "User profile" [ref=e28]:
              - generic [ref=e29]: U
      - main [ref=e30]:
        - generic [ref=e34]:
          - generic [ref=e37]:
            - heading "DashBoard" [level=1] [ref=e39]
            - generic [ref=e42]:
              - button "Daily" [ref=e43]:
                - generic [ref=e44]: Daily
              - button "Weekly" [ref=e45]:
                - generic [ref=e46]: Weekly
              - button "Monthly" [ref=e47]:
                - generic [ref=e49]: Monthly
              - button "Yearly" [ref=e50]:
                - generic [ref=e51]: Yearly
          - generic [ref=e53]:
            - generic [ref=e54]:
              - generic [ref=e55]:
                - img [ref=e57]
                - generic [ref=e67]:
                  - paragraph [ref=e68]: AI Insights
                  - paragraph [ref=e69]: Powered by KANAKUIntelligence
              - generic [ref=e70]: 83/100
            - generic [ref=e71]:
              - generic [ref=e72]:
                - img [ref=e74]
                - generic [ref=e77]:
                  - paragraph [ref=e78]: Consider SIP Investment
                  - paragraph [ref=e79]: You have 189550 surplus this month. Consider starting a SIP of 56865 in a mutual fund.
                - img [ref=e80]
              - generic [ref=e82]:
                - img [ref=e84]
                - generic [ref=e87]:
                  - paragraph [ref=e88]: FD Opportunity
                  - paragraph [ref=e89]: With your surplus, a short-term Fixed Deposit (6-12 months) could earn 6-7% returns.
          - generic [ref=e92]:
            - paragraph [ref=e93]: Total Net Worth
            - heading "₹2,30,000" [level=2] [ref=e94]
            - generic [ref=e95]:
              - generic [ref=e96]:
                - generic [ref=e97]:
                  - img [ref=e98]
                  - generic [ref=e101]: Income
                - paragraph [ref=e102]: ₹0
              - generic [ref=e103]:
                - generic [ref=e104]:
                  - img [ref=e105]
                  - generic [ref=e108]: Expense
                - paragraph [ref=e109]: ₹0
          - generic [ref=e111]:
            - button "All Assets" [ref=e112]:
              - generic [ref=e114]:
                - img [ref=e115]
                - generic [ref=e118]: All Assets
            - button [ref=e119]:
              - img [ref=e121]
            - button [ref=e123]:
              - img [ref=e125]
            - button [ref=e127]:
              - img [ref=e129]
            - button [ref=e132]:
              - img [ref=e134]
          - generic [ref=e137]:
            - generic [ref=e138]:
              - heading "Accounts" [level=3] [ref=e139]
              - button "View All" [ref=e140]:
                - text: View All
                - img [ref=e141]
            - generic [ref=e143]:
              - generic [ref=e147] [cursor=pointer]:
                - generic [ref=e149]:
                  - img [ref=e151]
                  - img [ref=e155]:
                    - generic [ref=e157]: ICICI
                    - generic [ref=e158]: BANK
                - generic [ref=e159]:
                  - heading "ICICI Amazon Pay Card" [level=4] [ref=e160]
                  - generic [ref=e161]:
                    - paragraph [ref=e162]: ₹0
                    - paragraph [ref=e164]: card
                - generic [ref=e170]: INR
              - generic [ref=e174] [cursor=pointer]:
                - generic [ref=e176]:
                  - img [ref=e178]
                  - generic [ref=e183]: MW
                - generic [ref=e184]:
                  - heading "Main Wallet Cash" [level=4] [ref=e185]
                  - generic [ref=e186]:
                    - paragraph [ref=e187]: ₹15,000
                    - paragraph [ref=e189]: cash
                - generic [ref=e195]: INR
              - generic [ref=e199] [cursor=pointer]:
                - generic [ref=e201]:
                  - img [ref=e203]
                  - img [ref=e207]:
                    - generic [ref=e209]: HDFC
                    - generic [ref=e210]: BANK
                - generic [ref=e211]:
                  - heading "HDFC Savings Premium" [level=4] [ref=e212]
                  - generic [ref=e213]:
                    - paragraph [ref=e214]: ₹1,20,000
                    - paragraph [ref=e216]: bank
                - generic [ref=e222]: INR
              - generic [ref=e226] [cursor=pointer]:
                - generic [ref=e228]:
                  - img [ref=e230]
                  - img [ref=e234]:
                    - generic [ref=e236]: SBI
                    - generic [ref=e237]: State Bank
                - generic [ref=e238]:
                  - heading "SBI Savings Account" [level=4] [ref=e239]
                  - generic [ref=e240]:
                    - paragraph [ref=e241]: ₹45,000
                    - paragraph [ref=e243]: bank
                - generic [ref=e249]: INR
              - generic [ref=e253] [cursor=pointer]:
                - generic [ref=e255]:
                  - img [ref=e257]
                  - generic [ref=e261]: SA
                - generic [ref=e262]:
                  - heading "Savings Account" [level=4] [ref=e263]
                  - generic [ref=e264]:
                    - paragraph [ref=e265]: ₹50,000
                    - paragraph [ref=e267]: bank
                - generic [ref=e273]: INR
          - generic [ref=e274]:
            - generic [ref=e275]:
              - heading "Recent Transactions" [level=3] [ref=e276]
              - button "View All" [ref=e277]:
                - text: View All
                - img [ref=e278]
            - generic [ref=e281] [cursor=pointer]:
              - img [ref=e282]
              - paragraph [ref=e284]: No transactions - tap to add your first
          - generic [ref=e285]:
            - generic [ref=e286]:
              - heading "Loans & EMI" [level=3] [ref=e287]
              - button "View All" [ref=e288]:
                - text: View All
                - img [ref=e289]
            - generic [ref=e292] [cursor=pointer]:
              - img [ref=e293]
              - paragraph [ref=e295]: No active loans - click to manage
          - generic [ref=e296]:
            - generic [ref=e297]:
              - heading "Upcoming Events" [level=3] [ref=e298]
              - button "View Calendar" [ref=e299]:
                - text: View Calendar
                - img [ref=e300]
            - generic [ref=e303] [cursor=pointer]:
              - img [ref=e304]
              - paragraph [ref=e306]: No upcoming events this month
              - paragraph [ref=e307]: EMI due dates and bills appear here
          - generic [ref=e308]:
            - generic [ref=e309]:
              - heading "Borrow, Lend & Groups" [level=3] [ref=e310]
              - button "View All" [ref=e311]:
                - text: View All
                - img [ref=e312]
            - generic [ref=e315] [cursor=pointer]:
              - img [ref=e316]
              - paragraph [ref=e321]: No group expenses or borrow/lend records
          - generic [ref=e322]:
            - generic [ref=e323]:
              - heading "Investments" [level=3] [ref=e324]
              - button "View All" [ref=e325]:
                - text: View All
                - img [ref=e326]
            - generic [ref=e329] [cursor=pointer]:
              - img [ref=e330]
              - paragraph [ref=e332]: No investments added yet - click to add
    - generic:
      - navigation:
        - generic [ref=e333]:
          - button "Home" [ref=e334]:
            - img [ref=e336]
          - button "Accounts" [ref=e341]:
            - img [ref=e342]
          - button "Activity" [ref=e345]:
            - img [ref=e346]
          - button "Quick Add" [active] [ref=e349]:
            - img [ref=e350]
          - button "Goals" [ref=e351]:
            - img [ref=e352]
          - button "Invest" [ref=e356]:
            - img [ref=e357]
          - button "Reports" [ref=e360]:
            - img [ref=e361]
    - generic [ref=e364]:
      - generic [ref=e367]:
        - generic [ref=e368]:
          - heading "Quick Actions" [level=3] [ref=e369]
          - paragraph [ref=e370]: What would you like to do?
        - button "Close quick actions" [ref=e371]:
          - img [ref=e372]
      - generic [ref=e376]:
        - button "Expense" [ref=e377]:
          - img [ref=e379]
          - generic [ref=e387]: Expense
        - button "Income" [ref=e388]:
          - img [ref=e390]:
            - generic [ref=e394]: $
          - generic [ref=e396]: Income
        - button "Account" [ref=e397]:
          - img [ref=e399]
          - generic [ref=e406]: Account
        - button "Transfer" [ref=e407]:
          - img [ref=e409]
          - generic [ref=e415]: Transfer
        - button "Split" [ref=e416]:
          - img [ref=e418]
          - generic [ref=e426]: Split
        - button "New Goal" [ref=e427]:
          - img [ref=e429]
          - generic [ref=e436]: New Goal
        - button "Todo" [ref=e437]:
          - img [ref=e439]
          - generic [ref=e446]: Todo
        - button "Calendar" [ref=e447]:
          - img [ref=e449]
          - generic [ref=e458]: Calendar
        - button "Voice" [ref=e459]:
          - img [ref=e461]
          - generic [ref=e467]: Voice
  - region "Notifications alt+T"
```

# Test source

```ts
  236 |     await todoPage.screenshot('pos_09_todo_completed');
  237 |   });
  238 | 
  239 |   test('07. Advisor Registration, Manager Compliance Review, and Approval', async ({ page }) => {
  240 |     const authPage = new AuthPage(page);
  241 |     
  242 |     // Register a fresh unique user dynamically for advisor application to prevent retry pollution
  243 |     const uniqueAdvisor = {
  244 |       firstName: 'Arjun',
  245 |       lastName: 'Advisor',
  246 |       email: `arjun.advisor.${Date.now()}.${Math.floor(Math.random() * 10000)}@Kanaku.app`,
  247 |       mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
  248 |       password: process.env.SEED_TEST_PASSWORD || 'example-Test-password-123!',
  249 |       persona: 'Power User'
  250 |     };
  251 |     await authPage.registerViaUI(uniqueAdvisor);
  252 |     await authPage.skipOnboarding();
  253 | 
  254 |     const advisorPage = new AdvisorPage(page);
  255 |     await advisorPage.navigateTo('book-advisor');
  256 |     await page.waitForTimeout(1000);
  257 | 
  258 |     // Submit application under unique advisor name
  259 |     const advisorName = `Arjun Financial Services ${Date.now()}`;
  260 |     await advisorPage.submitApplication({
  261 |       fullName: advisorName,
  262 |       phone: '+91 9000000001',
  263 |       expertise: 'Tax planning & investments',
  264 |       experience: '7',
  265 |       bio: 'Fiduciary financial planner specializing in personal taxation and wealth growth.'
  266 |     });
  267 |     await advisorPage.waitForToast('Application submitted');
  268 |     await advisorPage.screenshot('pos_10_advisor_applied');
  269 | 
  270 |     // Logout current user
  271 |     await page.evaluate(() => {
  272 |       localStorage.clear();
  273 |       sessionStorage.clear();
  274 |     });
  275 | 
  276 |     // Login U7 (Admin) to review and approve
  277 |     await authPage.loginViaAPI(USERS.U7);
  278 |     await authPage.skipOnboarding();
  279 |     
  280 |     // Navigate to Manager Compliance Review
  281 |     await advisorPage.navigateTo('advisor-verification');
  282 |     await page.waitForTimeout(1000);
  283 | 
  284 |     // Review and Approve Arjun
  285 |     await advisorPage.reviewAndApprove(advisorName);
  286 |     await advisorPage.waitForToast('profile is now ACTIVE');
  287 |     await advisorPage.screenshot('pos_11_advisor_approved');
  288 |   });
  289 | 
  290 |   test('08. Recurring Liability Schedule Management', async ({ page }) => {
  291 |     const authPage = new AuthPage(page);
  292 |     await authPage.loginViaAPI(USERS.U1);
  293 |     await authPage.skipOnboarding();
  294 | 
  295 |     const recPage = new RecurringPage(page);
  296 |     await recPage.navigateTo('recurring-transactions');
  297 |     await page.waitForTimeout(1000);
  298 | 
  299 |     // Case 8.1: Positive - Create Rent Schedule
  300 |     await recPage.createSchedule({
  301 |       name: 'Office Space Rent',
  302 |       amount: '32000',
  303 |       type: 'expense',
  304 |       category: 'Rent & Housing',
  305 |       frequency: 'monthly',
  306 |       nextDueDate: '2026-07-01',
  307 |       accountName: 'HDFC Savings Premium'
  308 |     });
  309 |     await recPage.waitForToast('created');
  310 |     await recPage.assertScheduleExists('Office Space Rent', '32000');
  311 | 
  312 |     // Case 8.2: Positive - Pause and delete schedule
  313 |     await recPage.pauseSchedule('Office Space Rent');
  314 |     await recPage.waitForToast('paused');
  315 |     
  316 |     await recPage.deleteSchedule('Office Space Rent');
  317 |     await recPage.waitForToast('deleted');
  318 |     await recPage.screenshot('pos_12_recurring_deleted');
  319 |   });
  320 | 
  321 |   test('09. Regression - Add Loan Navigation & Redirection Bug', async ({ page }) => {
  322 |     // Set viewport to mobile size so the mobile-only nav-quick-add-button is rendered visible
  323 |     await page.setViewportSize({ width: 375, height: 812 });
  324 | 
  325 |     const authPage = new AuthPage(page);
  326 |     await authPage.loginViaAPI(USERS.U1);
  327 |     await authPage.skipOnboarding();
  328 | 
  329 |     // Case 9.1: Quick Actions redirection regression test
  330 |     const quickAddButton = page.locator('[data-testid="nav-quick-add-button"]').first();
  331 |     await quickAddButton.waitFor({ state: 'visible', timeout: 5000 });
  332 |     await quickAddButton.click();
  333 |     await page.waitForTimeout(800);
  334 | 
  335 |     const loanActionBtn = page.locator('[data-testid="quickaction-add-loan-button"], button:has-text("Add Loan")').first();
> 336 |     await loanActionBtn.click();
      |                         ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  337 |     await page.waitForTimeout(1500);
  338 | 
  339 |     // Verify correct redirection: Header title should read "New Borrowed Loan" (AddLoan page)
  340 |     const addLoanTitle = page.getByRole('heading', { name: /new borrowed loan/i }).first();
  341 |     await expect(addLoanTitle).toBeVisible({ timeout: 5000 });
  342 |     await expect(page.locator('input[placeholder*="HDFC Bank" i]')).toBeVisible(); // Check unique AddLoan field
  343 |     await page.screenshot('reg_13_quickaction_redirection');
  344 | 
  345 |     // Close and navigate back
  346 |     await page.locator('header button').first().click();
  347 |     await page.waitForTimeout(500);
  348 | 
  349 |     // Restore desktop viewport size so the sidebar navigation links are visible
  350 |     await page.setViewportSize({ width: 1280, height: 800 });
  351 |     await page.waitForTimeout(500);
  352 | 
  353 |     // Case 9.2: Dashboard loans button redirection check
  354 |     const loanPage = new LoanPage(page);
  355 |     await loanPage.navigateTo('loans');
  356 |     await page.waitForTimeout(1000);
  357 | 
  358 |     // Case 9.3: Principal and tenure negative checks
  359 |     await loanPage.clickAddLoan();
  360 |     await loanPage.lenderNameInput.fill('John Doe');
  361 |     await loanPage.amountInput.fill('0'); // zero principal amount
  362 |     await loanPage.saveLoanBtn.first().click();
  363 |     await loanPage.waitForToast('Principal amount must be greater than 0');
  364 |     await loanPage.screenshot('neg_14_zero_principal');
  365 | 
  366 |     await loanPage.amountInput.fill('150000');
  367 |     await loanPage.tenureMonthsInput.fill('0'); // zero tenure
  368 |     await loanPage.saveLoanBtn.first().click();
  369 |     await loanPage.waitForToast('Tenure must be greater than 0');
  370 |     await loanPage.screenshot('neg_15_zero_tenure');
  371 | 
  372 |     // Discard and retry with positive creation
  373 |     await loanPage.navigateTo('loans');
  374 |     await page.waitForTimeout(500);
  375 | 
  376 |     await loanPage.createLoan({
  377 |       lenderName: 'SBI Home Finance',
  378 |       principal: '800000',
  379 |       rate: '8.7',
  380 |       tenure: '24',
  381 |       account: 'HDFC Savings Premium',
  382 |       notes: 'Collateral house loan'
  383 |     });
  384 |     await loanPage.waitForToast('successfully');
  385 |     await loanPage.assertLoanExists('SBI Home Finance', '800000');
  386 |     await loanPage.screenshot('pos_16_loan_created');
  387 |   });
  388 | 
  389 |   test('10. Logout/Login Session Retention & State Check', async ({ page }) => {
  390 |     const authPage = new AuthPage(page);
  391 |     await authPage.loginViaAPI(USERS.U1);
  392 |     await authPage.skipOnboarding();
  393 | 
  394 |     // Verify existing state is shown in UI
  395 |     const accountPage = new AccountPage(page);
  396 |     await accountPage.navigateTo('account');
  397 |     await page.waitForTimeout(1000);
  398 |     await accountPage.assertAccountExists('HDFC Savings Premium');
  399 | 
  400 |     // Logout
  401 |     await page.evaluate(() => {
  402 |       localStorage.clear();
  403 |       sessionStorage.clear();
  404 |     });
  405 |     await page.reload();
  406 |     await page.waitForTimeout(2000);
  407 | 
  408 |     // Confirm redirected to landing
  409 |     const loginCTA = page.getByRole('button', { name: /log in|sign in/i }).first();
  410 |     await expect(loginCTA).toBeVisible({ timeout: 5000 });
  411 | 
  412 |     // Log back in
  413 |     await authPage.loginViaAPI(USERS.U1);
  414 |     await authPage.skipOnboarding();
  415 | 
  416 |     // Check account balances are still present (persistence check)
  417 |     await accountPage.navigateTo('account');
  418 |     await page.waitForTimeout(1000);
  419 |     await accountPage.assertAccountExists('HDFC Savings Premium');
  420 |     await accountPage.screenshot('pos_17_persistence_check');
  421 |   });
  422 | });
  423 | 
```