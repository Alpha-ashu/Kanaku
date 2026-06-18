# Automation Registry

Centralised table of every `data-testid` added to Kanaku/Kanaku for Playwright automation and AI agent targeting.

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

## Onboarding — App Feature Slides (`AppFeatureSlides.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `onboarding-slides-container` | Feature Slides | div | Root container; presence indicates slides are active |
| `onboarding-slides-skip-button` | Feature Slides | button | Skips to last slide; hidden on final slide |
| `onboarding-slides-slide-${i}` | Feature Slides | motion.div | Dynamic per slide index (0–4) |
| `onboarding-slides-dot-0` … `onboarding-slides-dot-4` | Feature Slides | button | Pagination indicator dots |
| `onboarding-slides-back-button` | Feature Slides | button | Previous slide; hidden on first slide |
| `onboarding-slides-next-button` | Feature Slides | button | Next slide; hidden on final slide |
| `onboarding-slides-complete-button` | Feature Slides | button | "Continue to Secure PIN Setup"; visible only on final slide |

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

## Shared UI Components (`FloatingSaveBar.tsx`, `SearchableDropdown.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `floating-save-bar-discard-button` | Any (Form bottom) | button | Default ID for FloatingSaveBar discard; customizable via `discardTestId` |
| `floating-save-bar-save-button` | Any (Form bottom) | button | Default ID for FloatingSaveBar save; customizable via `saveTestId` |
| `[custom-id]` | Any (Dropdown) | button | Customizable trigger button via `testId` |
| `[custom-id]-search-input` | Any (Dropdown Portal) | input[type=text] | Dropdown search field |
| `[custom-id]-option-${option.value}` | Any (Dropdown Portal) | button | Dropdown item option |

---

## Loans — Dashboard & Add Loan (`Loans.tsx`, `AddLoan.tsx`, `AddLoanModalWithFriends.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `loan-create-back-button` | Add Loan | button | Back to Loans page |
| `loan-create-lender-input` | Add Loan | input[type=text] | Lender / Financial Institution |
| `loan-create-friends-toggle` | Add Loan | button | Select from Friends toggle |
| `loan-create-friend-select-${f.id}` | Add Loan | button | Choose specific friend |
| `loan-create-rate-input` | Add Loan | input[type=number] | Interest rate |
| `loan-create-tenure-input` | Add Loan | input[type=number] | Tenure in months |
| `loan-create-date-input` | Add Loan | input[type=date] | Start date |
| `loan-create-account-dropdown` | Add Loan | Dropdown | Disbursement account |
| `loan-create-notes-textarea` | Add Loan | textarea | Notes / description |
| `loan-create-amount-input` | Add Loan | input[type=number] | Loan Principal input |
| `loan-create-save-button` | Add Loan | button | Create Loan CTA |
| `loan-create-discard-button` | Add Loan | button | Cancel creation |
| `loan-modal-type-borrowed-button` | Add Loan Modal | button | Select Borrowed type |
| `loan-modal-type-lent-button` | Add Loan Modal | button | Select Lent type |
| `loan-modal-type-emi-button` | Add Loan Modal | button | Select EMI type |
| `loan-modal-name-input` | Add Loan Modal | input[type=text] | Loan Name |
| `loan-modal-amount-input` | Add Loan Modal | input[type=number] | Principal Amount |
| `loan-modal-add-friend-toggle` | Add Loan Modal | button | Add New friend toggle |
| `loan-modal-new-friend-name-input` | Add Loan Modal | input[type=text] | New Friend name |
| `loan-modal-new-friend-email-input` | Add Loan Modal | input[type=email] | New Friend email |
| `loan-modal-new-friend-phone-input` | Add Loan Modal | input[type=tel] | New Friend phone |
| `loan-modal-save-friend-button` | Add Loan Modal | button | Save new friend |
| `loan-modal-cancel-friend-button` | Add Loan Modal | button | Cancel new friend creation |
| `loan-modal-friend-dropdown` | Add Loan Modal | Dropdown | Select Friend |
| `loan-modal-contact-input` | Add Loan Modal | input[type=text] | Contact Person / Institution |
| `loan-modal-rate-input` | Add Loan Modal | input[type=number] | Interest Rate |
| `loan-modal-emi-input` | Add Loan Modal | input[type=number] | EMI Amount |
| `loan-modal-due-date-input` | Add Loan Modal | input[type=date] | Due date |
| `loan-modal-cancel-button` | Add Loan Modal | button | Close modal |
| `loan-modal-submit-button` | Add Loan Modal | button | Add Loan submit |
| `loans-add-loan-button` | Loans | button | Add Loan CTA |
| `loans-edit-button-${loan.id}` | Loans | button | Edit loan card |
| `loans-delete-button-${loan.id}` | Loans | button | Delete loan card |
| `loans-edit-name-input` | Loans | input[type=text] | Edit Lender Name |
| `loans-edit-principal-input` | Loans | input[type=number] | Edit Principal Amount |
| `loans-edit-outstanding-input` | Loans | input[type=number] | Edit Outstanding Balance |
| `loans-edit-emi-input` | Loans | input[type=number] | Edit EMI Amount |
| `loans-edit-due-date-input` | Loans | input[type=date] | Edit Due Date |
| `loans-edit-save-button` | Loans | button | Save inline edit |
| `loans-edit-cancel-button` | Loans | button | Cancel inline edit |
| `loans-make-payment-button-${loan.id}` | Loans | button | Make Payment CTA |
| `loans-view-bill-button-${loan.id}` | Loans | button | View Bill CTA |
| `loans-payment-amount-input` | Loans (Payment Modal) | input[type=number] | Payment amount |
| `loans-payment-account-select` | Loans (Payment Modal) | select | Funding account |
| `loans-payment-scan-button` | Loans (Payment Modal) | button | OCR Scan Receipt |
| `loans-payment-attach-button` | Loans (Payment Modal) | button | Attach Receipt file |
| `loans-payment-remove-bill-button` | Loans (Payment Modal) | button | Remove attachment |
| `loans-payment-notes-textarea` | Loans (Payment Modal) | textarea | Payment notes |
| `loans-payment-cancel-button` | Loans (Payment Modal) | button | Cancel payment |
| `loans-payment-submit-button` | Loans (Payment Modal) | button | Submit payment |

---

## Goals — Dashboard & Detail (`Goals.tsx`, `AddGoal.tsx`, `GoalDetail.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `goals-create-back-button` | Add Goal | button | Back to Goals |
| `goals-create-type-${m.id}-button` | Add Goal | button | Goal Type selection (Car, Trip, etc.) |
| `goals-create-name-input` | Add Goal | input[type=text] | Goal Name |
| `goals-create-category-${cat.key}-button` | Add Goal | button | Category option selector |
| `goals-create-category-page-${idx}-dot` | Add Goal | button | Pagination dot |
| `goals-create-description-textarea` | Add Goal | textarea | Goal Description |
| `goals-create-member-name-input` | Add Goal | input[type=text] | Member Name |
| `goals-create-member-contact-type` | Add Goal | select | Contact type selector |
| `goals-create-member-contact-input` | Add Goal | input[type=text] | Contact details |
| `goals-create-member-add-button` | Add Goal | button | Add Member button |
| `goals-create-member-remove-${idx}` | Add Goal | button | Remove Member button |
| `goals-create-target-amount-input` | Add Goal | input[type=number] | Target amount |
| `goals-create-initial-deposit-input` | Add Goal | input[type=number] | Initial deposit |
| `goals-create-target-date-input` | Add Goal | input[type=date] | Target date |
| `goals-create-monthly-plan-input` | Add Goal | input[type=number] | Monthly contribution plan |
| `goals-create-suggest-button` | Add Goal | button | Suggest monthly plan / date |
| `goals-add-goal-button` | Goals | button | Add Goal CTA |
| `goals-edit-button-${goal.id}` | Goals | button | Edit goal |
| `goals-delete-button-${goal.id}` | Goals | button | Delete goal |
| `goals-edit-name-input` | Goals | input[type=text] | Inline Edit Name |
| `goals-edit-target-input` | Goals | input[type=number] | Inline Edit Target |
| `goals-edit-current-input` | Goals | input[type=number] | Inline Edit Current Progress |
| `goals-edit-date-input` | Goals | input[type=date] | Inline Edit Date |
| `goals-edit-save-button` | Goals | button | Save inline edit |
| `goals-edit-cancel-button` | Goals | button | Cancel inline edit |
| `goals-contribute-button-${goal.id}` | Goals | button | Contribute CTA |
| `goals-detail-button-${goal.id}` | Goals | button | View goal detail |
| `goals-contribution-amount-input` | Goals (Contribute Modal) | input[type=number] | Contribution amount |
| `goals-contribution-account-select` | Goals (Contribute Modal) | select | Funding account |
| `goals-contribution-notes-textarea` | Goals (Contribute Modal) | textarea | Contribution notes |
| `goals-contribution-cancel-button` | Goals (Contribute Modal) | button | Cancel contribution |
| `goals-contribution-submit-button` | Goals (Contribute Modal) | button | Submit contribution |
| `goals-voice-picker-goal-${goal.id}` | Goals (Voice Picker) | button | Select goal via voice command |
| `goals-voice-picker-new-button` | Goals (Voice Picker) | button | Create new goal |
| `goals-voice-picker-dismiss-button` | Goals (Voice Picker) | button | Close voice picker |
| `goals-detail-back-button` | Goal Detail | button | Back to Goals list |
| `goals-detail-amount-input` | Goal Detail | input[type=number] | Contribution amount |
| `goals-detail-account-select` | Goal Detail | select | Funding account |
| `goals-detail-member-select` | Goal Detail | select | Member selection |
| `goals-detail-notes-textarea` | Goal Detail | textarea | Contribution notes |
| `goals-detail-submit-button` | Goal Detail | button | Submit contribution |

---

## Investments — Holdings & Dashboard (`Investments.tsx`, `AddInvestment.tsx`, `EditInvestment.tsx`, `WealthVaultDashboard.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `investments-create-back-button` | Add Investment | button | Back to Investments list |
| `investments-create-type-${key}-button` | Add Investment | button | Asset type button (e.g. `stocks`) |
| `investments-create-name-input` | Add Investment | input[type=text] | Asset Name |
| `investments-create-suggestion-${r.symbol}` | Add Investment | button | Autocomplete ticker symbol selection |
| `investments-ocr-file-input` | Add Investment | input[type=file] | Bill OCR File upload |
| `investments-ocr-scan-button` | Add Investment | button | Trigger scan button |
| `investments-create-weight-input` | Add Investment | input[type=number] | Gold / metal weight |
| `investments-create-weight-unit` | Add Investment | select | Weight unit selection |
| `investments-create-purity-input` | Add Investment | input[type=number] | Gold purity |
| `investments-create-form-select` | Add Investment | select | Metal Form (bar, coin, jewelry) |
| `investments-create-huid-input` | Add Investment | input[type=text] | HUID code |
| `investments-create-jeweler-input` | Add Investment | input[type=text] | Jeweler shop name |
| `investments-create-locker-input` | Add Investment | input[type=text] | Physical locker location |
| `investments-create-ownership-${tag}-button` | Add Investment | button | Co-ownership tag selector |
| `investments-create-property-type` | Add Investment | select | Real Estate - property type |
| `investments-create-property-location` | Add Investment | input[type=text] | Real Estate - location |
| `investments-create-property-area` | Add Investment | input[type=number] | Real Estate - area size |
| `investments-create-property-yield` | Add Investment | input[type=number] | Real Estate - rental yield |
| `investments-create-property-docsafe` | Add Investment | input[type=file] | Real Estate - registry document |
| `investments-create-business-percent` | Add Investment | input[type=number] | Business - equity stake % |
| `investments-create-business-sector` | Add Investment | input[type=text] | Business - sector name |
| `investments-create-broker-input` | Add Investment | input[type=text] | Broker / platform name |
| `investments-create-date-input` | Add Investment | input[type=date] | Purchase Date |
| `investments-create-notes-textarea` | Add Investment | textarea | Notes |
| `investments-create-account-dropdown` | Add Investment | Dropdown | Funding account |
| `investments-create-quantity-input` | Add Investment | input[type=number] | Quantity |
| `investments-create-price-input` | Add Investment | input[type=number] | Purchase Price |
| `investments-create-fees-input` | Add Investment | input[type=number] | Brokerage fees |
| `investments-edit-type-select` | Edit Investment | select | Asset type |
| `investments-edit-name-input` | Edit Investment | input[type=text] | Asset Name |
| `investments-edit-quantity-input` | Edit Investment | input[type=number] | Quantity |
| `investments-edit-buy-price-input` | Edit Investment | input[type=number] | Purchase Price |
| `investments-edit-account-select` | Edit Investment | select | Funding account |
| `investments-edit-fees-input` | Edit Investment | input[type=number] | Fees |
| `investments-edit-current-price-input` | Edit Investment | input[type=number] | Current Price |
| `investments-edit-date-input` | Edit Investment | input[type=date] | Purchase date |
| `investments-edit-cancel-button` | Edit Investment | button | Close modal |
| `investments-edit-submit-button` | Edit Investment | button | Save changes |
| `investments-edit-weight-input` | Edit Investment | input[type=number] | Edit metal weight |
| `investments-edit-purity-input` | Edit Investment | input[type=number] | Edit purity |
| `investments-edit-form-select` | Edit Investment | select | Edit form |
| `investments-edit-huid-input` | Edit Investment | input[type=text] | Edit HUID |
| `investments-edit-jeweler-input` | Edit Investment | input[type=text] | Edit Jeweler |
| `investments-edit-locker-input` | Edit Investment | input[type=text] | Edit locker location |
| `investments-edit-ownership-${tag}-button` | Edit Investment | button | Edit co-ownership |
| `investments-edit-property-type` | Edit Investment | select | Edit property type |
| `investments-edit-property-location` | Edit Investment | input[type=text] | Edit property location |
| `investments-edit-property-area` | Edit Investment | input[type=number] | Edit area size |
| `investments-edit-property-yield` | Edit Investment | input[type=number] | Edit yield |
| `investments-edit-business-percent` | Edit Investment | input[type=number] | Edit business stake % |
| `investments-edit-business-sector` | Edit Investment | input[type=text] | Edit sector |
| `investments-add-button` | Investments | button | Add Investment CTA |
| `investments-tab-${id}-button` | Investments | button | Tab buttons (holdings, orders, etc.) |
| `investments-refresh-prices-button` | Investments | button | Live price refresh CTA |
| `investments-edit-button-${inv.id}` | Investments | button | Edit holding card button |
| `investments-complete-order-button-${inv.id}` | Investments | button | Order fulfillment action |
| `investments-delete-button-${inv.id}` | Investments | button | Delete holding card |
| `investments-mobile-edit-button-${inv.id}` | Investments | button | Mobile list edit |
| `investments-mobile-delete-button-${inv.id}` | Investments | button | Mobile list delete |
| `investments-mobile-complete-order-button-${inv.id}` | Investments | button | Mobile list complete order |
| `investments-empty-state-add-button` | Investments | button | Empty state CTA |
| `vault-refresh-prices-button` | Wealth Vault | button | Price refresh CTA |
| `vault-add-asset-button` | Wealth Vault | button | Add Asset CTA |
| `vault-scan-bill-banner` | Wealth Vault | button | OCR scan banner |
| `vault-empty-state-add-button` | Wealth Vault | button | Empty state CTA |

---

## Advisor — Booking & Workspace (`BookAdvisor.tsx`, `AdvisorPanel.tsx`, `AdvisorWorkspace.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `advisor-become-button` | Book Advisor | button | "Become an Advisor" CTA |
| `advisor-search-input` | Book Advisor | input[type=text] | Search advisors |
| `advisor-card-${advisor.id}` | Book Advisor | div | Advisor display card |
| `advisor-booking-session-${st.id}-button` | Book Advisor | button | Session slot selector |
| `advisor-booking-topic-input` | Book Advisor | input[type=text] | Booking topic |
| `advisor-booking-date-input` | Book Advisor | input[type=date] | Booking date |
| `advisor-booking-time-input` | Book Advisor | input[type=time] | Booking time |
| `advisor-booking-notes-textarea` | Book Advisor | textarea | Booking notes |
| `advisor-booking-submit-button` | Book Advisor | button | Submit booking |
| `advisor-apply-name-input` | Book Advisor | input[type=text] | Apply - Full Name |
| `advisor-apply-phone-input` | Book Advisor | input[type=tel] | Apply - Phone number |
| `advisor-apply-expertise-input` | Book Advisor | input[type=text] | Apply - Expertise keywords |
| `advisor-apply-experience-input` | Book Advisor | input[type=number] | Apply - Years of experience |
| `advisor-apply-organization-input` | Book Advisor | input[type=text] | Apply - Organization name |
| `advisor-apply-bio-textarea` | Book Advisor | textarea | Apply - Biography |
| `advisor-apply-pan-upload` | Book Advisor | input[type=file] | PAN card document |
| `advisor-apply-aadhaar-upload` | Book Advisor | input[type=file] | Aadhaar document |
| `advisor-apply-cert-upload` | Book Advisor | input[type=file] | Certificate document |
| `advisor-apply-cancel-button` | Book Advisor | button | Cancel application |
| `advisor-apply-submit-button` | Book Advisor | button | Submit application |
| `advisor-panel-avail-toggle-${idx}` | Advisor Panel | button | Toggle weekday availability |
| `advisor-panel-booking-accept-${booking.id}` | Advisor Panel | button | Accept booking request |
| `advisor-panel-booking-decline-${booking.id}` | Advisor Panel | button | Decline booking request |
| `advisor-panel-session-start-${booking.id}` | Advisor Panel | button | Start video session |
| `advisor-ws-avail-status-button` | Advisor Workspace | button | Advisor online status toggle |
| `advisor-ws-tab-${tab.id}-button` | Advisor Workspace | button | Workspace navigation tabs |
| `advisor-ws-booking-accept-${b.id}` | Advisor Workspace | button | Accept appointment request |
| `advisor-ws-booking-reschedule-toggle-${b.id}` | Advisor Workspace | button | Toggle reschedule form |
| `advisor-ws-booking-reject-${b.id}` | Advisor Workspace | button | Reject/decline appointment |
| `advisor-ws-sched-start-${idx}` | Advisor Workspace | select | Daily start hours |
| `advisor-ws-sched-end-${idx}` | Advisor Workspace | select | Daily end hours |
| `advisor-ws-sched-active-toggle-${idx}` | Advisor Workspace | button | Daily work toggle |
| `advisor-ws-resched-date-input` | Advisor Workspace | input[type=date] | Reschedule - Date |
| `advisor-ws-resched-time-input` | Advisor Workspace | input[type=time] | Reschedule - Time |
| `advisor-ws-resched-cancel-button` | Advisor Workspace | button | Cancel rescheduling |
| `advisor-ws-resched-submit-button` | Advisor Workspace | button | Submit new schedule |

---

## Manager — Advisor Verifications (`ManagerAdvisorVerification.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `manager-verify-refresh-button` | Manager Verification | button | Refresh application queue |
| `manager-verify-tab-${tab}-button` | Manager Verification | button | Filter tabs (Pending, Approved, Rejected) |
| `manager-verify-review-button-${app.id}` | Manager Verification | button | Review details button |
| `manager-verify-approve-button` | Manager Verification | button | Approve advisor application |
| `manager-verify-reject-toggle` | Manager Verification | button | Toggle rejection form |
| `manager-verify-reject-reason-textarea` | Manager Verification | textarea | Rejection feedback |
| `manager-verify-reject-confirm-button` | Manager Verification | button | Confirm rejection |
| `manager-verify-reject-cancel-button` | Manager Verification | button | Cancel rejection |

---

## Recurring Transactions (`RecurringTransactions.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `recurring-toggle-form-button` | Recurring | button | Toggle create schedule form |
| `recurring-form-name-input` | Recurring | input[type=text] | Schedule Template Name |
| `recurring-form-amount-input` | Recurring | input[type=number] | Schedule Amount |
| `recurring-form-type-select` | Recurring | select | Schedule Type (income/expense) |
| `recurring-form-category-input` | Recurring | input[type=text] | Category |
| `recurring-form-frequency-select` | Recurring | select | Frequency (daily, weekly, monthly) |
| `recurring-form-date-input` | Recurring | input[type=date] | Start Date |
| `recurring-form-account-select` | Recurring | select | Funding Account |
| `recurring-form-submit-button` | Recurring | button | Create schedule |
| `recurring-card-toggle-${item.id}` | Recurring | button | Pause / Resume schedule |
| `recurring-card-delete-${item.id}` | Recurring | button | Delete recurring schedule |

---

## Voice Assistant (`VoiceAICommandCenter.tsx`, `VoiceReview.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `voice-ai-close-button` | Voice Command Center | button | Close panel |
| `voice-ai-account-select` | Voice Command Center | select | Funding/Destination account |
| `voice-ai-action-desc-input-${index}` | Voice Command Center | input[type=text] | Action details input (edit mode) |
| `voice-ai-action-desc-${index}` | Voice Command Center | span | Action details display |
| `voice-ai-action-edit-button-${index}` | Voice Command Center | button | Edit action details |
| `voice-ai-action-category-select-${index}` | Voice Command Center | select | Action category (edit mode) |
| `voice-ai-action-category-${index}` | Voice Command Center | span | Action category display |
| `voice-ai-action-amount-input-${index}` | Voice Command Center | input[type=number] | Action amount (edit mode) |
| `voice-ai-action-amount-${index}` | Voice Command Center | span | Action amount display |
| `voice-ai-action-remove-button-${index}` | Voice Command Center | button | Remove action item |
| `voice-ai-add-more-button` | Voice Command Center | button | Add more transactions manually |
| `voice-ai-submit-button` | Voice Command Center | button | Confirm/Submit parsed commands |
| `voice-review-back-button` | Voice Review | button | Back |
| `voice-review-account-select` | Voice Review | select | Default account selection |
| `voice-review-intent-select-${index}` | Voice Review | select | Intent class selection (expense, transfer, etc.) |
| `voice-review-remove-button-${index}` | Voice Review | button | Remove parsed entry |
| `voice-review-amount-input-${index}` | Voice Review | input[type=number] | Edit parsed amount |
| `voice-review-date-input-${index}` | Voice Review | input[type=date] | Edit parsed date |
| `voice-review-category-dropdown-${index}` | Voice Review | Dropdown | Edit parsed category |
| `voice-review-description-input-${index}` | Voice Review | input[type=text] | Edit parsed description |
| `voice-review-goal-select-${index}` | Voice Review | Dropdown | Edit parsed target goal |
| `voice-review-open-transfer-${index}` | Voice Review | button | Redirect to transfer flow |
| `voice-review-open-goals-${index}` | Voice Review | button | Redirect to goals flow |
| `voice-review-open-groups-${index}` | Voice Review | button | Redirect to groups flow |
| `voice-review-open-investment-${index}` | Voice Review | button | Redirect to investment flow |
| `voice-review-save-button` | Voice Review | button | Save all transactions |

---

## User Settings, Profile & Notifications (`Settings.tsx`, `UserProfile.tsx`, `Notifications.tsx`)

| Automation ID | Screen | Element Type | Notes |
|---|---|---|---|
| `settings-language-select` | Settings | select | Default display language |
| `settings-currency-select` | Settings | select | Base currency indicator |
| `settings-notif-toggle-${key}` | Settings | button | Specific notifications settings toggle |
| `settings-sms-toggle` | Settings | button | SMS transaction parser toggle |
| `settings-export-json-button` | Settings | button | Backup as JSON |
| `settings-export-csv-button` | Settings | button | Backup as CSV |
| `settings-import-button` | Settings | button | Import from local backup file |
| `settings-create-backup-button` | Settings | button | Initiate new cloud backup |
| `settings-clear-data-button` | Settings | button | Clear all IndexedDB store |
| `settings-privacy-link` | Settings | link | Privacy Policy link |
| `settings-terms-link` | Settings | link | Terms of Service link |
| `profile-choose-avatar-button` | User Profile | button | Show avatar library |
| `profile-save-avatar-button` | User Profile | button | Save selected avatar |
| `profile-avatar-select-${avatar.id}` | User Profile | button | Choose specific avatar option |
| `profile-edit-basic-button` | User Profile | button | Edit basic profile details |
| `profile-first-name-input` | User Profile | input[type=text] | First Name field |
| `profile-last-name-input` | User Profile | input[type=text] | Last Name field |
| `profile-gender-select` | User Profile | select | Gender classification |
| `profile-dob-input` | User Profile | input[type=date] | Date of Birth |
| `profile-job-type-select` | User Profile | select | Occupation category |
| `profile-income-input` | User Profile | select | Annual income tier |
| `profile-save-basic-button` | User Profile | button | Save basic settings |
| `profile-edit-location-button` | User Profile | button | Edit location settings |
| `profile-city-search-input` | User Profile | input[type=text] | Search for local city |
| `profile-city-suggest-${idx}` | User Profile | button | Select search suggestion |
| `profile-currency-select` | User Profile | select | Local base currency selection |
| `profile-save-location-button` | User Profile | button | Save location settings |
| `profile-change-email-button` | User Profile | button | Trigger change email flow |
| `profile-new-email-input` | User Profile | input[type=email] | Input new email address |
| `profile-send-email-otp-button` | User Profile | button | Send validation OTP to new email |
| `profile-cancel-email-change-button` | User Profile | button | Cancel email change flow |
| `profile-email-otp-input` | User Profile | input[type=text] | Email validation OTP code input |
| `profile-verify-email-otp-button` | User Profile | button | Submit email validation OTP code |
| `profile-cancel-email-otp-button` | User Profile | button | Cancel email OTP validation |
| `profile-change-mobile-button` | User Profile | button | Trigger change mobile flow |
| `profile-new-mobile-input` | User Profile | input[type=tel] | Input new phone number |
| `profile-send-mobile-otp-button` | User Profile | button | Send validation OTP to new mobile |
| `profile-cancel-mobile-change-button` | User Profile | button | Cancel mobile change flow |
| `profile-mobile-otp-input` | User Profile | input[type=text] | Mobile validation OTP code input |
| `profile-verify-mobile-otp-button` | User Profile | button | Submit mobile validation OTP code |
| `profile-cancel-mobile-otp-button` | User Profile | button | Cancel mobile OTP validation |
| `profile-change-pin-button` | User Profile | button | Update security PIN CTA |
| `profile-current-pin-input` | User Profile | input[type=password] | Input current security PIN |
| `profile-new-pin-input` | User Profile | input[type=password] | Input new security PIN |
| `profile-confirm-pin-input` | User Profile | input[type=password] | Confirm new security PIN |
| `profile-update-pin-button` | User Profile | button | Submit PIN update |
| `profile-cancel-pin-button` | User Profile | button | Cancel PIN update flow |
| `profile-signout-button` | User Profile | button | Log out of application |
| `profile-delete-account-button` | User Profile | button | Initiate account deletion |
| `profile-delete-password-input` | User Profile | input[type=password] | Confirm security password to delete |
| `profile-delete-cancel-button` | User Profile | button | Cancel account deletion |
| `profile-delete-confirm-button` | User Profile | button | Confirm permanent account deletion |
| `profile-delete-close-button` | User Profile | button | Dismiss deletion confirmation window |
| `profile-floating-discard-button` | User Profile | button | Profile form Discard |
| `profile-floating-save-button` | User Profile | button | Profile form Save |
| `notifications-mark-all-read-button` | Notifications | button | Mark all incoming alerts as read |
| `notifications-clear-all-button` | Notifications | button | Delete all notifications |
| `notifications-filter-tab-${filter.value}` | Notifications | button | Alert categorization tabs |
| `notifications-card-select-${notification.id}` | Notifications | div | Open details of a specific notification |
| `notifications-delete-button-${notification.id}` | Notifications | button | Remove specific alert |
| `notifications-mark-read-button-${notification.id}` | Notifications | button | Mark specific alert as read |
| `notifications-open-button-${notification.id}` | Notifications | button | deep-link action trigger |

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
