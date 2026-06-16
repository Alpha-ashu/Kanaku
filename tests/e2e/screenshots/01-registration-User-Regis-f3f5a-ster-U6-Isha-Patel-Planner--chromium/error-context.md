# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-registration.spec.ts >> User Registration – All 7 Personas >> Register U6: Isha Patel (Planner)
- Location: tests\e2e\01-registration.spec.ts:12:5

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /create account.*ready|create account|sign up|register/i }).last()

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
        - button "Back" [ref=e28]: Back
        - heading "Create Account" [level=2] [ref=e29]
        - paragraph [ref=e30]: Join KANAKU to start mastering your wealth.
      - generic [ref=e32]:
        - generic [ref=e34]:
          - generic [ref=e35]: Account Setup
          - generic [ref=e36]: 80%
        - generic [ref=e39]:
          - generic [ref=e40]:
            - generic:
              - img
            - textbox "First Name" [ref=e41]:
              - /placeholder: " "
              - text: Isha
            - generic: First Name
            - generic:
              - img
          - generic [ref=e42]:
            - generic:
              - img
            - textbox "Last Name" [ref=e43]:
              - /placeholder: " "
              - text: Patel
            - generic: Last Name
            - generic:
              - img
        - generic [ref=e44]:
          - generic:
            - img
          - textbox "Email Address" [ref=e45]:
            - /placeholder: " "
            - text: isha.test@finora.app
          - generic: Email Address
          - generic:
            - img
          - paragraph [ref=e46]:
            - text: This email is already registered.
            - button "Sign in instead" [ref=e47]
        - generic [ref=e48]:
          - generic:
            - img
          - combobox "Country code" [ref=e50] [cursor=pointer]:
            - option "🇮🇳 +91" [selected]
            - option "🇺🇸 +1"
            - option "🇬🇧 +44"
            - option "🇦🇪 +971"
            - option "🇸🇬 +65"
            - option "🇦🇺 +61"
          - textbox "Mobile Number" [ref=e52]:
            - /placeholder: " "
            - text: 90000 00006
          - generic: Mobile Number
          - generic:
            - img
        - generic [ref=e53]:
          - generic [ref=e54]:
            - generic:
              - img
            - textbox "Password" [ref=e55]:
              - /placeholder: " "
              - text: TestFinora@2026
            - generic: Password
            - button [ref=e56]:
              - img [ref=e57]
          - generic [ref=e60]:
            - button "Suggest a strong password" [ref=e61]:
              - img [ref=e62]
              - text: Suggest a strong password
            - generic [ref=e64]: Strong
          - generic [ref=e70]:
            - generic [ref=e71]: Password Check
            - generic [ref=e72]:
              - generic [ref=e73]:
                - img [ref=e75]
                - generic [ref=e77]: Min 8 characters
              - generic [ref=e78]:
                - img [ref=e80]
                - generic [ref=e82]: Uppercase letter
              - generic [ref=e83]:
                - img [ref=e85]
                - generic [ref=e87]: Lowercase letter
              - generic [ref=e88]:
                - img [ref=e90]
                - generic [ref=e92]: Number (0-9)
              - generic [ref=e93]:
                - img [ref=e95]
                - generic [ref=e97]: Special character (!@#$ etc.)
        - generic [ref=e98]:
          - generic:
            - img
          - textbox "Confirm Password" [ref=e99]:
            - /placeholder: " "
            - text: TestFinora@2026
          - generic: Confirm Password
          - generic:
            - img
          - button [ref=e100]:
            - img [ref=e101]
        - generic [ref=e104]:
          - checkbox "I agree to the Terms of Service and Privacy Policy" [checked] [active] [ref=e105] [cursor=pointer]
          - generic [ref=e106] [cursor=pointer]:
            - text: I agree to the
            - button "Terms of Service" [ref=e107]
            - text: and
            - button "Privacy Policy" [ref=e108]
        - button "Complete 1 more field" [disabled] [ref=e109]
        - paragraph [ref=e110]:
          - text: Already have an account?
          - button "Sign in" [ref=e111]
  - region "Notifications alt+T"
```

# Test source

```ts
  77  |     localStorage.clear();
  78  |     sessionStorage.clear();
  79  |     localStorage.setItem('auth_token', at);
  80  |     localStorage.setItem('refresh_token', rt);
  81  |     localStorage.setItem('user_email', email);
  82  |     localStorage.setItem('onboarding_completed', 'true');
  83  |     localStorage.setItem('onboarding_slides_viewed', 'true');
  84  |     localStorage.setItem('user_data', JSON.stringify(userObj));
  85  |     localStorage.setItem('pin_setup_completed', 'true');
  86  |     localStorage.setItem('pin_created', 'true');
  87  |     localStorage.setItem('pin_verified', 'true');
  88  |     localStorage.setItem('pin_verified_at', verifiedAt);
  89  |     return new Promise<void>((resolve) => {
  90  |       const req = indexedDB.open('KANAKUDB');
  91  |       req.onsuccess = (event) => {
  92  |         const db = (event.target as any).result;
  93  |         if (!db.objectStoreNames || db.objectStoreNames.length === 0) {
  94  |           db.close();
  95  |           resolve();
  96  |           return;
  97  |         }
  98  |         try {
  99  |           const tx = db.transaction(db.objectStoreNames, 'readwrite');
  100 |           tx.oncomplete = () => {
  101 |             db.close();
  102 |             resolve();
  103 |           };
  104 |           tx.onerror = () => {
  105 |             db.close();
  106 |             resolve();
  107 |           };
  108 |           for (const storeName of db.objectStoreNames) {
  109 |             tx.objectStore(storeName).clear();
  110 |           }
  111 |         } catch (e) {
  112 |           db.close();
  113 |           resolve();
  114 |         }
  115 |       };
  116 |       req.onerror = () => resolve();
  117 |       req.onblocked = () => resolve();
  118 |       setTimeout(resolve, 2000); // safety fallback
  119 |     });
  120 |   }, { at: accessToken, rt: refreshToken, email: user.email, userObj, verifiedAt: new Date().toISOString() }).catch(() => null);
  121 | 
  122 |   // 3. Reload so React EnhancedAuthContext picks up the stored tokens.
  123 |   await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
  124 |   await page.waitForTimeout(2000);
  125 | 
  126 |   // 4. Wait for "Syncing your account..." loading screen to disappear
  127 |   const syncScreen = page.getByText(/syncing your account/i).first();
  128 |   if (await isElementVisible(syncScreen, 2000)) {
  129 |     await syncScreen.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => null);
  130 |     await page.waitForTimeout(1000);
  131 |   }
  132 | 
  133 |   await screenshot(page, `login_${user.firstName}_after`);
  134 |   return page.url();
  135 | }
  136 | 
  137 | /** Register a new user through the actual UI (signup form) */
  138 | export async function registerUser(page: Page, user: typeof USERS.U1) {
  139 |   await gotoApp(page);
  140 | 
  141 |   // Click "Get Started" on the marketing landing page
  142 |   const getStarted = page.getByRole('button', { name: /get started/i }).first();
  143 |   if (await isElementVisible(getStarted, 5000)) {
  144 |     await getStarted.click();
  145 |     await page.waitForTimeout(800);
  146 |   }
  147 | 
  148 |   // "Get Started" navigates to AuthFlow 'welcome' step (Create Account / Sign In / etc.).
  149 |   // Click "Create Account" to reach the actual signup form.
  150 |   const createAccountCTA = page.getByRole('button', { name: /^create account$/i }).first();
  151 |   if (await isElementVisible(createAccountCTA, 3000)) {
  152 |     await createAccountCTA.click();
  153 |     await page.waitForTimeout(800);
  154 |   }
  155 | 
  156 |   const firstNameInput = page.locator('input[name="firstName"], input#firstName').first();
  157 |   const formVisible = await firstNameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  158 |   if (!formVisible) return 'form_not_found';
  159 | 
  160 |   await firstNameInput.fill(user.firstName);
  161 |   await page.locator('input[name="lastName"], input#lastName').first().fill(user.lastName);
  162 |   await page.locator('input[name="email"], input#email').first().fill(user.email);
  163 |   await page.keyboard.press('Escape');
  164 |   await page.locator('input[name="mobile"], input#mobile').first().fill(user.mobile);
  165 |   await page.locator('input[name="password"], input#password').first().fill(user.password);
  166 |   await page.locator('input[name="confirmPassword"], input#confirmPassword').first().fill(user.password);
  167 | 
  168 |   const termsCheckbox = page.locator('input#agreeToTerms, input[name="agreeToTerms"]').first();
  169 |   if (await isElementVisible(termsCheckbox, 2000)) {
  170 |     if (!await termsCheckbox.isChecked()) await termsCheckbox.check();
  171 |   }
  172 | 
  173 |   await page.waitForTimeout(400);
  174 |   await screenshot(page, `register_${user.firstName}_before_submit`);
  175 | 
  176 |   const submitBtn = page.getByRole('button', { name: /create account.*ready|create account|sign up|register/i }).last();
> 177 |   await submitBtn.click();
      |                   ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  178 |   await screenshot(page, `register_${user.firstName}_after_submit`);
  179 | 
  180 |   // For already-registered users, handleSignUp fires toast.error("already registered")
  181 |   // within ~2s, then SignUpForm shows "Account Created Successfully!" (app bug: success shown
  182 |   // even for duplicate). The toast text contains "already" and is visible for ~4s.
  183 |   // Detect duplicate early before the toast dismisses.
  184 |   const earlyDuplicateText = page.getByText(/already registered|already.*email|phone.*already|already.*use/i).first();
  185 |   if (await isElementVisible(earlyDuplicateText, 5000)) {
  186 |     return 'already_exists';
  187 |   }
  188 | 
  189 |   // "Account Created Successfully!" appears for BOTH real registrations and duplicates.
  190 |   // For REAL new users the app navigates away (onboarding) within ~3s.
  191 |   // For DUPLICATE users the app stays on the success screen indefinitely (no auth change).
  192 |   const accountCreatedText = page.getByText(/Account Created Successfully/i).first();
  193 |   if (await isElementVisible(accountCreatedText, 5000)) {
  194 |     // Wait to see if the app navigates away (real new user) or stays stuck (duplicate)
  195 |     const dashEl = page.locator('[data-nav-id]').first();
  196 |     const navigatedAway = await dashEl.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  197 |     if (!navigatedAway) {
  198 |       // Still on success screen with no dashboard → duplicate user (app bug: success shown incorrectly)
  199 |       return 'already_exists';
  200 |     }
  201 |     return 'registered';
  202 |   }
  203 | 
  204 |   // Fallback: check body text for error keywords (form inline errors, etc.)
  205 |   const bodyText = (await page.locator('body').textContent().catch(() => null)) ?? '';
  206 |   const lowerBody = bodyText.toLowerCase();
  207 |   if (lowerBody.includes('already') || lowerBody.includes('taken') || lowerBody.includes('in use') ||
  208 |       lowerBody.includes('email_exists') || lowerBody.includes('phone_exists')) {
  209 |     return 'already_exists';
  210 |   }
  211 |   // If form is still visible, the submission was rejected (validation or inline error)
  212 |   const formStillVisible = await isElementVisible(page.locator('input[name="firstName"]').first(), 1000);
  213 |   if (formStillVisible) return 'already_exists';
  214 |   return 'registered';
  215 | }
  216 | 
  217 | /** Enter a 6-digit PIN by clicking the PINAuth numpad buttons.
  218 |  *  Primary: Playwright .click({ force: true }) on the numpad container buttons.
  219 |  *  Fallback: evaluate-based dispatchEvent.
  220 |  *  Both bypass pointer-events and focus requirements. */
  221 | async function enterPin(page: Page, pin = '111111') {
  222 |   await page.getByText(/create your pin|confirm your pin|enter your pin/i).first()
  223 |     .waitFor({ state: 'visible', timeout: 20000 }).catch(() => null);
  224 |   await page.waitForTimeout(500);
  225 | 
  226 |   for (const digit of pin) {
  227 |     // Primary: Playwright getByRole — most robust, works regardless of CSS class names
  228 |     const btn = page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first();
  229 |     const clicked = await btn.click({ force: true, timeout: 2000 })
  230 |       .then(() => true)
  231 |       .catch(() => false);
  232 | 
  233 |     if (!clicked) {
  234 |       // Fallback: evaluate-based dispatchEvent
  235 |       await page.evaluate((d) => {
  236 |         const b = Array.from(document.querySelectorAll('button'))
  237 |           .find(el => (el.textContent ?? '').trim() === d);
  238 |         if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  239 |       }, digit);
  240 |     }
  241 |     await page.waitForTimeout(200);
  242 |   }
  243 | 
  244 |   await page.waitForTimeout(5000);
  245 | }
  246 | 
  247 | /** Complete PIN setup and any onboarding screens */
  248 | export async function skipOnboardingIfPresent(page: Page) {
  249 |   const isDashboardVisible = await page.locator('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]').first()
  250 |     .isVisible().catch(() => false);
  251 |   if (isDashboardVisible) return;
  252 | 
  253 |   // Handle App Feature Slides (shown to new users before PIN setup)
  254 |   const slidesContainer = page.getByTestId('onboarding-slides-container');
  255 |   if (await isElementVisible(slidesContainer, 5000)) {
  256 |     // Click Skip to jump to the last slide, then click Complete
  257 |     const skipBtn = page.getByTestId('onboarding-slides-skip-button');
  258 |     if (await isElementVisible(skipBtn, 2000)) {
  259 |       await skipBtn.click();
  260 |       await page.waitForTimeout(600);
  261 |     }
  262 |     const completeBtn = page.getByTestId('onboarding-slides-complete-button');
  263 |     if (await isElementVisible(completeBtn, 3000)) {
  264 |       await completeBtn.click();
  265 |       await page.waitForTimeout(1000);
  266 |     }
  267 |   }
  268 | 
  269 |   const STRONG_PIN = '142536'; // non-repeating, non-sequential
  270 | 
  271 |   // PINAuth makes an API call on mount before rendering the numpad (isLoading state).
  272 |   // Wait up to 30s: pinService.getStatus() can be slow for some users/environments.
  273 |   const anyPinText = page.getByText(/create your pin|enter your pin|secure unlock/i).first();
  274 |   const hasPinScreen = await isElementVisible(anyPinText, 20000);
  275 | 
  276 |   if (hasPinScreen) {
  277 |     const isCreateMode = await isElementVisible(page.getByText(/create your pin/i).first(), 500);
```