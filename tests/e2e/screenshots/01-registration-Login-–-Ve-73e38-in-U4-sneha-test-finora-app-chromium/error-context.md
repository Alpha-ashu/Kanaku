# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-registration.spec.ts >> Login – Verify All Accounts Work >> Login U4: sneha.test@finora.app
- Location: tests\e2e\01-registration.spec.ts:42:5

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - img [ref=e6]
  - region "Notifications alt+T"
```

# Test source

```ts
  211 |  *  Primary: Playwright .click({ force: true }) on the numpad container buttons.
  212 |  *  Fallback: evaluate-based dispatchEvent.
  213 |  *  Both bypass pointer-events and focus requirements. */
  214 | async function enterPin(page: Page, pin = '111111') {
  215 |   await page.getByText(/create your pin|confirm your pin|enter your pin/i).first()
  216 |     .waitFor({ state: 'visible', timeout: 20000 }).catch(() => null);
  217 |   await page.waitForTimeout(500);
  218 | 
  219 |   for (const digit of pin) {
  220 |     // Primary: Playwright getByRole — most robust, works regardless of CSS class names
  221 |     const btn = page.getByRole('button', { name: new RegExp(`^${digit}$`) }).first();
  222 |     const clicked = await btn.click({ force: true, timeout: 2000 })
  223 |       .then(() => true)
  224 |       .catch(() => false);
  225 | 
  226 |     if (!clicked) {
  227 |       // Fallback: evaluate-based dispatchEvent
  228 |       await page.evaluate((d) => {
  229 |         const b = Array.from(document.querySelectorAll('button'))
  230 |           .find(el => (el.textContent ?? '').trim() === d);
  231 |         if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  232 |       }, digit);
  233 |     }
  234 |     await page.waitForTimeout(200);
  235 |   }
  236 | 
  237 |   // Wait for auto-submit (120ms) + crypto key derivation + server round-trip.
  238 |   // Increased to 5000ms to handle slow server under long test runs.
  239 |   await page.waitForTimeout(5000);
  240 | }
  241 | 
  242 | /** Complete PIN setup and any onboarding screens */
  243 | export async function skipOnboardingIfPresent(page: Page) {
  244 |   const STRONG_PIN = '142536'; // non-repeating, non-sequential
  245 | 
  246 |   // PINAuth makes an API call on mount before rendering the numpad (isLoading state).
  247 |   // Wait up to 30s: pinService.getStatus() can be slow for some users/environments.
  248 |   const anyPinText = page.getByText(/create your pin|enter your pin|secure unlock/i).first();
  249 |   const hasPinScreen = await anyPinText.isVisible({ timeout: 30000 }).catch(() => false);
  250 | 
  251 |   if (hasPinScreen) {
  252 |     const isCreateMode = await page.getByText(/create your pin/i).first()
  253 |       .isVisible({ timeout: 500 }).catch(() => false);
  254 | 
  255 |     // Step 1: verify mode enters PIN once; create mode enters it for Step 1 of 2
  256 |     await enterPin(page, STRONG_PIN);
  257 |     // enterPin waits 5s internally; add extra buffer for slow server (PBKDF2 + API call)
  258 |     await page.waitForTimeout(2000);
  259 | 
  260 |     if (isCreateMode) {
  261 |       // Step 2 of 2 — Confirm your PIN (only in create mode).
  262 |       // Server processes step 1 asynchronously; increase timeout for under-load scenarios.
  263 |       const confirmVisible = await page.getByText(/confirm your pin/i).first()
  264 |         .isVisible({ timeout: 15000 }).catch(() => false);
  265 |       if (confirmVisible) {
  266 |         await enterPin(page, STRONG_PIN);
  267 |         await page.waitForTimeout(2000);
  268 |       }
  269 |     } else {
  270 |       // Verify mode: if PIN screen still showing after entry, it likely means
  271 |       // the previous run used PIN=142536 — retry once (server still has that hash).
  272 |       const pinStillAfterVerify = await page.getByText(/enter your pin/i).first()
  273 |         .isVisible({ timeout: 2000 }).catch(() => false);
  274 |       if (pinStillAfterVerify) {
  275 |         // isSubmitting may be stuck — wait for it to reset before retrying
  276 |         await page.waitForTimeout(3000);
  277 |         await enterPin(page, STRONG_PIN);
  278 |         await page.waitForTimeout(2000);
  279 |       }
  280 |     }
  281 |   }
  282 | 
  283 |   // If any PIN screen still showing (e.g. mismatch or wrong PIN), try skip
  284 |   const pinStillShowing = page.getByText(/create your pin|confirm your pin|enter your pin/i).first();
  285 |   if (await pinStillShowing.isVisible({ timeout: 2000 }).catch(() => false)) {
  286 |     const skipPin = page.getByRole('button', { name: /skip|later|not now/i }).first();
  287 |     if (await skipPin.isVisible({ timeout: 2000 }).catch(() => false)) await skipPin.click();
  288 |   }
  289 | 
  290 |   // Handle any remaining onboarding steps
  291 |   for (let i = 0; i < 6; i++) {
  292 |     const skipBtn = page.getByRole('button', { name: /skip|later|not now|continue|next|done|finish|complete/i }).first();
  293 |     if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  294 |       await skipBtn.click();
  295 |       await page.waitForTimeout(600);
  296 |     } else break;
  297 |   }
  298 | 
  299 |   // Wait for the main app to load past all auth + sync gates.
  300 |   // The sidebar nav items (data-nav-id attributes) only render after isAuthenticated=true AND dataReady=true.
  301 |   await page.waitForFunction(
  302 |     () => {
  303 |       const hasSidebarNav = !!document.querySelector('[data-nav-id], [aria-label="Dashboard"], [aria-label="Home"]');
  304 |       const isSyncing = (document.body?.textContent ?? '').includes('Syncing your account') ||
  305 |                         (document.body?.textContent ?? '').includes('Loading your account');
  306 |       return hasSidebarNav && !isSyncing;
  307 |     },
  308 |     { timeout: 60000 }
  309 |   ).catch(() => null);
  310 | 
> 311 |   await page.waitForTimeout(500);
      |              ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  312 | }
  313 | 
  314 | /** Click a nav item by label text — finds sidebar data-nav-id items and bottom nav buttons */
  315 | export async function clickNav(page: Page, label: string): Promise<boolean> {
  316 |   const re = new RegExp(label, 'i');
  317 | 
  318 |   // Priority 1: sidebar items tagged with data-nav-id or aria-label (motion.div, not button)
  319 |   const sidebarById = page.locator(`[data-nav-id*="${label}" i]`).first();
  320 |   if (await sidebarById.isVisible({ timeout: 3000 }).catch(() => false)) {
  321 |     await sidebarById.click();
  322 |     await page.waitForTimeout(800);
  323 |     return true;
  324 |   }
  325 | 
  326 |   const sidebarByAria = page.locator(`[aria-label*="${label}" i]`).first();
  327 |   if (await sidebarByAria.isVisible({ timeout: 3000 }).catch(() => false)) {
  328 |     await sidebarByAria.click();
  329 |     await page.waitForTimeout(800);
  330 |     return true;
  331 |   }
  332 | 
  333 |   // Priority 2: enabled buttons in nav containers
  334 |   const candidates = [
  335 |     page.locator('nav button:not([disabled]), nav a').filter({ hasText: re }),
  336 |     page.locator('[class*="nav"] button:not([disabled])').filter({ hasText: re }),
  337 |     page.getByRole('button', { name: re }).filter({ hasNot: page.locator('[disabled]') }),
  338 |     page.getByRole('link', { name: re }),
  339 |   ];
  340 |   for (const loc of candidates) {
  341 |     const el = loc.first();
  342 |     if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
  343 |       await el.click();
  344 |       await page.waitForTimeout(800);
  345 |       return true;
  346 |     }
  347 |   }
  348 | 
  349 |   return false;
  350 | }
  351 | 
  352 | /** Wait for a toast / success message */
  353 | export async function waitForToast(page: Page, text?: string) {
  354 |   const toast = text
  355 |     ? page.locator(`[role="status"], .toast, [data-sonner-toast]`).filter({ hasText: new RegExp(text, 'i') })
  356 |     : page.locator(`[role="status"], .toast, [data-sonner-toast]`);
  357 |   await toast.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);
  358 | }
  359 | 
```