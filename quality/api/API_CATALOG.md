# API catalog

All HTTP endpoints, by feature module — aggregated from the per-module READMEs
(`backend/src/modules/*/README.md`). **238 endpoints** across
36 modules. Base prefix: `/api/v1`.

> Regenerate with `npm run docs:catalogs`. For a machine-readable spec, use the
> live OpenAPI document (see [README](./README.md)).

---

### `aa` — `/api/v1/aa`

RBI Account Aggregator (Setu) integration — consent flows and financial-data fetch.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/aa/consent` | auth, validated | `NextFunction` |
| GET | `/aa/consent/status/:consentHandle` | auth, validated | `NextFunction` |
| GET | `/aa/consent/artifact/:consentId` | auth, validated | `NextFunction` |
| POST | `/aa/data/session` | auth, validated | `NextFunction` |
| GET | `/aa/data/fetch/:sessionId` | auth, validated | `NextFunction` |
| GET | `/aa/consents` | auth | `NextFunction` |
| POST | `/aa/consent/revoke/:consentId` | auth, validated | `NextFunction` |
| GET | `/aa/financial-summary` | auth | `NextFunction` |
| POST | `/aa/notification` | auth, validated | `NextFunction` |

---

### `accounts` — `/api/v1/accounts`

User bank/cash/credit accounts — CRUD with feature-gated create/edit/delete.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/accounts` | auth | `AccountController.getAccounts` |
| POST | `/accounts` | auth, feature:accounts.createAccount, validated | `AccountController.createAccount` |
| GET | `/accounts/:id` | auth, validated | `AccountController.getAccount` |
| PUT | `/accounts/:id` | auth, feature:accounts.editAccount, validated | `AccountController.updateAccount` |
| DELETE | `/accounts/:id` | auth, feature:accounts.deleteAccount, validated | `AccountController.deleteAccount` |

---

### `admin` — `/api/v1/admin`

Admin console — user/role management, feature flags, and operational dashboards (admin role required).

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/admin/features` | auth | `AdminController.getFeatureFlags` |
| GET | `/admin/ai-features` | auth | `AdminController.getAIFeatureFlags` |
| GET | `/admin/users` | auth | `AdminController.getAllUsers` |
| GET | `/admin/users/pending` | auth | `AdminController.getPendingAdvisors` |
| POST | `/admin/users/:advisorId/approve` | auth | `AdminController.approveAdvisor` |
| POST | `/admin/users/:advisorId/reject` | auth | `AdminController.rejectAdvisor` |
| GET | `/admin/users/activity` | auth | `AdminController.getUserActivity` |
| POST | `/admin/users/:userId/status` | auth | `AdminController.toggleUserStatus` |
| POST | `/admin/users/:userId/role` | auth | `AdminController.updateUserRole` |
| DELETE | `/admin/users/:userId` | auth | `AdminController.deleteUser` |
| GET | `/admin/users/:userId/storage` | auth | `AdminController.getUserStorageStats` |
| GET | `/admin/stats` | auth | `AdminController.getPlatformStats` |
| GET | `/admin/cache/metrics` | auth, validated | `AdminController.getCacheMetrics` |
| POST | `/admin/features/toggle` | auth | `AdminController.toggleFeatureFlag` |
| POST | `/admin/ai-features/toggle` | auth | `AdminController.toggleAIFeatureFlags` |
| GET | `/admin/reports/users` | auth | `AdminController.getUsersReport` |
| GET | `/admin/reports/revenue` | auth | `AdminController.getRevenueReport` |
| GET | `/admin/ai/overview` | auth | `getAdminAIOverview` |
| GET | `/admin/ai/users` | auth, validated | `getAdminAIUsers` |
| GET | `/admin/ai/insights` | auth, validated | `getAdminAIInsights` |
| GET | `/admin/ai/patterns` | auth | `getAdminAIPatterns` |
| GET | `/admin/ai/accuracy` | auth | `getAdminAIAccuracy` |
| GET | `/admin/ai/raw/:userId` | auth, validated | `getAdminAIRawUserData` |
| POST | `/admin/ai/run/features` | auth, validated | `runAdminFeatureRefresh` |
| POST | `/admin/ai/run/predictions` | auth, validated | `runAdminPredictionRefresh` |
| GET | `/admin/ai/config` | auth | `getAdminAIConfig` |
| POST | `/admin/ai/config` | auth | `updateAdminAIConfig` |

---

### `advisors` — `/api/v1/advisors`

Financial advisor directory, verification, and ratings.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/advisors` | auth | `AdvisorController.listAdvisors` |
| GET | `/advisors/application/my` | auth | `AdvisorController.getMyApplication` |
| GET | `/advisors/application/:id/document/:docType` | auth | `AdvisorController.getApplicationDocument` |
| POST | `/advisors/apply` | auth | `—` |
| PUT | `/advisors/online-status` | auth, admin | `AdvisorController.setOnlineStatus` |
| PUT | `/advisors/role-mode` | auth, admin | `AdvisorController.switchRoleMode` |
| POST | `/advisors/availability` | auth, admin | `AdvisorController.setAvailability` |
| PUT | `/advisors/availability/status` | auth, admin | `AdvisorController.setAvailabilityStatus` |
| GET | `/advisors/:id/availability` | auth | `AdvisorController.getAvailability` |
| DELETE | `/advisors/availability/:id` | auth, admin | `AdvisorController.deleteAvailability` |
| GET | `/advisors/me/sessions` | auth, admin | `AdvisorController.getSessions` |
| PUT | `/advisors/sessions/:id/rate` | auth | `AdvisorController.rateSession` |
| GET | `/advisors/admin/applications` | auth, admin | `AdvisorController.listPendingAdvisors` |
| PUT | `/advisors/admin/:id/approve` | auth, admin | `AdvisorController.approveAdvisor` |
| PUT | `/advisors/admin/:id/reject` | auth, admin | `AdvisorController.rejectAdvisor` |
| GET | `/advisors/:id` | auth | `AdvisorController.getAdvisor` |

---

### `ai` — `/api/v1/ai`

AI/LLM features — insights, NLQ, document intelligence (lazy-loaded).

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/ai/events` | auth, validated | `captureAIEvent` |
| GET | `/ai/quota` | auth | `Response` |
| GET | `/ai/insights` | auth | `Response` |
| GET | `/ai/health-score` | auth | `Response` |
| GET | `/ai/recommendations` | auth | `Response` |
| GET | `/ai/fraud-alerts` | auth | `Response` |
| GET | `/ai/bill-predictions` | auth | `Response` |
| GET | `/ai/spending-patterns` | auth | `Response` |

---

### `auth` — `/api/v1/auth`

Authentication — login, registration, token issuance, device + OTP services (public).

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/auth/check-email` | public | `checkEmailAvailability` |
| POST | `/auth/register` | public | `register` |
| POST | `/auth/login/challenge` | public | `loginChallenge` |
| POST | `/auth/login` | public | `login` |
| POST | `/auth/refresh` | public | `refreshToken` |
| GET | `/auth/profile` | auth | `getProfile` |
| PUT | `/auth/profile` | auth | `updateProfile` |
| POST | `/auth/otp/send` | auth | `sendOtp` |
| POST | `/auth/otp/verify` | auth | `verifyOtpEndpoint` |
| GET | `/auth/devices` | auth | `getDevices` |
| DELETE | `/auth/devices/:deviceId` | auth | `revokeDevice` |
| DELETE | `/auth/account` | auth | `deleteAccount` |

---

### `avatars` — `/api/v1/avatars`

Avatar gallery and user avatar assignment (public assets).

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/avatars/dicebear/:style/svg` | public | `—` |

---

### `bills` — `/api/v1/bills`

Secure bill/document uploads with file-type validation (lazy-loaded).

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/bills` | auth | `BillsController.getBills` |
| GET | `/bills/:id` | auth | `BillsController.getBill` |
| POST | `/bills` | auth | `—` |
| DELETE | `/bills/:id` | auth | `BillsController.deleteBill` |

---

### `bookings` — `/api/v1/bookings`

Advisor session bookings.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/bookings` | auth | `—` |
| GET | `/bookings` | auth | `BookingController.getBookings` |
| GET | `/bookings/:id` | auth | `BookingController.getBooking` |
| PUT | `/bookings/:id/accept` | auth | `—` |
| PUT | `/bookings/:id/reject` | auth | `—` |
| PUT | `/bookings/:id/reschedule` | auth | `—` |
| PUT | `/bookings/:id/cancel` | auth | `—` |
| GET | `/bookings/workspace/clients` | auth | `—` |
| POST | `/bookings/:bookingId/fee/pay` | auth | `—` |

---

### `budgets` — `/api/v1/budgets`

Budgets and budget-alert thresholds.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/budgets` | auth, validated | `BudgetController.getBudgets` |
| POST | `/budgets` | auth, validated | `BudgetController.createBudget` |
| GET | `/budgets/:id` | auth, validated | `BudgetController.getBudget` |
| PUT | `/budgets/:id` | auth, validated | `BudgetController.updateBudget` |
| DELETE | `/budgets/:id` | auth, validated | `BudgetController.deleteBudget` |
| POST | `/budgets/:id/recalculate` | auth, validated | `BudgetController.recalculateBudgetSpent` |

---

### `categorization` — `/api/v1/categorize`

Transaction auto-categorization and learning (also mounts /learn).

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/categorize` | auth, validated | `CategorizationController.categorize` |

---

### `collaboration` — `/api/v1/collaborations`

Unified invitation/notification system across Group Expenses, To-Do Lists, and Goals.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/collaborations` | auth, validated | `CollaborationController.listCollaborations` |
| GET | `/collaborations/pending` | auth | `CollaborationController.listPendingCollaborations` |
| GET | `/collaborations/:id` | auth, validated | `CollaborationController.getCollaboration` |
| DELETE | `/collaborations/:id` | auth, validated | `CollaborationController.revokeCollaboration` |

---

### `dashboard` — `/api/v1/dashboard`

Cross-feature dashboard aggregation.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/dashboard/summary` | auth | `getDashboardSummary` |
| GET | `/dashboard/cashflow` | auth | `getCashflow` |

---

### `devices` — `/api/v1/devices`

Device registration and management for multi-device sync.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/devices` | auth | `DeviceController.registerDevice` |
| GET | `/devices` | auth | `DeviceController.getDevices` |
| GET | `/devices/:deviceId` | auth | `DeviceController.getDevice` |
| POST | `/devices/:deviceId/sync` | auth | `DeviceController.updateSync` |
| PUT | `/devices/:deviceId/tokens` | auth | `DeviceController.updateNotificationTokens` |
| POST | `/devices/:deviceId/deactivate` | auth | `DeviceController.deactivateDevice` |
| DELETE | `/devices/:deviceId` | auth | `DeviceController.deleteDevice` |

---

### `friends` — `/api/v1/friends`

Friends list and friend requests.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/friends` | auth | `FriendController.getFriends` |
| POST | `/friends` | auth, validated | `FriendController.createFriend` |
| POST | `/friends/bulk` | auth, validated | `FriendController.bulkCreateFriends` |
| POST | `/friends/import` | auth | `FriendController.importFriendsCsv` |
| GET | `/friends/:id` | auth, validated | `FriendController.getFriendDetail` |
| PUT | `/friends/:id` | auth, validated | `FriendController.updateFriend` |
| DELETE | `/friends/:id` | auth, validated | `FriendController.deleteFriend` |

---

### `goals` — `/api/v1/goals`

Savings goals — CRUD and contribution tracking.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/goals` | auth | `GoalController.getGoals` |
| POST | `/goals` | auth, validated | `GoalController.createGoal` |
| GET | `/goals/:id` | auth, validated | `GoalController.getGoal` |
| PUT | `/goals/:id` | auth, validated | `GoalController.updateGoal` |
| DELETE | `/goals/:id` | auth, validated | `GoalController.deleteGoal` |
| GET | `/goals/:id/members` | auth, validated | `GoalController.getGoalMembers` |
| POST | `/goals/:id/members` | auth, validated | `GoalController.addGoalMember` |
| DELETE | `/goals/:id/members/:memberId` | auth | `GoalController.removeGoalMember` |

---

### `gold` — `/api/v1/gold`

Gold/precious-metal holdings and live rates.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/gold` | auth, validated | `GoldController.getGoldAssets` |
| POST | `/gold` | auth, validated | `GoldController.createGoldAsset` |
| GET | `/gold/:id` | auth, validated | `GoldController.getGoldAsset` |
| PUT | `/gold/:id` | auth, validated | `GoldController.updateGoldAsset` |
| DELETE | `/gold/:id` | auth, validated | `GoldController.deleteGoldAsset` |

---

### `groups` — `/api/v1/groups`

Group expenses and shared-expense settlement.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/groups` | auth | `GroupController.getGroups` |
| POST | `/groups/repair-all-members` | auth, admin | `GroupController.repairAllGroupMembers` |
| POST | `/groups` | auth, validated | `GroupController.createGroup` |
| GET | `/groups/:id` | auth, validated | `GroupController.getGroup` |
| PUT | `/groups/:id` | auth, validated | `GroupController.updateGroup` |
| POST | `/groups/:id/repair-members` | auth, validated | `GroupController.repairGroupMembers` |
| DELETE | `/groups/:id` | auth, validated | `GroupController.deleteGroup` |

---

### `import` — `/api/v1/import`

Statement/CSV import and smart expense ingestion.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/import/upload` | auth, feature:accounts.importStatement | `uploadImport` |
| POST | `/import/confirm` | auth, feature:accounts.importStatement, validated | `confirmImport` |
| GET | `/import/:sessionId` | auth, feature:accounts.importStatement | `getImportSession` |

---

### `investments` — `/api/v1/investments`

Investment holdings (stocks, MFs, etc.) and valuation.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/investments` | auth | `InvestmentController.getInvestments` |
| GET | `/investments/:id` | auth, validated | `InvestmentController.getInvestment` |
| POST | `/investments` | auth, validated | `InvestmentController.createInvestment` |
| PUT | `/investments/:id` | auth, validated | `InvestmentController.updateInvestment` |
| DELETE | `/investments/:id` | auth, validated | `InvestmentController.deleteInvestment` |

---

### `loans` — `/api/v1/loans`

Loans and EMI tracking.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/loans` | auth | `LoanController.getLoans` |
| POST | `/loans` | auth, validated | `LoanController.createLoan` |
| GET | `/loans/:id` | auth, validated | `LoanController.getLoan` |
| PUT | `/loans/:id` | auth, validated | `LoanController.updateLoan` |
| DELETE | `/loans/:id` | auth, validated | `LoanController.deleteLoan` |
| POST | `/loans/:id/payment` | auth, validated | `LoanController.addLoanPayment` |

---

### `notifications` — `/api/v1/notifications`

In-app notifications and notification preferences.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/notifications` | auth | `NotificationController.getNotifications` |
| GET | `/notifications/unread/count` | auth | `NotificationController.getUnreadCount` |
| GET | `/notifications/:id` | auth | `NotificationController.getNotification` |
| PUT | `/notifications/:id/read` | auth | `NotificationController.markAsRead` |
| POST | `/notifications/mark-all-read` | auth | `NotificationController.markAllAsRead` |
| DELETE | `/notifications/:id` | auth | `NotificationController.deleteNotification` |
| DELETE | `/notifications` | auth | `NotificationController.clearAllNotifications` |
| POST | `/notifications/send` | auth, admin | `NotificationController.sendNotification` |

---

### `otp` — `/api/v1/otp`

RBI-compliant OTP generation and verification.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/otp/send` | auth, validated | `NextFunction` |
| POST | `/otp/verify` | auth, validated | `NextFunction` |

---

### `payments` — `/api/v1/payments`

Payment processing and settlement (includes provider webhook).

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/payments/webhook` | auth | `PaymentController.handleWebhook` |
| GET | `/payments` | auth | `PaymentController.getPayments` |
| GET | `/payments/:id` | auth | `PaymentController.getPayment` |
| POST | `/payments/initiate` | auth, validated | `PaymentController.initiatePayment` |
| POST | `/payments/complete` | auth, validated | `PaymentController.completePayment` |
| POST | `/payments/fail` | auth, validated | `PaymentController.failPayment` |
| POST | `/payments/refund` | auth, validated | `PaymentController.refundPayment` |

---

### `pin` — `/api/v1/pin`

App PIN setup and verification.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/pin/create` | auth | `NextFunction` |
| POST | `/pin/verify` | auth | `NextFunction` |
| POST | `/pin/verify-security` | auth | `NextFunction` |
| POST | `/pin/update` | auth | `NextFunction` |
| GET | `/pin/status` | auth | `NextFunction` |
| GET | `/pin/key-backup` | auth | `NextFunction` |
| POST | `/pin/key-backup` | auth | `NextFunction` |
| DELETE | `/pin/key-backup` | auth | `NextFunction` |
| GET | `/pin/expiring-soon` | auth | `NextFunction` |
| POST | `/pin/reset` | auth | `NextFunction` |
| POST | `/pin/self-reset` | auth | `NextFunction` |

---

### `receipts` — `/api/v1/receipts`

Receipt OCR scanning and parsing (lazy-loaded).

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/receipts/start` | auth | `—` |
| GET | `/receipts/status/:jobId` | auth | `—` |
| POST | `/receipts/scan` | auth | `—` |

---

### `recurring` — `/api/v1/recurring`

Recurring transactions and schedules.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/recurring` | auth, validated | `RecurringController.getRecurringTransactions` |
| POST | `/recurring` | auth, validated | `RecurringController.createRecurringTransaction` |
| GET | `/recurring/:id` | auth, validated | `RecurringController.getRecurringTransaction` |
| PUT | `/recurring/:id` | auth, validated | `RecurringController.updateRecurringTransaction` |
| DELETE | `/recurring/:id` | auth, validated | `RecurringController.deleteRecurringTransaction` |
| PATCH | `/recurring/:id/toggle` | auth, validated | `RecurringController.toggleRecurringStatus` |

---

### `sessions` — `/api/v1/sessions`

Advisor↔client session lifecycle.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/sessions/:id` | auth, validated | `SessionController.getSession` |
| POST | `/sessions/:id/messages` | auth, validated | `SessionController.sendMessage` |
| GET | `/sessions/:id/messages` | auth, validated | `SessionController.getMessages` |
| POST | `/sessions/:id/start` | auth, validated | `SessionController.startSession` |
| POST | `/sessions/:id/complete` | auth, validated | `SessionController.completeSession` |
| POST | `/sessions/:id/cancel` | auth, validated | `SessionController.cancelSession` |

---

### `settings` — `/api/v1/settings`

User preferences and app settings.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/settings` | auth | `SettingsController.getSettings` |
| PUT | `/settings` | auth, validated | `SettingsController.updateSettings` |

---

### `stocks` — `/api/v1/stocks`

Public stock/market quotes proxy.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/stocks/markets` | public | `stockController.getMarkets` |
| GET | `/stocks/search` | public | `stockController.searchStocks` |
| GET | `/stocks/stock` | public | `stockController.getStockQuote` |
| GET | `/stocks/batch` | public | `stockController.getBatchQuotes` |

---

### `sync` — `/api/v1/sync`

Offline-first client↔server data synchronization.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/sync/pull` | auth | `NextFunction` |
| POST | `/sync/push` | auth | `NextFunction` |
| POST | `/sync/register-device` | auth | `NextFunction` |
| GET | `/sync/devices` | auth | `NextFunction` |
| POST | `/sync/deactivate-device` | auth | `NextFunction` |

---


### `todos` — `/api/v1/todos`

To-do lists with collaboration/sharing.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/todos` | auth | `TodoController.getTodos` |
| POST | `/todos` | auth, validated | `TodoController.createTodo` |
| PUT | `/todos/:id` | auth, validated | `TodoController.updateTodo` |
| DELETE | `/todos/:id` | auth, validated | `TodoController.deleteTodo` |
| GET | `/todos/lists` | auth | `TodoController.getTodoLists` |
| POST | `/todos/lists` | auth | `TodoController.createTodoList` |
| PUT | `/todos/lists/:id` | auth | `TodoController.updateTodoList` |
| DELETE | `/todos/lists/:id` | auth | `TodoController.deleteTodoList` |
| GET | `/todos/items` | auth | `TodoController.getAllTodoItems` |
| GET | `/todos/lists/:listId/items` | auth | `TodoController.getTodoItems` |
| POST | `/todos/items` | auth | `TodoController.createTodoItem` |
| PUT | `/todos/items/:id` | auth | `TodoController.updateTodoItem` |
| DELETE | `/todos/items/:id` | auth | `TodoController.deleteTodoItem` |
| GET | `/todos/shares` | auth | `TodoController.getTodoListShares` |
| POST | `/todos/lists/:listId/share` | auth | `TodoController.shareTodoList` |
| PUT | `/todos/shares/:id` | auth | `TodoController.updateTodoListShare` |
| DELETE | `/todos/shares/:id` | auth | `TodoController.deleteTodoListShare` |

---

### `transactions` — `/api/v1/transactions`

Core income/expense transactions — CRUD with feature gates.

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/transactions` | auth | `—` |
| POST | `/transactions` | auth | `—` |
| GET | `/transactions/:id` | auth | `—` |
| PUT | `/transactions/:id` | auth | `—` |
| DELETE | `/transactions/:id` | auth | `—` |
| GET | `/transactions/account/:accountId` | auth | `—` |

---

### `voice` — `/api/v1/voice`

Voice command parsing and voice-driven transaction entry.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/voice/process-audio` | auth | `processVoiceAudio` |
| POST | `/voice/process` | auth, validated | `processVoice` |
| POST | `/voice/learn` | auth, validated | `learnFromCorrection` |

---

### `webhooks` — `/api/v1/webhooks`

Inbound webhooks from external providers (e.g. SendGrid) — public.

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/webhooks/sendgrid` | public | `receiveSendGridEvents` |
