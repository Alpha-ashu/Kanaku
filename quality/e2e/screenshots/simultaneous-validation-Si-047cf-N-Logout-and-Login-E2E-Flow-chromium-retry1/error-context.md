# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: simultaneous-validation.spec.ts >> Simultaneous UI, API, and DB Validation >> Registration, Onboarding, PIN, Logout, and Login E2E Flow
- Location: quality\e2e\simultaneous-validation.spec.ts:28:3

# Error details

```
TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('select#gender') to be visible

```

# Test source

```ts
  115 |     const mobileInput = page.locator('input[name="mobile"], input#mobile').first();
  116 |     const passwordInput = page.locator('input[name="password"], input#password').first();
  117 |     const confirmPasswordInput = page.locator('input[name="confirmPassword"], input#confirmPassword').first();
  118 |     const termsCheckbox = page.locator('input#agreeToTerms, input[name="agreeToTerms"]').first();
  119 | 
  120 |     // Fill form fields
  121 |     console.log('Filling registration details...');
  122 |     await firstNameInput.fill(user.firstName);
  123 |     await firstNameInput.blur();
  124 |     
  125 |     await lastNameInput.fill(user.lastName);
  126 |     await lastNameInput.blur();
  127 | 
  128 |     await emailInput.fill(user.email);
  129 |     // Explicitly blur to trigger duplicate email checking API request
  130 |     await emailInput.blur();
  131 |     await page.waitForTimeout(1000); // Wait for checkEmail promise
  132 | 
  133 |     await mobileInput.fill(user.mobile);
  134 |     await mobileInput.blur();
  135 | 
  136 |     await passwordInput.fill(user.password);
  137 |     await passwordInput.blur();
  138 | 
  139 |     await confirmPasswordInput.fill(user.password);
  140 |     await confirmPasswordInput.blur();
  141 | 
  142 |     if (!(await termsCheckbox.isChecked())) {
  143 |       await termsCheckbox.check();
  144 |     }
  145 | 
  146 |     // Wait for stability and print form validation status
  147 |     await page.waitForTimeout(1500);
  148 |     
  149 |     const submitBtn = page.locator('[data-testid="auth-signup-submit-button"], button[type="submit"]').first();
  150 |     const submitText = await submitBtn.textContent();
  151 |     console.log(`Form Submit Button state text: "${submitText}"`);
  152 | 
  153 |     // If the button shows a "Complete more fields" state, inspect DOM state to debug
  154 |     if (submitText && submitText.includes('Complete')) {
  155 |       console.log('WARNING: Form is not ready. Printing diagnostics:');
  156 |       const diagnostics = await page.evaluate(() => {
  157 |         const errors: any[] = [];
  158 |         // Look for validation indicators or red border classes
  159 |         document.querySelectorAll('input').forEach(input => {
  160 |           errors.push({
  161 |             id: input.id,
  162 |             name: input.name,
  163 |             value: input.value,
  164 |             classes: input.className,
  165 |             touched: input.outerHTML.includes('touched')
  166 |           });
  167 |         });
  168 |         return {
  169 |           inputs: errors,
  170 |           bodyHtml: document.body.innerHTML.slice(0, 1000)
  171 |         };
  172 |       });
  173 |       console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
  174 |     }
  175 | 
  176 |     // Submit registration
  177 |     console.log('\n--- Step 2: Submitting Registration Form ---');
  178 |     await expect(submitBtn).toBeEnabled({ timeout: 5000 });
  179 |     await submitBtn.click();
  180 | 
  181 |     // Wait for signup success screen
  182 |     await page.waitForSelector('text=Account Created Successfully', { timeout: 15000 });
  183 |     console.log('UI reports Account Created Successfully.');
  184 | 
  185 |     // 2. Validate Database Records immediately after registration (with retry since it happens via async middleware check)
  186 |     console.log('\n--- Step 3: Validating Registration in Postgres Database ---');
  187 |     let dbUser = null;
  188 |     const maxDbRetries = 15;
  189 | 
  190 |     for (let i = 0; i < maxDbRetries; i++) {
  191 |       dbUser = await prisma.user.findUnique({
  192 |         where: { email: user.email },
  193 |       });
  194 |       if (dbUser) {
  195 |         break;
  196 |       }
  197 |       console.log(`Waiting for database User record to sync... Attempt ${i + 1}/${maxDbRetries}`);
  198 |       await page.waitForTimeout(1000);
  199 |     }
  200 | 
  201 |     console.log('Database User query result:', dbUser ? 'FOUND' : 'NOT FOUND');
  202 |     expect(dbUser).not.toBeNull();
  203 |     console.log(`Database User ID: ${dbUser?.id}`);
  204 |     console.log(`Database User Email: ${dbUser?.email}`);
  205 |     console.log(`Database User Name: ${dbUser?.name}`);
  206 |     console.log(`Database User Role: ${dbUser?.role}`);
  207 |     console.log(`Database User Status: ${dbUser?.status}`);
  208 | 
  209 |     // 3. Complete Onboarding and PIN setup
  210 |     console.log('\n--- Step 4: Completing Onboarding and Setting up PIN ---');
  211 |     
  212 |     // Step 4a: Profile Setup Step (Onboarding Step 1)
  213 |     console.log('Waiting for Profile Setup onboarding screen...');
  214 |     try {
> 215 |       await page.locator('select#gender').waitFor({ state: 'visible', timeout: 20000 });
      |                                           ^ TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
  216 |     } catch (err) {
  217 |       console.log('Timeout waiting for select#gender. Printing storage content:');
  218 |       const localStorageContent = await page.evaluate(() => JSON.stringify(localStorage));
  219 |       console.log('localStorage:', JSON.stringify(JSON.parse(localStorageContent), null, 2));
  220 |       const sessionStorageContent = await page.evaluate(() => JSON.stringify(sessionStorage));
  221 |       console.log('sessionStorage:', JSON.stringify(JSON.parse(sessionStorageContent), null, 2));
  222 |       const bodyHtml = await page.evaluate(() => document.body.innerHTML);
  223 |       console.log(bodyHtml);
  224 |       throw err;
  225 |     }
  226 |     
  227 |     console.log('Selecting gender "male"...');
  228 |     await page.locator('select#gender').selectOption('male');
  229 |     
  230 |     console.log('Filling Date of Birth "2000-01-01"...');
  231 |     await page.locator('input#dateOfBirth').fill('2000-01-01');
  232 |     
  233 |     console.log('Selecting Job Type "Full-time Employment"...');
  234 |     await page.locator('select#jobType').selectOption('Full-time Employment');
  235 |     
  236 |     console.log('Filling Annual Salary "1200000"...');
  237 |     await page.locator('input#salary').fill('1200000');
  238 |     
  239 |     console.log('Clicking "Continue to Bank Account Setup"...');
  240 |     await page.getByRole('button', { name: /Continue to Bank Account Setup/i }).click();
  241 | 
  242 |     // Step 4b: Country and Language Step (Onboarding Step 2)
  243 |     console.log('Waiting for Country and Language onboarding screen...');
  244 |     const skipStep2Btn = page.getByRole('button', { name: /Skip for now/i }).first();
  245 |     await skipStep2Btn.waitFor({ state: 'visible', timeout: 15000 });
  246 |     console.log('Clicking skip on Country and Language step...');
  247 |     await skipStep2Btn.click();
  248 | 
  249 |     // Step 4c: Onboarding Complete Step (Onboarding Step 4)
  250 |     console.log('Waiting for Onboarding Complete screen...');
  251 |     const completeSetupBtn = page.getByRole('button', { name: /Complete Setup/i }).first();
  252 |     await completeSetupBtn.waitFor({ state: 'visible', timeout: 15000 });
  253 |     console.log('Clicking Complete Setup...');
  254 |     await completeSetupBtn.click();
  255 | 
  256 |     // Step 4d: App Feature Slides
  257 |     console.log('Waiting for App Feature Slides...');
  258 |     const slidesContainer = page.getByTestId('onboarding-slides-container');
  259 |     await slidesContainer.waitFor({ state: 'visible', timeout: 15000 });
  260 |     
  261 |     console.log('Skipping slides...');
  262 |     const skipSlidesBtn = page.getByTestId('onboarding-slides-skip-button');
  263 |     await skipSlidesBtn.click();
  264 |     await page.waitForTimeout(600);
  265 |     
  266 |     console.log('Completing slides...');
  267 |     const completeSlidesBtn = page.getByTestId('onboarding-slides-complete-button');
  268 |     await completeSlidesBtn.click();
  269 | 
  270 |     // Step 4e: PIN setup for new users (Create PIN & Confirm PIN)
  271 |     console.log('Waiting for PIN setup screen...');
  272 |     const createPinText = page.getByText(/create your pin/i).first();
  273 |     await createPinText.waitFor({ state: 'visible', timeout: 20000 });
  274 |     
  275 |     const STRONG_PIN = '142536';
  276 |     console.log('Entering new PIN...');
  277 |     for (const digit of STRONG_PIN) {
  278 |       await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first().click();
  279 |       await page.waitForTimeout(200);
  280 |     }
  281 |     
  282 |     console.log('Waiting for Confirm PIN screen...');
  283 |     const confirmPinText = page.getByText(/confirm your pin/i).first();
  284 |     await confirmPinText.waitFor({ state: 'visible', timeout: 15000 });
  285 |     
  286 |     console.log('Confirming PIN...');
  287 |     for (const digit of STRONG_PIN) {
  288 |       await page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first().click();
  289 |       await page.waitForTimeout(200);
  290 |     }
  291 | 
  292 |     // Verify we're on the dashboard
  293 |     await expect(page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first()).toBeVisible({ timeout: 20000 });
  294 |     console.log('Successfully reached Dashboard.');
  295 | 
  296 |     // 4. Validate profile and PIN in Postgres DB
  297 |     console.log('\n--- Step 5: Validating Profile and PIN in Postgres Database ---');
  298 |     let dbProfile = null;
  299 |     let dbPin = null;
  300 |     for (let i = 0; i < maxDbRetries; i++) {
  301 |       dbProfile = await prisma.profiles.findUnique({
  302 |         where: { email: user.email },
  303 |       });
  304 |       dbPin = await prisma.userPin.findUnique({
  305 |         where: { userId: dbUser!.id },
  306 |       });
  307 |       if (dbProfile && dbPin) {
  308 |         break;
  309 |       }
  310 |       console.log(`Waiting for database records to sync... Attempt ${i + 1}/${maxDbRetries}`);
  311 |       await page.waitForTimeout(1000);
  312 |     }
  313 | 
  314 |     console.log('Database Profile query result:', dbProfile ? 'FOUND' : 'NOT FOUND');
  315 |     expect(dbProfile).not.toBeNull();
```