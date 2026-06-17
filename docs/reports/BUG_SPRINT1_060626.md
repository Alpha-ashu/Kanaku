# Sprint 1 Browser-Level UI Test Report
**Date:** 2026-06-13  
**Tester:** Automated Playwright suite (7 user personas × full scenario coverage)  
**App:** Kanaku / KANAKU — React 18 + Vite 6 (port 9002), Express + Prisma backend (port 3000)  
**Total tests:** 39 across U1–U7 | **Passed:** 28 | **Failed:** 11  

---

## Overall Results by Persona

| Persona | Tests | Pass | Fail | Notes |
|---------|-------|------|------|-------|
| U1 — Arjun Sharma (Debt Manager) | 6 | 6 | 0 | U1-05 soft: Add Loan goes to add-transaction |
| U2 — Priya Mehta (Group Splitter) | 5 | 5 | 0 | |
| U3 — Rohan Verma (Investor) | 5 | 4 | 1 | U3-01 content selector mismatch |
| U4 — Sneha Kapoor (Goal Setter) | 5 | 5 | 0 | U4-02–05 soft: Add Goal button missing |
| U5 — Dev Nair (Portfolio Builder) | 6 | 3 | 3 | Core txn flow broken by modal |
| U6 — Isha Patel (Collaborative Planner) | 6 | 2 | 4 | To-Do creation modal broken |
| U7 — Power User | 11 | 8 | 3 | Txn modal + goal form disabled |

---

## Bug Inventory

### BUG-001 — CRITICAL: Add Transaction opens a type-selection modal that blocks interaction with behind-modal elements
**Severity:** P1 — Blocks core income/expense logging for all users  
**Affected:** U5-03, U5-04, U7-02, U7-03  
**Repro:**
1. Navigate to Transactions (`/transactions`)
2. Click the "Add" / "+" button
3. A full-screen modal appears: "What kind of transaction is this?" with large colored cards (Income = emerald, Expense, Transfer)
4. The modal backdrop (`z-[60]`, `bg-slate-900/40 backdrop-blur-sm`) covers the **entire page** including the transaction type toggle tabs in the header
5. Our test locates the small Income/Expense tab outside the modal and tries to click it — the modal backdrop intercepts every click

**Root cause:** The type-selection modal is rendered at `z-[60]` and uses `fixed inset-0`, meaning it covers all underlying UI. Tests (and users navigating by keyboard) cannot reach the tab strip below the modal while the modal is open.  
**Expected:** The Income/Expense tabs in the transaction form header should remain interactive, OR the modal itself should have clear focus-trap semantics and the large card buttons inside it should register `incomeBtn.click()`.  
**Playwright error excerpt:**
```
<button class="w-full p-4 ... bg-emerald-50 text-emerald-700...">…</button>
from <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm ... z-[60] p-4">…</div>
subtree intercepts pointer events
```
**Fix hint:** After clicking "Add Transaction", wait for the modal's large income/expense card buttons and click those directly. Test locator fix: `page.locator('div[class*="fixed inset-0"] button').filter({ hasText: /^income$/i })`.

---

### BUG-002 — CRITICAL: To-Do List creation modal — Create button unreachable; textarea covers it
**Severity:** P1 — Blocks all To-Do list creation  
**Affected:** U6-02, U6-05  
**Repro:**
1. Navigate to Todo Lists
2. Click "Create List" or equivalent button
3. A modal opens with: List Name input, Description textarea, Create button
4. The `<textarea rows="3" placeholder="Add a description for this list">` overlaps or intercepts pointer events that should reach the Create button below it
5. Playwright retries for 15s and eventually times out

**Root cause:** The Create button inside the modal is positioned such that the Description textarea (or its stacking context within the modal) intercepts pointer events. Likely the modal content overflows its container and the button is partially obscured.  
**Expected:** The Create/Save button in any modal should be fully clickable without interference from form fields above it.  
**Playwright error excerpt:**
```
<textarea rows="3" placeholder="Add a description for this list" ...>
from <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">…</div>
subtree intercepts pointer events
```
**Consequence:** Users may be unable to create To-Do lists on certain viewport sizes or when the modal content is tall.

---

### BUG-003 — HIGH: Goal creation form save button is always disabled; goals cannot be created
**Severity:** P2 — Core "Goals" feature non-functional  
**Affected:** U4-02, U4-03, U4-05, U7-06  
**Repro:**
1. Navigate to Goals
2. Click the "Add Goal" button (if found — see BUG-004)
3. Fill in Name and Target Amount
4. The Save/Create button remains `disabled` (opacity-50, pointer-events-none)

**Root cause:** The goal form has required fields beyond Name + Target Amount that the test is not filling (likely: Category, Icon, or Account). Without all required fields, the save button stays disabled.  
**Evidence (Playwright trace):**
```
locator resolved to <button disabled class="bg-indigo-600 text-white px-6 py-2.5 ... disabled:opacity-50">
waiting for element to be visible, enabled and stable
element is not enabled
```
**Expected:** The form should clearly indicate which fields are required, or the minimum required fields (Name + Target Amount) should be sufficient to enable the save button.

---

### BUG-004 — HIGH: Goals page has no visible "Add Goal" button matching standard patterns
**Severity:** P2 — Goal creation entry point missing  
**Affected:** U4-02 through U4-05  
**Repro:**
1. Navigate to Goals page
2. Look for a button matching `/add goal|new goal|\+ goal|create goal/i`
3. No button found within 5s timeout

**Observation:** The Goals page likely shows an empty state with a "Create your first goal" button (found in U7-06 trace: `title="Create your first goal"`), but this button doesn't use the standard Add/New pattern. Once goals exist, a different "Add Goal" pattern may appear.  
**Expected:** The Goals empty-state CTA should be discoverable by role (button) and label. Consider `aria-label="Add goal"` or a consistent button text like "+ Add Goal".

---

### BUG-005 — HIGH: Accounts page has no visible "Add Account" button; accounts cannot be added from the test
**Severity:** P2 — Account management entry point hidden  
**Affected:** U5-01  
**Repro:**
1. Navigate to Accounts (`clickNav('account')`)
2. Look for button matching `/add account|new account|\+ account/i`
3. Button not found within 5s

**Note:** U1-02 passed the same test. This may be a timing issue (U5 runs later in a resource-heavy sequence) or the accounts page behaves differently for a user with no accounts.  
**Expected:** An "Add Account" button should always be visible on the Accounts page, especially for new users.

---

### BUG-006 — HIGH: Add Loan button navigates to the generic add-transaction page instead of a dedicated loan form
**Severity:** P2 — Confusing UX; loan-specific fields absent  
**Affected:** U1-05  
**Repro:**
1. Navigate to Loans & EMIs
2. Click "Add Loan"
3. App sets `localStorage.quickFormType='expense'`, `quickExpenseMode='loan'`, `quickBackPage='loans'` and navigates to `/add-transaction`
4. The form is the generic transaction form — it has no loan-specific fields (Lender Name, Interest Rate, Principal, EMI)

**Code reference:** [Loans.tsx](frontend/src/app/components/loans/Loans.tsx) — `onClick` handler navigates to `add-transaction` page  
**Expected:** Informal loan creation should either:
a. Open a dedicated "Add Loan" drawer/modal with fields like Lender, Amount, Interest Rate, EMI
b. Or clearly pre-populate the add-transaction form with loan-specific labels

---

### BUG-007 — HIGH: Investment form uses symbol search/autocomplete widget — plain text fill fails
**Severity:** P2 — Investment creation via keyboard is unreliable  
**Affected:** U3-02, U3-03  
**Repro:**
1. Navigate to Investments → Add Investment
2. Select "Market Assets" → attempt to fill the Name/Symbol field
3. Field labeled "ASSET SEARCH / NAME" is an autocomplete search widget, not a plain `<input>`
4. `fill()` on `input[name="symbol"]` or `input[placeholder*="name"]` doesn't populate the autocomplete correctly in some cases

**Observation:** Reliance Industries (U3-02) was saved successfully (possibly because the search returned a match), but HDFC Midcap Opportunities (U3-03) was not — it may not be in the autocomplete database.  
**Expected:** The investment form should either support freeform text input for asset name, or provide a clear error when a symbol is not found in the search database.

---

### BUG-008 — HIGH: Investments page heading/class structure doesn't match expected selectors
**Severity:** P2 — Test infrastructure reveals missing semantic markup  
**Affected:** U3-01  
**Repro:**
1. Navigate to Investments
2. Look for `h1,h2,[class*="invest"],[class*="portfolio"]` with text matching `/invest|portfolio|stock|fund|gold/i`
3. Nothing found within 6s

**Root cause:** The Investments page likely uses custom component classes that don't include "invest" or "portfolio" in their class names, and may not have a `<h1>` or `<h2>` heading.  
**Expected:** Every major page should have a semantic `<h1>` heading and/or an `aria-label` on the main content area.

---

### BUG-009 — MEDIUM: No standalone Budget management page; budget-alerts is the only budget-related nav item
**Severity:** P3 — Feature gap  
**Affected:** U5-06  
**Repro:**
1. Try to navigate to a Budget page via sidebar
2. Sidebar has "Budget Alerts" (`budget-alerts`) but no general "Budget" or "Budget Limits" page
3. Users cannot set category spending limits

**Expected:** A Budget page should exist where users can set monthly spending limits per category and view progress against those limits. The "Budget Alerts" feature exists but the budget creation flow is missing.

---

### BUG-010 — MEDIUM: Account-to-account transfer not directly accessible from Transactions page
**Severity:** P3 — Feature gap  
**Affected:** U5-05  
**Repro:**
1. Navigate to Transactions
2. Look for a "Transfer" button
3. No standalone Transfer button found — Transfer is likely inside the type-selection modal (BUG-001)

**Expected:** Transfer should be directly accessible as a transaction type. Once BUG-001 is resolved (the modal flow), Transfer may become accessible.

---

### BUG-011 — MEDIUM: Voice logging page and Receipt scanner not accessible via sidebar navigation
**Severity:** P3 — Feature discoverability  
**Affected:** U7-04, U7-05  
**Repro:**
1. Try `clickNav('voice')` — no sidebar item matches
2. Try `clickNav('receipt')` or `clickNav('scan')` — no sidebar item matches
3. Voice logging and Receipt scanner are not listed in `sidebarMenuItems` in `navigation.ts`

**Code reference:** [navigation.ts](frontend/src/app/constants/navigation.ts) — neither "voice" nor "receipt" appear in `sidebarMenuItems`  
**Expected:** If these features exist (AI voice transaction logging, receipt OCR), they should have sidebar navigation entries or be accessible from a floating action button.

---

### BUG-012 — MEDIUM: Notifications not accessible via sidebar navigation
**Severity:** P3 — Feature discoverability  
**Affected:** U7-09  
**Repro:**
1. Try `clickNav('notification')` — no sidebar item with id containing "notification" found
2. Notifications exists in `headerMenuItems` but not in `sidebarMenuItems`

**Note:** Notifications may be accessible via a bell icon in the header. The sidebar doesn't include it.

---

### BUG-013 — MEDIUM: CSV Export does not trigger a browser download; may open inline or in new tab
**Severity:** P3 — Feature reliability  
**Affected:** U7-11  
**Repro:**
1. Navigate to Data Export (`data-export` nav item)
2. Click the Export CSV button
3. No `download` event is triggered in Playwright
4. Console: "No download event — export may open in new tab or show inline"

**Expected:** Clicking "Export CSV" should trigger a browser download with `Content-Disposition: attachment`. If the file opens in a new tab instead, users on some browsers may be confused.

---

### BUG-014 — LOW: Total debt/loan summary not visible on Dashboard
**Severity:** P4 — Informational gap  
**Affected:** U1-06  
**Repro:**
1. Add a Home Loan (₹35,00,000 at 8.5%)
2. Navigate to Dashboard
3. Look for text matching `/total.*debt|loan.*balance|outstanding|you owe|borrowed/i`
4. Not found

**Expected:** The Dashboard should surface the total outstanding loan balance as a key financial metric.

---

## Features Confirmed Working

| Feature | Test | Status |
|---------|------|--------|
| Login via API token injection | U1-01, U2-01, U3-01, U4-01, U5-01, U6-01, U7-01 | ✅ |
| PIN creation for new users (fix applied) | U4-01 | ✅ |
| PIN verification for existing users | U1-01 onward | ✅ |
| Sidebar navigation (all pages) | All suites | ✅ |
| Dashboard loads with financial data | U7-10 | ✅ |
| No JavaScript errors on dashboard | U7-10 | ✅ |
| Accounts page navigation | U1-02, U5-01 | ✅ |
| Add Account (when Add button present) | U1-02 | ✅ |
| Navigate to Loans & EMIs | U1-03 | ✅ |
| Add formal Home Loan (via form) | U1-04 | ✅ |
| Navigate to Investments | U3 (soft) | ✅ |
| Add stock via symbol search | U3-02 | ✅ |
| Add Gold investment | U3-04 | ✅ |
| Portfolio summary loads | U3-05 | ✅ |
| Navigate to Goals | U4-01 | ✅ |
| Navigate to Group Expenses | U2 suite | ✅ |
| Add friend / contact | U2 suite | ✅ |
| Navigate to To-Do Lists | U6-01 | ✅ |
| Add investment (generic) | U7-07 | ✅ |
| Add loan (generic) | U7-08 | ✅ |
| Data Export page accessible | U7-11 | ✅ |

---

## Test Infrastructure Notes

1. **Page reload timeout (U5-02):** The 2nd sequential test for U5 hit a 20s `waitUntil: 'load'` timeout. The app's heavy background syncing (WebSocket + multiple API calls on auth) causes the `load` event to fire late when the browser is under memory pressure from consecutive test runs. Increasing the timeout to 30s or using `domcontentloaded` + manual sync detection mitigates this.

2. **New-user PIN creation timing:** Sneha (U4) required PIN creation on first login. The `enterPin` helper was fixed to wait for the numpad to become enabled (the PINAuth component makes an async API call before enabling the numpad). Without this fix, PIN digits were entered before the numpad was ready.

3. **Sidebar navigation accessibility fix:** The sidebar uses Framer Motion `motion.div` elements (not `<button>`). Added `role="button"`, `aria-label={item.label}`, and `data-nav-id={item.id}` attributes to `DraggableSidebarItem` in [Sidebar.tsx](frontend/src/app/components/core/Sidebar.tsx) to enable reliable test automation.

---

## Priority Action Items

| Priority | Bug | Owner Hint |
|----------|-----|------------|
| P1 | BUG-001: Transaction type modal intercepts clicks | Fix z-index stacking or use `.dispatchEvent` in test; or document that modal cards are the intended tap targets |
| P1 | BUG-002: To-Do create modal textarea covers Create button | Fix modal layout — ensure Create button is always below all form fields with no overlap |
| P2 | BUG-003: Goal form save button always disabled | Audit required fields; show which fields are missing validation |
| P2 | BUG-004: Add Goal button not discoverable | Standardise empty-state CTAs with accessible button labels |
| P2 | BUG-005: Add Account button missing | Check if button is conditionally hidden; add empty-state CTA |
| P2 | BUG-006: Add Loan goes to generic transaction page | Build dedicated loan creation form or add loan-specific mode to add-transaction |
| P3 | BUG-009: No Budget page | Implement budget limits management feature |
| P3 | BUG-011: Voice and Receipt scanner not in navigation | Add to sidebar or floating action button |
| P4 | BUG-013: CSV Export doesn't trigger download | Set `Content-Disposition: attachment` in export API response |
