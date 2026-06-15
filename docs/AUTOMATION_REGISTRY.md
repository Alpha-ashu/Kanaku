# Automation Registry

Centralised table of every `data-testid` added to Finora/Kanaku for Playwright automation and AI agent targeting.

**Naming convention:** `module-feature-element`  
**Dynamic IDs** use template literals — e.g. `pin-setup-digit-${n}`, `transaction-type-${tab.id}-tab`.

---

## Authentication — Sign In (`SignInForm.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `auth-signin-email-input` | Sign In | input[type=email] | |
| `auth-signin-password-input` | Sign In | input[type=password] | |
| `auth-signin-password-toggle` | Sign In | button | Toggles password visibility |
| `auth-signin-remember-checkbox` | Sign In | input[type=checkbox] | Remember me |
| `auth-signin-submit-button` | Sign In | button[type=submit] | |
| `auth-signin-switch-signup-button` | Sign In | button | Switches to sign-up view |

---

## Authentication — Sign Up (`SignUpForm.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `auth-signup-firstname-input` | Sign Up | input[type=text] | Dynamic via `.map()` |
| `auth-signup-lastname-input` | Sign Up | input[type=text] | Dynamic via `.map()` |
| `auth-signup-email-input` | Sign Up | input[type=email] | |
| `auth-signup-country-code-select` | Sign Up | select | Country dial code |
| `auth-signup-mobile-input` | Sign Up | input[type=tel] | |
| `auth-signup-password-input` | Sign Up | input[type=password] | |
| `auth-signup-password-toggle` | Sign Up | button | Toggles password visibility |
| `auth-signup-suggest-password-button` | Sign Up | button | Generates strong password |
| `auth-signup-confirm-password-input` | Sign Up | input[type=password] | |
| `auth-signup-confirm-password-toggle` | Sign Up | button | Toggles confirm password visibility |
| `auth-signup-terms-checkbox` | Sign Up | input[type=checkbox] | Agree to terms |
| `auth-signup-view-terms-button` | Sign Up | button | Opens Terms of Service |
| `auth-signup-view-privacy-button` | Sign Up | button | Opens Privacy Policy |
| `auth-signup-submit-button` | Sign Up | button[type=submit] | |
| `auth-signup-switch-signin-button` | Sign Up | button | Switches to sign-in view |

---

## Authentication — PIN Setup (`PINSetup.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `pin-setup-hidden-input` | PIN Setup | input[type=password] | Hidden input captures keyboard |
| `pin-setup-reveal-toggle` | PIN Setup | button | Show/hide PIN digits |
| `pin-setup-confirm-back-button` | PIN Setup | button | Back to create step from confirm step |
| `pin-setup-digit-1` … `pin-setup-digit-9` | PIN Setup | button | Digit 1–9; dynamic `pin-setup-digit-${n}` |
| `pin-setup-digit-0` | PIN Setup | button | Digit 0 |
| `pin-setup-back-nav-button` | PIN Setup | button | Back nav (visible when `onBack` prop provided) |
| `pin-setup-delete-button` | PIN Setup | button | Delete last digit |

---

## Authentication — PIN Auth (`PINAuth.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `pin-auth-hidden-input` | PIN Auth | input[type=password] | Hidden input captures keyboard |
| `pin-auth-reveal-toggle` | PIN Auth | button | Show/hide PIN digits |
| `pin-auth-confirm-back-button` | PIN Auth | button | Back to create step from confirm step |
| `pin-auth-digit-1` … `pin-auth-digit-9` | PIN Auth | button | Digit 1–9; dynamic `pin-auth-digit-${n}` |
| `pin-auth-digit-0` | PIN Auth | button | Digit 0 |
| `pin-auth-forgot-pin-button` | PIN Auth | button | Opens reset modal |
| `pin-auth-delete-button` | PIN Auth | button | Delete last digit |
| `pin-auth-signout-button` | PIN Auth | button | Sign out / use different account |
| `pin-reset-otp-input` | PIN Reset Modal | input[type=text] | 6-digit OTP |
| `pin-reset-cancel-button` | PIN Reset Modal | button | |
| `pin-reset-verify-button` | PIN Reset Modal | button | Verify OTP & reset PIN |
| `pin-reset-send-button` | PIN Reset Modal | button | Send OTP code |

---

## Navigation — Sidebar (`Sidebar.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `nav-${item.id}-button` | Sidebar | motion.div[role=button] | Dynamic per nav item; e.g. `nav-dashboard-button`, `nav-accounts-button` |

---

## Navigation — Bottom Nav (`BottomNav.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `nav-quick-add-button` | Bottom Nav | button | Centre quick-add button |
| `nav-${item.id}-button` | Bottom Nav | button | Dynamic per nav item |

---

## Quick Action Modal (`QuickActionModal.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `quickaction-close-button` | Quick Action | Button (shadcn) | Closes the modal |
| `quickaction-${action.id}-button` | Quick Action | motion.button | Dynamic per action; e.g. `quickaction-add-expense-button` |

---

## Accounts — Add Account (`AddAccount.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `account-create-back-button` | Add Account | button | |
| `account-create-type-${t.id}-button` | Add Account | button | e.g. `account-create-type-bank-button` |
| `account-create-provider-input` | Add Account | input[type=text] | Bank/wallet name |
| `account-create-name-input` | Add Account | input[type=text] | Custom label |
| `account-create-network-${net.id}-button` | Add Account | button | Card network; e.g. `account-create-network-visa-button` |
| `account-create-wallet-${name}-button` | Add Account | button | Wallet brand; e.g. `account-create-wallet-paytm-button` |
| `account-create-subtype-${st.id}-button` | Add Account | button | Bank subtype; e.g. `account-create-subtype-savings-button` |
| `account-create-color-${color.id}-button` | Add Account | button | Color palette; e.g. `account-create-color-midnight-button` |
| `account-create-hue-slider` | Add Account | input[type=range] | Custom hue spectrum |
| `account-create-balance-input` | Add Account | input[type=number] | Opening balance |
| `account-create-preset-${amt}-button` | Add Account | button | Quick balance preset; e.g. `account-create-preset-1000-button` |

---

## Transactions — Add Transaction (`AddTransaction.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `transaction-back-button` | Add Transaction | button | |
| `transaction-type-expense-tab` | Add Transaction | button | |
| `transaction-type-income-tab` | Add Transaction | button | |
| `transaction-type-transfer-tab` | Add Transaction | button | |
| `transaction-expense-mode-${m.id}-button` | Add Transaction | button | e.g. `transaction-expense-mode-individual-button` |
| `transaction-transfer-subtype-${m.id}-button` | Add Transaction | button | e.g. `transaction-transfer-subtype-self-button` |
| `transaction-transfer-method-${m.id}-button` | Add Transaction | button | e.g. `transaction-transfer-method-bank-button` |
| `transaction-loan-type-${t}-button` | Add Transaction | button | `transaction-loan-type-borrowed-button` or `transaction-loan-type-lent-button` |
| `transaction-description-input` | Add Transaction | input[type=text] | Has `aria-label="Description"` |
| `transaction-amount-input` | Add Transaction | input[type=number] | Has `aria-label="Transaction amount"` |
| `transaction-amount-clear-button` | Add Transaction | button | Clears amount field |
| `transaction-preset-${amt}-button` | Add Transaction | button | e.g. `transaction-preset-500-button` |
| `transaction-date-input` | Add Transaction | input[type=date] | Has `aria-label="Transaction date"` |
| `transaction-notes-textarea` | Add Transaction | textarea | Has `aria-label="Notes"` |
| `transaction-scan-receipt-button` | Add Transaction | button | OCR scan (shown when OCR enabled) |
| `transaction-add-attachment-button` | Add Transaction | button | No-OCR attachment |
| `transaction-remove-attachment-button` | Add Transaction | button | Removes attached receipt |
| `transaction-person-picker-button` | Add Transaction | button | Single person picker (individual/loan mode) |
| `transaction-friends-picker-button` | Add Transaction | button | Friends quick-picker header button |
| `transaction-add-person-toggle-button` | Add Transaction | button | Toggles new person input |
| `transaction-new-person-input` | Add Transaction | input[type=text] | Has `aria-label="New person name"` |
| `transaction-new-person-confirm-button` | Add Transaction | button | Confirms new person |
| `transaction-recipient-input` | Add Transaction | input[type=text] | Has `aria-label="Recipient name or UPI"` |
| `transaction-recipient-clear-button` | Add Transaction | button | Clears recipient field |

---

## To-Do Lists (`ToDoLists.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `todo-new-list-button` | To-Do Lists | button | Header New List button |
| `todo-tab-active-button` | To-Do Lists | button | Active tab |
| `todo-tab-archived-button` | To-Do Lists | button | Archived tab |
| `todo-create-modal-close-button` | To-Do Lists | button | Closes create modal |
| `todo-list-type-individual-button` | To-Do Lists | button | List type: Individual |
| `todo-list-type-together-button` | To-Do Lists | button | List type: Together (collaborative) |
| `todo-create-name-input` | To-Do Lists | input[type=text] | List name input |
| `todo-create-description-textarea` | To-Do Lists | textarea | Optional description |
| `todo-remove-collaborator-${c.id}-button` | To-Do Lists | button | Removes a collaborator chip |
| `todo-collaborator-search-input` | To-Do Lists | input[type=text] | Search friends for collaboration |
| `todo-add-friend-${f.id}-button` | To-Do Lists | button | Adds an existing friend as collaborator |
| `todo-new-collaborator-name-input` | To-Do Lists | input[type=text] | New collaborator name |
| `todo-new-collaborator-email-input` | To-Do Lists | input[type=email] | New collaborator email |
| `todo-new-collaborator-cancel-button` | To-Do Lists | button | |
| `todo-new-collaborator-add-button` | To-Do Lists | button | |
| `todo-add-new-collaborator-toggle-button` | To-Do Lists | button | Toggles new-collaborator form |
| `todo-create-cancel-button` | To-Do Lists | button | Modal footer cancel |
| `todo-create-submit-button` | To-Do Lists | button | Modal footer create |
| `todo-create-first-list-button` | To-Do Lists | button | Empty-state CTA |
| `todo-list-${list.id}-archive-button` | To-Do Lists | button | Archive or restore a list card |
| `todo-list-${list.id}-delete-button` | To-Do Lists | button | Delete a list card |

---

## To-Do List Detail (`ToDoListDetail.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `tododetail-back-button` | To-Do Detail | button | Back to list view (mobile) |
| `tododetail-share-button` | To-Do Detail | button | Manage collaborators (Together lists) |
| `tododetail-add-task-button` | To-Do Detail | button | Header Add Task button |
| `tododetail-add-form-close-button` | To-Do Detail | button | Closes add-task panel |
| `tododetail-new-title-input` | To-Do Detail | input[type=text] | New task title |
| `tododetail-new-priority-low-button` | To-Do Detail | button | |
| `tododetail-new-priority-medium-button` | To-Do Detail | button | |
| `tododetail-new-priority-high-button` | To-Do Detail | button | |
| `tododetail-new-due-date-input` | To-Do Detail | input[type=date] | |
| `tododetail-new-assignee-select` | To-Do Detail | select | Assign to (Together lists only) |
| `tododetail-new-notes-textarea` | To-Do Detail | textarea | |
| `tododetail-add-form-cancel-button` | To-Do Detail | button | |
| `tododetail-add-task-submit-button` | To-Do Detail | button | Submits new task |
| `tododetail-filter-all-button` | To-Do Detail | button | Filter: all tasks |
| `tododetail-filter-active-button` | To-Do Detail | button | Filter: active tasks |
| `tododetail-filter-done-button` | To-Do Detail | button | Filter: done tasks |
| `tododetail-add-first-task-button` | To-Do Detail | button | Empty-state CTA |
| `tododetail-item-${item.id}-toggle-button` | To-Do Detail | button | Toggle task complete/active |
| `tododetail-item-${item.id}-edit-button` | To-Do Detail | button | Opens inline edit form |
| `tododetail-item-${item.id}-delete-button` | To-Do Detail | button | Deletes a task |
| `tododetail-edit-title-input` | To-Do Detail | input[type=text] | Edit task title |
| `tododetail-edit-priority-low-button` | To-Do Detail | button | |
| `tododetail-edit-priority-medium-button` | To-Do Detail | button | |
| `tododetail-edit-priority-high-button` | To-Do Detail | button | |
| `tododetail-edit-due-date-input` | To-Do Detail | input[type=date] | |
| `tododetail-edit-assignee-select` | To-Do Detail | select | Assign to (Together lists only) |
| `tododetail-edit-notes-textarea` | To-Do Detail | textarea | |
| `tododetail-edit-cancel-button` | To-Do Detail | button | |
| `tododetail-edit-save-button` | To-Do Detail | button | Saves edited task |

---

## Admin — Feature Panel (`AdminFeaturePanel.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `admin-tab-app-button` | Admin | button | Application Features tab |
| `admin-tab-ai-button` | Admin | button | AI Intelligence Systems tab |
| `admin-feature-search-input` | Admin | input[type=text] | Search modules |
| `admin-feature-${f.key}-toggle-button` | Admin | button | Master enable/disable toggle per feature |
| `admin-feature-${f.key}-role-${role}-button` | Admin | button | Role access toggle; roles: admin/manager/advisor/user |
| `admin-feature-${f.key}-subfeatures-button` | Admin | button | Opens sub-features modal |
| `admin-subfeature-modal-close-button` | Admin | button | Closes sub-features modal (header X) |
| `admin-subfeature-${child.key}-toggle-button` | Admin | button | Sub-feature enable/disable toggle |
| `admin-subfeature-${child.key}-role-${r}-button` | Admin | button | Sub-feature role access toggle |
| `admin-subfeature-modal-done-button` | Admin | button | Closes sub-features modal (footer) |

---

## Usage Examples (Playwright)

```ts
// Authentication
await page.getByTestId('auth-signin-email-input').fill('user@example.com');
await page.getByTestId('auth-signin-password-input').fill('Password1!');
await page.getByTestId('auth-signin-submit-button').click();

// PIN entry
await page.getByTestId('pin-auth-digit-1').click();
await page.getByTestId('pin-auth-digit-2').click();

// Navigation
await page.getByTestId('nav-accounts-button').click();
await page.getByTestId('nav-quick-add-button').click();

// Add transaction
await page.getByTestId('quickaction-add-expense-button').click();
await page.getByTestId('transaction-amount-input').fill('500');
await page.getByTestId('transaction-description-input').fill('Lunch');
await page.getByTestId('transaction-preset-500-button').click();

// Admin feature toggle
await page.getByTestId('admin-feature-transactions-toggle-button').click();
await page.getByTestId('admin-feature-transactions-role-user-button').click();
```
