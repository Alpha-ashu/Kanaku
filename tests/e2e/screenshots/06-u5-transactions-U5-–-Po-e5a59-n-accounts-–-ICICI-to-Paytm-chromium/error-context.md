# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-u5-transactions.spec.ts >> U5 – Portfolio Builder / Transaction Tester (Dev) >> U5-05: Transfer between accounts – ICICI to Paytm
- Location: tests\e2e\06-u5-transactions.spec.ts:203:3

# Error details

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Test source

```ts
  17  | 
  18  | export async function screenshot(page: Page, name: string) {
  19  |   const dir = path.join('tests', 'e2e', 'screenshots');
  20  |   if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  21  |   await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false, timeout: 8000 }).catch(() => null);
  22  | }
  23  | 
  24  | /** Navigate to the app root and wait for landing page */
  25  | export async function gotoApp(page: Page) {
  26  |   await page.goto(BASE, { waitUntil: 'networkidle' });
  27  |   await page.waitForSelector('h1, button, nav', { timeout: 15000 });
  28  | }
  29  | 
  30  | /**
  31  |  * Login via API + inject tokens directly into localStorage.
  32  |  * Mimics exactly what the frontend SignInForm does after a successful API login,
  33  |  * bypassing the marketing landing page navigation flow.
  34  |  */
  35  | export async function loginUser(page: Page, user: typeof USERS.U1) {
  36  |   // 1. Get tokens from backend API (retry up to 3x for transient ECONNREFUSED on startup)
  37  |   let resp: Awaited<ReturnType<typeof page.request.post>> | null = null;
  38  |   for (let attempt = 0; attempt < 3; attempt++) {
  39  |     try {
  40  |       resp = await page.request.post(`${API}/api/v1/auth/login`, {
  41  |         data: { email: user.email, password: user.password },
  42  |       });
  43  |       break;
  44  |     } catch (e: any) {
  45  |       if (attempt === 2) throw e;
  46  |       await page.waitForTimeout(3000);
  47  |     }
  48  |   }
  49  |   const json = await resp!.json();
  50  |   const { accessToken, refreshToken } = json.data ?? {};
  51  | 
  52  |   if (!accessToken) {
  53  |     throw new Error(`Login API failed for ${user.email}: ${JSON.stringify(json)}`);
  54  |   }
  55  | 
  56  |   // 1b. Pre-create a default cash account so AddTransaction/group expense flows work
  57  |   //     Uses a deterministic ID so repeated runs don't create duplicates.
  58  |   await page.request.post(`${API}/api/v1/accounts`, {
  59  |     headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  60  |     data: {
  61  |       name: 'Savings Account',
  62  |       type: 'bank',
  63  |       balance: 50000,
  64  |       currency: 'INR',
  65  |       clientRequestId: `test-acct-${user.email}`,
  66  |     },
  67  |   }).catch(() => {}); // ignore if already exists
  68  | 
  69  |   // 1c. Delete server-side PIN so PINAuth enters create mode (always succeeds locally).
  70  |   //     Retry up to 3× with increasing delays — server can be slow under test load.
  71  |   for (let pinReset = 0; pinReset < 3; pinReset++) {
  72  |     const secTokenResp = await page.request.post(`${API}/api/v1/pin/verify-security`, {
  73  |       headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  74  |       data: {},
  75  |     }).catch(() => null);
  76  |     if (secTokenResp?.ok()) {
  77  |       const secJson = await secTokenResp.json().catch(() => ({}));
  78  |       if (secJson?.securityToken) {
  79  |         const resetResp = await page.request.post(`${API}/api/v1/pin/self-reset`, {
  80  |           headers: {
  81  |             Authorization: `Bearer ${accessToken}`,
  82  |             'Content-Type': 'application/json',
  83  |             'x-security-token': secJson.securityToken,
  84  |           },
  85  |           data: {},
  86  |         }).catch(() => null);
  87  |         if (resetResp?.ok()) break; // Reset succeeded — exit retry loop
  88  |       }
  89  |     }
  90  |     if (pinReset < 2) await page.waitForTimeout(2000 * (pinReset + 1));
  91  |   }
  92  | 
  93  |   // 2. Open the app and inject tokens before React fully boots
  94  |   // Catch timeout: late in a long test run the dev server may be slow to fire domcontentloaded.
  95  |   await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
  96  |   await page.evaluate(({ at, rt, email }) => {
  97  |     localStorage.setItem('auth_token', at);
  98  |     localStorage.setItem('refresh_token', rt);
  99  |     localStorage.setItem('user_email', email);
  100 |     localStorage.setItem('onboarding_completed', 'true');
  101 |     // Clear local PIN keys so PINAuth starts fresh in create mode (server PIN was just reset above).
  102 |     // Create mode: user enters 142536 twice → local key stored → isAuthenticated = true.
  103 |     localStorage.removeItem('KANAKU_encrypted_key');
  104 |     localStorage.removeItem('KANAKU_salt');
  105 |     // Legacy pinService status keys — clear so pinService.hasPin() reads from server
  106 |     localStorage.removeItem('pin_verified');
  107 |     localStorage.removeItem('pin_verified_at');
  108 |     localStorage.removeItem('pin_setup_completed');
  109 |     localStorage.removeItem('pin_created');
  110 |   }, { at: accessToken, rt: refreshToken, email: user.email });
  111 | 
  112 |   // 3. Reload so React EnhancedAuthContext picks up the stored tokens
  113 |   // Use 'load' not 'networkidle' — the app has background syncing that prevents networkidle.
  114 |   // Catch timeout: the app may keep background connections open after load (WebSocket, polling)
  115 |   // which delays the 'load' event on slow dev servers. The page is usable even if timeout fires.
  116 |   await page.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => null);
> 117 |   await page.waitForTimeout(2000);
      |              ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  118 | 
  119 |   // 4. Wait for "Syncing your account..." loading screen to disappear
  120 |   const syncScreen = page.getByText(/syncing your account/i).first();
  121 |   if (await syncScreen.isVisible({ timeout: 2000 }).catch(() => false)) {
  122 |     await syncScreen.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => null);
  123 |     await page.waitForTimeout(1000);
  124 |   }
  125 | 
  126 |   await screenshot(page, `login_${user.firstName}_after`);
  127 |   return page.url();
  128 | }
  129 | 
  130 | /** Register a new user through the actual UI (signup form) */
  131 | export async function registerUser(page: Page, user: typeof USERS.U1) {
  132 |   await gotoApp(page);
  133 | 
  134 |   // Click "Get Started" on the marketing landing page
  135 |   const getStarted = page.getByRole('button', { name: /get started/i }).first();
  136 |   if (await getStarted.isVisible({ timeout: 5000 }).catch(() => false)) {
  137 |     await getStarted.click();
  138 |     await page.waitForTimeout(800);
  139 |   }
  140 | 
  141 |   // "Get Started" navigates to AuthFlow 'welcome' step (Create Account / Sign In / etc.).
  142 |   // Click "Create Account" to reach the actual signup form.
  143 |   const createAccountCTA = page.getByRole('button', { name: /^create account$/i }).first();
  144 |   if (await createAccountCTA.isVisible({ timeout: 3000 }).catch(() => false)) {
  145 |     await createAccountCTA.click();
  146 |     await page.waitForTimeout(800);
  147 |   }
  148 | 
  149 |   const firstNameInput = page.locator('input[name="firstName"], input#firstName').first();
  150 |   const formVisible = await firstNameInput.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  151 |   if (!formVisible) return 'form_not_found';
  152 | 
  153 |   await firstNameInput.fill(user.firstName);
  154 |   await page.locator('input[name="lastName"], input#lastName').first().fill(user.lastName);
  155 |   await page.locator('input[name="email"], input#email').first().fill(user.email);
  156 |   await page.keyboard.press('Escape');
  157 |   await page.locator('input[name="mobile"], input#mobile').first().fill(user.mobile);
  158 |   await page.locator('input[name="password"], input#password').first().fill(user.password);
  159 |   await page.locator('input[name="confirmPassword"], input#confirmPassword').first().fill(user.password);
  160 | 
  161 |   const termsCheckbox = page.locator('input#agreeToTerms, input[name="agreeToTerms"]').first();
  162 |   if (await termsCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
  163 |     if (!await termsCheckbox.isChecked()) await termsCheckbox.check();
  164 |   }
  165 | 
  166 |   await page.waitForTimeout(400);
  167 |   await screenshot(page, `register_${user.firstName}_before_submit`);
  168 | 
  169 |   const submitBtn = page.getByRole('button', { name: /create account.*ready|create account|sign up|register/i }).last();
  170 |   await submitBtn.click();
  171 |   await screenshot(page, `register_${user.firstName}_after_submit`);
  172 | 
  173 |   // For already-registered users, handleSignUp fires toast.error("already registered")
  174 |   // within ~2s, then SignUpForm shows "Account Created Successfully!" (app bug: success shown
  175 |   // even for duplicate). The toast text contains "already" and is visible for ~4s.
  176 |   // Detect duplicate early before the toast dismisses.
  177 |   const earlyDuplicateText = page.getByText(/already registered|already.*email|phone.*already|already.*use/i).first();
  178 |   if (await earlyDuplicateText.isVisible({ timeout: 5000 }).catch(() => false)) {
  179 |     return 'already_exists';
  180 |   }
  181 | 
  182 |   // "Account Created Successfully!" appears for BOTH real registrations and duplicates.
  183 |   // For REAL new users the app navigates away (onboarding) within ~3s.
  184 |   // For DUPLICATE users the app stays on the success screen indefinitely (no auth change).
  185 |   const accountCreatedText = page.getByText(/Account Created Successfully/i).first();
  186 |   if (await accountCreatedText.isVisible({ timeout: 5000 }).catch(() => false)) {
  187 |     // Wait to see if the app navigates away (real new user) or stays stuck (duplicate)
  188 |     const dashEl = page.locator('[data-nav-id]').first();
  189 |     const navigatedAway = await dashEl.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  190 |     if (!navigatedAway) {
  191 |       // Still on success screen with no dashboard → duplicate user (app bug: success shown incorrectly)
  192 |       return 'already_exists';
  193 |     }
  194 |     return 'registered';
  195 |   }
  196 | 
  197 |   // Fallback: check body text for error keywords (form inline errors, etc.)
  198 |   const bodyText = (await page.locator('body').textContent().catch(() => null)) ?? '';
  199 |   const lowerBody = bodyText.toLowerCase();
  200 |   if (lowerBody.includes('already') || lowerBody.includes('taken') || lowerBody.includes('in use') ||
  201 |       lowerBody.includes('email_exists') || lowerBody.includes('phone_exists')) {
  202 |     return 'already_exists';
  203 |   }
  204 |   // If form is still visible, the submission was rejected (validation or inline error)
  205 |   const formStillVisible = await page.locator('input[name="firstName"]').isVisible({ timeout: 1000 }).catch(() => false);
  206 |   if (formStillVisible) return 'already_exists';
  207 |   return 'registered';
  208 | }
  209 | 
  210 | /** Enter a 6-digit PIN by clicking the PINAuth numpad buttons via JavaScript evaluate().
  211 |  *  Uses document.querySelectorAll('button') to find each digit button and calls .click() directly.
  212 |  *  This bypasses: pointer-events:none on the form, Playwright interactability checks, and any
  213 |  *  focus-routing issues that can cause keyboard.type() to miss the PIN input. */
  214 | async function enterPin(page: Page, pin = '111111') {
  215 |   await page.getByText(/create your pin|confirm your pin|enter your pin/i).first()
  216 |     .waitFor({ state: 'visible', timeout: 20000 }).catch(() => null);
  217 |   await page.waitForTimeout(500);
```