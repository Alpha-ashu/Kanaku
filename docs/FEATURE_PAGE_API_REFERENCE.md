# Finora — Feature & Page API Reference

> **Base URL:** `https://your-api-domain.com/api/v1`  
> **Auth Header:** `Authorization: Bearer <JWT_TOKEN>` (required on all protected routes)  
> **Content-Type:** `application/json` (unless file upload — use `multipart/form-data`)  
> **Date:** June 9, 2026 | Auto-generated from codebase analysis

---

## Table of Contents

1. [Authentication & Onboarding](#1-authentication--onboarding)
2. [Dashboard / Home Screen](#2-dashboard--home-screen)
3. [Accounts Page](#3-accounts-page)
4. [Transactions Page](#4-transactions-page)
5. [Goals Page](#5-goals-page)
6. [Loans & Debt Page](#6-loans--debt-page)
7. [Investments Page](#7-investments-page)
8. [Group Expenses Page](#8-group-expenses-page)
9. [Friends Page](#9-friends-page)
10. [Bills & Documents Page](#10-bills--documents-page)
11. [Receipt Scanner Page](#11-receipt-scanner-page)
12. [Import Transactions Page](#12-import-transactions-page)
13. [AI Insights & Recommendations Page](#13-ai-insights--recommendations-page)
14. [Voice Assistant Page](#14-voice-assistant-page)
15. [Transaction Categorization](#15-transaction-categorization)
16. [Notifications Page](#16-notifications-page)
17. [Settings Page](#17-settings-page)
18. [PIN / App Lock](#18-pin--app-lock)
19. [Device Management](#19-device-management)
20. [Offline Sync](#20-offline-sync)
21. [Advisor Directory Page](#21-advisor-directory-page)
22. [Booking Page (Client)](#22-booking-page-client)
23. [Advisor Workspace Page (Advisor Role)](#23-advisor-workspace-page-advisor-role)
24. [Session / Chat Page](#24-session--chat-page)
25. [Payments Page](#25-payments-page)
26. [Admin Panel Page](#26-admin-panel-page)
27. [Stocks / Market Page](#27-stocks--market-page)
28. [Todos / Reminders Page](#28-todos--reminders-page)
29. [Avatar Management](#29-avatar-management)
30. [WebSocket Real-time Events](#30-websocket-real-time-events)

---

## 1. Authentication & Onboarding

**Pages:** Login, Register, Forgot Password, OTP Verification

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `POST` | `/auth/register` | ✗ | `{ email, name, password, role? }` | `{ accessToken, refreshToken, user }` |
| 2 | `POST` | `/auth/login` | ✗ | `{ email, password }` | `{ accessToken, refreshToken, user }` |
| 3 | `POST` | `/auth/login/challenge` | ✗ | `{ email }` | `{ challenge, sessionId }` |
| 4 | `GET` | `/auth/profile` | ✓ | — | `{ user: { id, name, email, role, ... } }` |
| 5 | `PUT` | `/auth/profile` | ✓ | `{ name?, firstName?, lastName?, gender?, dateOfBirth?, jobType?, salary?, country?, city? }` | `{ user }` |
| 6 | `POST` | `/auth/otp/send` | ✓ | `{ purpose? }` | `{ success, message }` |
| 7 | `POST` | `/auth/otp/verify` | ✓ | `{ code }` | `{ success, verified }` |
| 8 | `DELETE` | `/auth/account` | ✓ | — | `{ success }` |

**Request Example — Register:**
```json
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "SecurePass123!",
  "role": "user"
}
```

**Response Example:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "isApproved": false
  }
}
```

---

## 2. Dashboard / Home Screen

**Pages:** Main Dashboard, Cash Flow Overview

| # | Method | Endpoint | Auth | Query Params | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/dashboard/summary` | ✓ | `period?` | `{ totalBalance, income, expenses, savings, recentTransactions[] }` |
| 2 | `GET` | `/dashboard/cashflow` | ✓ | `startDate?, endDate?, period?` | `{ cashflow: [{ date, income, expenses }] }` |

**Combined Dashboard load — parallel API calls:**
```
GET /api/v1/dashboard/summary
GET /api/v1/dashboard/cashflow?period=monthly
GET /api/v1/accounts              (account balances)
GET /api/v1/notifications         (notification badge count)
GET /api/v1/ai/insights           (AI insight cards)
```

---

## 3. Accounts Page

**Pages:** Account List, Account Detail, Add/Edit Account

| # | Method | Endpoint | Auth | Request Body / Params | Response |
|---|--------|----------|------|-----------------------|----------|
| 1 | `GET` | `/accounts` | ✓ | — | `{ accounts: Account[] }` |
| 2 | `POST` | `/accounts` | ✓ | `{ name, type, provider?, country?, balance?, currency? }` | `{ account: Account }` |
| 3 | `GET` | `/accounts/:id` | ✓ | `:id` = account UUID | `{ account: Account }` |
| 4 | `PUT` | `/accounts/:id` | ✓ | `{ name?, type?, balance?, currency?, isActive? }` | `{ account: Account }` |
| 5 | `DELETE` | `/accounts/:id` | ✓ | `:id` = account UUID | `{ success }` |

**Account Detail page — parallel calls:**
```
GET /api/v1/accounts/:id
GET /api/v1/transactions/account/:accountId?limit=20
GET /api/v1/goals            (contributions linked to account)
```

**Account Type values:** `bank` | `cash` | `credit` | `investment` | `wallet`

---

## 4. Transactions Page

**Pages:** Transaction List, Transaction Detail, Add Transaction, Edit Transaction, Filter/Search

| # | Method | Endpoint | Auth | Query / Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/transactions` | ✓ | `?accountId&type&category&startDate&endDate&limit&offset&search` | `{ transactions: Transaction[], total, page }` |
| 2 | `POST` | `/transactions` | ✓ | `{ accountId, type, amount, category, description?, date, merchant?, tags? }` | `{ transaction: Transaction }` |
| 3 | `GET` | `/transactions/:id` | ✓ | `:id` = UUID | `{ transaction: Transaction }` |
| 4 | `PUT` | `/transactions/:id` | ✓ | `{ amount?, category?, description?, date?, tags? }` | `{ transaction: Transaction }` |
| 5 | `DELETE` | `/transactions/:id` | ✓ | `:id` = UUID | `{ success }` |
| 6 | `GET` | `/transactions/account/:accountId` | ✓ | `:accountId`, query: `limit?, offset?` | `{ transactions: Transaction[] }` |

**Transaction List page load:**
```
GET /api/v1/transactions?limit=50&offset=0
GET /api/v1/accounts                        (for account filter dropdown)
```

**Transaction type values:** `income` | `expense` | `transfer`

**Add Transaction — also calls:**
```
POST /api/v1/categorize                 (auto-suggest category)
POST /api/v1/transactions               (save transaction)
```

---

## 5. Goals Page

**Pages:** Goals List, Goal Detail, Add/Edit Goal, Goal Contributions

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/goals` | ✓ | — | `{ goals: Goal[] }` |
| 2 | `POST` | `/goals` | ✓ | `{ name, targetAmount, targetDate, description?, category?, isGroupGoal? }` | `{ goal: Goal }` |
| 3 | `GET` | `/goals/:id` | ✓ | `:id` = UUID | `{ goal: Goal }` |
| 4 | `PUT` | `/goals/:id` | ✓ | `{ name?, targetAmount?, targetDate?, description? }` | `{ goal: Goal }` |
| 5 | `DELETE` | `/goals/:id` | ✓ | `:id` = UUID | `{ success }` |

**Goal page AI enhancement call:**
```
GET /api/v1/ai/recommendations      (goal-based recommendations)
```

---

## 6. Loans & Debt Page

**Pages:** Loan List, Loan Detail, Add Loan, Add Payment, Repayment Schedule

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/loans` | ✓ | — | `{ loans: Loan[] }` |
| 2 | `POST` | `/loans` | ✓ | `{ type, name, principalAmount, interestRate?, emiAmount?, dueDate?, frequency?, contactPerson? }` | `{ loan: Loan }` |
| 3 | `GET` | `/loans/:id` | ✓ | `:id` = UUID | `{ loan: Loan, payments: LoanPayment[] }` |
| 4 | `PUT` | `/loans/:id` | ✓ | `{ name?, status?, emiAmount?, dueDate? }` | `{ loan: Loan }` |
| 5 | `DELETE` | `/loans/:id` | ✓ | `:id` = UUID | `{ success }` |
| 6 | `POST` | `/loans/:id/payment` | ✓ | `{ amount, date, accountId?, notes? }` | `{ payment: LoanPayment, updatedLoan: Loan }` |

**Loan type values:** `personal` | `home` | `car` | `education` | `business` | `given`

**AI bill prediction for loans:**
```
GET /api/v1/ai/bill-predictions     (upcoming EMI predictions)
```

---

## 7. Investments Page

**Pages:** Portfolio Overview, Add/Edit Investment, Performance View

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/investments` | ✓ | — | `{ investments: Investment[], totalValue, totalPL }` |
| 2 | `POST` | `/investments` | ✓ | `{ assetType, assetName, quantity, buyPrice, currentPrice, purchaseDate }` | `{ investment: Investment }` |
| 3 | `PUT` | `/investments/:id` | ✓ | `{ currentPrice?, quantity?, metadata? }` | `{ investment: Investment }` |
| 4 | `DELETE` | `/investments/:id` | ✓ | `:id` = UUID | `{ success }` |

**Asset type values:** `stock` | `crypto` | `mutual_fund` | `etf` | `bond` | `real_estate` | `other`

**Portfolio page — parallel calls:**
```
GET /api/v1/investments
GET /api/v1/stocks?symbols=AAPL,GOOGL    (live prices)
GET /api/v1/ai/recommendations           (investment suggestions)
```

---

## 8. Group Expenses Page

**Pages:** Group List, Group Detail, Add Group Expense, Member Split View, Settlement

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/groups` | ✓ | — | `{ groups: GroupExpense[] }` |
| 2 | `POST` | `/groups` | ✓ | `{ name, totalAmount, date, members[], splitType, category?, description? }` | `{ group: GroupExpense }` |
| 3 | `PUT` | `/groups/:id` | ✓ | `{ name?, totalAmount?, members?, splitType? }` | `{ group: GroupExpense }` |
| 4 | `DELETE` | `/groups/:id` | ✓ | `:id` = UUID | `{ success }` |

**Split type values:** `equal` | `percentage` | `custom` | `shares`

**Group Expense body example:**
```json
POST /api/v1/groups
{
  "name": "Dinner at Restaurant",
  "totalAmount": 120.00,
  "date": "2026-06-09T19:00:00Z",
  "category": "food",
  "splitType": "equal",
  "members": [
    { "name": "Alice", "email": "alice@example.com", "shareAmount": 40.00 },
    { "name": "Bob", "email": "bob@example.com", "shareAmount": 40.00 },
    { "name": "Me", "shareAmount": 40.00 }
  ]
}
```

---

## 9. Friends Page

**Pages:** Friends List, Add/Edit Friend, Friend Detail

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/friends` | ✓ | — | `{ friends: Friend[] }` |
| 2 | `POST` | `/friends` | ✓ | `{ name, email?, phone?, avatar?, notes? }` | `{ friend: Friend }` |
| 3 | `PUT` | `/friends/:id` | ✓ | `{ name?, email?, phone?, notes? }` | `{ friend: Friend }` |
| 4 | `DELETE` | `/friends/:id` | ✓ | `:id` = UUID | `{ success }` |

---

## 10. Bills & Documents Page

**Pages:** Bill List, Bill Upload, Bill Detail, OCR Processing Status

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/bills` | ✓ | — | `{ bills: ExpenseBill[] }` |
| 2 | `POST` | `/bills` | ✓ | `multipart/form-data: file (image/pdf)` | `{ bill: ExpenseBill, scanResult? }` |
| 3 | `DELETE` | `/bills/:id` | ✓ | `:id` = UUID | `{ success }` |

**Upload constraints:**
- Rate limit: **10 uploads per minute** per user
- File types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Max size: defined by `BILL_MAX_UPLOAD_BYTES` env var

---

## 11. Receipt Scanner Page

**Pages:** Camera Scan, Receipt Preview, Confirm Extracted Data

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `POST` | `/receipts/start` | ✓ | `multipart/form-data: file` | `{ jobId, status: "processing" }` |
| 2 | `GET` | `/receipts/status/:jobId` | ✓ | `:jobId` = job UUID | `{ jobId, status, result?: ExtractedData }` |
| 3 | `POST` | `/receipts/scan` *(deprecated)* | ✓ | `multipart/form-data: file` | `{ extractedData: { amount, merchant, date, category } }` |

**Async scan flow (recommended):**
```
1. POST /api/v1/receipts/start          → returns jobId
2. Poll GET /api/v1/receipts/status/:jobId every 2s
3. When status === "completed", show extracted data
4. User confirms → POST /api/v1/transactions  (save transaction)
```

**Feature Gate:** Requires `ocrEngine.transactionOCR` AI feature enabled

---

## 12. Import Transactions Page

**Pages:** File Upload, Preview Table, Confirm Import

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `POST` | `/import/upload` | ✓ | `multipart/form-data: file (CSV/XLSX)` | `{ sessionId, preview: Transaction[], stats }` |
| 2 | `GET` | `/import/:sessionId` | ✓ | `:sessionId` = preview session UUID | `{ sessionId, preview, stats }` |
| 3 | `POST` | `/import/confirm` | ✓ | `{ sessionId, overrides?: { [rowId]: { category?, amount?, description? } } }` | `{ importLog: ImportLog, imported, skipped, errors }` |

**Import flow:**
```
1. POST /api/v1/import/upload (CSV/XLSX file)
2. Preview data shown to user — they can edit categories/amounts
3. POST /api/v1/import/confirm with sessionId + any overrides
```

**Supported file formats:** `.csv`, `.xlsx`, `.xls`  
**Max file size:** 10 MB  
**Feature Gate:** Requires `accounts.importStatement` feature enabled

---

## 13. AI Insights & Recommendations Page

**Pages:** Insights Dashboard, Health Score, Recommendations, Fraud Alerts, Bill Predictions

| # | Method | Endpoint | Auth | Response |
|---|--------|----------|------|----------|
| 1 | `GET` | `/ai/insights` | ✓ | `{ healthScore, recommendations[], insights[], fraudAlerts[], upcomingBills[] }` |
| 2 | `GET` | `/ai/health-score` | ✓ | `{ score, breakdown, suggestions[] }` |
| 3 | `GET` | `/ai/recommendations` | ✓ | `{ recommendations: [{ title, description, priority, type }] }` |
| 4 | `GET` | `/ai/fraud-alerts` | ✓ | `{ flags: [{ transactionId, severity, reason }] }` |
| 5 | `GET` | `/ai/bill-predictions` | ✓ | `{ predictions: [{ name, predictedDate, estimatedAmount }] }` |
| 6 | `GET` | `/ai/spending-patterns` | ✓ | `{ insights: [{ category, trend, percentage }] }` |
| 7 | `GET` | `/ai/quota` | ✓ | `{ used, limit, resetsAt }` |
| 8 | `POST` | `/ai/events` | ✓ | `{ eventType, metadata }` | `{ success }` |

**AI Insights page load:**
```
GET /api/v1/ai/insights          (consolidated: health + recommendations + fraud)
GET /api/v1/ai/quota             (show AI usage indicator)
```

**Feature Gates:**
- `insights`: requires `aiAutomation`
- `health-score`: requires `aiAutomation.healthScoring`
- `recommendations`: requires `aiAutomation.smartCategorization`
- `fraud-alerts`: requires `aiAutomation.anomalyDetection`
- `bill-predictions`: requires `aiAutomation.subscriptionDetection`

---

## 14. Voice Assistant Page

**Pages:** Voice Input, Voice Command Result, Confirm Transaction

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `POST` | `/voice/process-audio` | ✓ | `multipart/form-data: audio (wav/mp3/m4a)` | `{ transcript, actions: ParsedAction[] }` |
| 2 | `POST` | `/voice/process` | ✓ | `{ transcript: string }` | `{ actions: [{ type, amount, category, description, confidence }] }` |
| 3 | `POST` | `/voice/learn` | ✓ | `{ originalSegment, correctedType?, correctedCategory?, correctedAmount? }` | `{ success }` |

**Voice flow:**
```
1. Record audio → POST /api/v1/voice/process-audio
   OR
   Use device STT → POST /api/v1/voice/process (text transcript)
2. Show extracted actions to user for confirmation
3. User confirms → POST /api/v1/transactions
4. If user corrects → POST /api/v1/voice/learn (improve model)
```

**Feature Gate:** Requires `voiceAssistant` AI feature enabled

---

## 15. Transaction Categorization

**Pages:** Used internally by Add Transaction and Import flows

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `POST` | `/categorize` | ✓ | `{ description, merchant?, amount? }` | `{ category, subcategory, confidence }` |
| 2 | `POST` | `/learn` | ✓ | `{ description, merchant?, category, subcategory? }` | `{ success }` |

---

## 16. Notifications Page

**Pages:** Notification Center, Notification Settings

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/notifications` | ✓ | `?page&limit&unreadOnly` | `{ notifications: Notification[], total, unread }` |
| 2 | `GET` | `/notifications/unread/count` | ✓ | — | `{ count: number }` |
| 3 | `GET` | `/notifications/:id` | ✓ | `:id` = UUID | `{ notification: Notification }` |
| 4 | `PUT` | `/notifications/:id/read` | ✓ | — | `{ success }` |
| 5 | `POST` | `/notifications/mark-all-read` | ✓ | — | `{ success, updated: number }` |
| 6 | `DELETE` | `/notifications/:id` | ✓ | `:id` = UUID | `{ success }` |
| 7 | `DELETE` | `/notifications` | ✓ | — | `{ success, cleared: number }` |

**Notification center load:**
```
GET /api/v1/notifications?page=1&limit=20
GET /api/v1/notifications/unread/count
```

**Notification type values:** `friend_request` | `group_expense` | `loan_reminder` | `goal_achieved` | `booking` | `payment` | `system` | `info`

---

## 17. Settings Page

**Pages:** App Settings, Language, Currency, Theme, Account Settings

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/settings` | ✓ | — | `{ settings: { theme, language, currency, timezone, ...customSettings } }` |
| 2 | `PUT` | `/settings` | ✓ | `{ theme?, language?, currency?, timezone?, ...customSettings }` | `{ settings }` |
| 3 | `GET` | `/auth/profile` | ✓ | — | `{ user }` |
| 4 | `PUT` | `/auth/profile` | ✓ | `{ name?, firstName?, lastName?, gender?, country?, city?, jobType?, salary? }` | `{ user }` |

**Settings page load:**
```
GET /api/v1/settings
GET /api/v1/auth/profile
```

---

## 18. PIN / App Lock

**Pages:** Set PIN, Enter PIN, Change PIN, Biometric Setup

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/pin/status` | ✓ | — | `{ hasPin, isActive, failedAttempts, lockedUntil? }` |
| 2 | `POST` | `/pin/create` | ✓ | `{ pin: string }` | `{ success, message }` |
| 3 | `POST` | `/pin/verify` | ✓ | `{ pin, deviceId? }` | `{ success, token? }` |
| 4 | `POST` | `/pin/verify-security` | ✓ | — | `{ success, securityToken }` |
| 5 | `POST` | `/pin/update` | ✓ + security token | `{ currentPin, newPin }` | `{ success }` |
| 6 | `POST` | `/pin/self-reset` | ✓ + security token | — | `{ success }` |
| 7 | `GET` | `/pin/status` | ✓ | — | `{ hasPin, isActive, isExpiringSoon }` |
| 8 | `GET` | `/pin/expiring-soon` | ✓ | — | `{ isExpiringSoon, daysRemaining }` |
| 9 | `GET` | `/pin/key-backup` | ✓ | — | `{ backup: string }` |
| 10 | `POST` | `/pin/key-backup` | ✓ + security token | `{ backup: string }` | `{ success }` |
| 11 | `DELETE` | `/pin/key-backup` | ✓ | — | `{ success }` |

**Security token flow (for PIN change/reset):**
```
1. POST /api/v1/pin/verify-security   → get securityToken
2. Include X-Security-Token: <token> header on sensitive operations
3. Token is short-lived (expires in minutes)
```

---

## 19. Device Management

**Pages:** Device List, Trusted Devices, Push Notification Setup

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/devices` | ✓ | — | `{ devices: Device[] }` |
| 2 | `POST` | `/devices` | ✓ | `{ deviceId, deviceName?, deviceType?, osType?, osVersion?, fcmToken?, apnsToken? }` | `{ device: Device }` |
| 3 | `GET` | `/devices/:deviceId` | ✓ | `:deviceId` | `{ device: Device }` |
| 4 | `PUT` | `/devices/:deviceId/tokens` | ✓ | `{ fcmToken?, apnsToken? }` | `{ success }` |
| 5 | `POST` | `/devices/:deviceId/sync` | ✓ | — | `{ lastSyncedAt }` |
| 6 | `POST` | `/devices/:deviceId/deactivate` | ✓ | — | `{ success }` |
| 7 | `DELETE` | `/devices/:deviceId` | ✓ | — | `{ success }` |
| 8 | `GET` | `/auth/devices` | ✓ | — | `{ devices: Device[] }` |
| 9 | `DELETE` | `/auth/devices/:deviceId` | ✓ | — | `{ success }` |

**App startup — register device:**
```
POST /api/v1/devices { deviceId, deviceName, platform, fcmToken }
```

---

## 20. Offline Sync

**Pages:** Background process (no dedicated UI page, called by Dexie sync engine)

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `POST` | `/sync/register-device` | ✓ | `{ deviceId, deviceName?, deviceType?, platform?, appVersion? }` | `{ success, device }` |
| 2 | `POST` | `/sync/pull` | ✓ | `{ deviceId, lastSyncedAt?, entityTypes? }` | `{ accounts[], transactions[], goals[], loans[], settings }` |
| 3 | `POST` | `/sync/push` | ✓ | `{ deviceId, entities: [{ type, id, data, operation }] }` | `{ synced, failed, conflicts }` |
| 4 | `GET` | `/sync/devices` | ✓ | — | `{ devices: Device[] }` |
| 5 | `POST` | `/sync/deactivate-device` | ✓ | `{ deviceId }` | `{ success }` |

**Entity types for pull:** `accounts` | `transactions` | `goals` | `loans` | `friends` | `settings`

**Sync push payload example:**
```json
POST /api/v1/sync/push
{
  "deviceId": "device-uuid",
  "entities": [
    {
      "type": "transaction",
      "id": "txn-uuid",
      "operation": "create",
      "data": { "accountId": "...", "amount": 50.00, "category": "food", "date": "2026-06-09" }
    }
  ]
}
```

---

## 21. Advisor Directory Page

**Pages:** Advisor List, Advisor Profile, Apply as Advisor

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/advisors` | ✗ | `?specialization&rating&available` | `{ advisors: Advisor[] }` |
| 2 | `GET` | `/advisors/:id` | ✗ | `:id` = UUID | `{ advisor: Advisor }` |
| 3 | `GET` | `/advisors/:id/availability` | ✗/✓ | `:id` = UUID | `{ availability: AdvisorAvailability[] }` |
| 4 | `POST` | `/advisors/apply` | ✓ | `{ specialization, bio, experience?, certifications? }` | `{ success, application }` |
| 5 | `PUT` | `/advisors/sessions/:id/rate` | ✓ | `{ rating: 1-5, feedback? }` | `{ success }` |

---

## 22. Booking Page (Client)

**Pages:** Book Advisor, Booking Confirmation, My Bookings

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `POST` | `/bookings` | ✓ (user) | `{ advisorId, sessionType, proposedDate, proposedTime, duration, amount, description? }` | `{ booking: BookingRequest }` |
| 2 | `GET` | `/bookings` | ✓ | — | `{ bookings: BookingRequest[] }` |
| 3 | `GET` | `/bookings/:id` | ✓ | `:id` = UUID | `{ booking: BookingRequest }` |
| 4 | `PUT` | `/bookings/:id/cancel` | ✓ | — | `{ success }` |

**Session type values:** `consultation` | `portfolio-review` | `tax-planning` | `debt-management`

---

## 23. Advisor Workspace Page (Advisor Role)

**Pages:** Incoming Bookings, Schedule Management, Client List, Availability Settings

| # | Method | Endpoint | Auth | Role | Request Body | Response |
|---|--------|----------|------|------|--------------|----------|
| 1 | `PUT` | `/bookings/:id/accept` | ✓ | advisor | — | `{ booking, session: AdvisorSession }` |
| 2 | `PUT` | `/bookings/:id/reject` | ✓ | advisor | `{ rejectionReason? }` | `{ booking }` |
| 3 | `PUT` | `/bookings/:id/reschedule` | ✓ | advisor | `{ proposedDate, proposedTime }` | `{ booking }` |
| 4 | `GET` | `/bookings/workspace/clients` | ✓ | advisor | — | `{ clients: Client[] }` |
| 5 | `GET` | `/advisors/me/sessions` | ✓ | advisor | — | `{ sessions: AdvisorSession[] }` |
| 6 | `POST` | `/advisors/availability` | ✓ | advisor | `{ dayOfWeek, startTime, endTime }` | `{ availability }` |
| 7 | `PUT` | `/advisors/availability/status` | ✓ | advisor | `{ isActive: boolean }` | `{ success }` |
| 8 | `DELETE` | `/advisors/availability/:id` | ✓ | advisor | — | `{ success }` |
| 9 | `POST` | `/bookings/:bookingId/fee/pay` | ✓ | advisor | — | `{ success }` |

**Admin advisor management:**
```
GET  /api/v1/advisors/admin/applications       (pending applications)
PUT  /api/v1/advisors/admin/:id/approve
PUT  /api/v1/advisors/admin/:id/reject
```

---

## 24. Session / Chat Page

**Pages:** Active Session, Chat Interface, Session History

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/sessions/:id` | ✓ | `:id` = session UUID | `{ session: AdvisorSession }` |
| 2 | `GET` | `/sessions/:id/messages` | ✓ | `:id` = session UUID | `{ messages: ChatMessage[] }` |
| 3 | `POST` | `/sessions/:id/messages` | ✓ | `{ message: string }` | `{ message: ChatMessage }` |
| 4 | `POST` | `/sessions/:id/start` | ✓ | — | `{ session }` |
| 5 | `POST` | `/sessions/:id/complete` | ✓ | `{ notes? }` | `{ session }` |
| 6 | `POST` | `/sessions/:id/cancel` | ✓ | `{ reason? }` | `{ success }` |

**Real-time chat is delivered via WebSocket** (see §30 for socket events).  
HTTP `/messages` endpoint is for history load and offline fallback.

---

## 25. Payments Page

**Pages:** Payment History, Initiate Payment, Payment Receipt

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/payments` | ✓ | — | `{ payments: Payment[] }` |
| 2 | `GET` | `/payments/:id` | ✓ | `:id` = UUID | `{ payment: Payment }` |
| 3 | `POST` | `/payments/initiate` | ✓ | `{ sessionId, amount, currency?, paymentMethod? }` | `{ payment: Payment, clientSecret? }` |
| 4 | `POST` | `/payments/complete` | ✓ | `{ paymentId, transactionId? }` | `{ payment }` |
| 5 | `POST` | `/payments/fail` | ✓ | `{ paymentId, reason? }` | `{ payment }` |
| 6 | `POST` | `/payments/refund` | ✓ | `{ paymentId, reason? }` | `{ payment }` |
| 7 | `POST` | `/payments/webhook` | ✗ (public) | Stripe/payment webhook payload | `200 OK` |

**Payment flow:**
```
1. POST /api/v1/payments/initiate  { sessionId, amount }
2. Client processes payment (Stripe/etc.)
3. POST /api/v1/payments/complete  { paymentId }
   OR webhook notifies /payments/webhook automatically
```

---

## 26. Admin Panel Page

**Pages:** User Management, Platform Stats, Feature Flags, AI Intelligence, Reports

### User Management
| # | Method | Endpoint | Auth | Role | Request Body | Response |
|---|--------|----------|------|------|--------------|----------|
| 1 | `GET` | `/admin/users` | ✓ | admin | `?page&limit&role&status` | `{ users: User[], total }` |
| 2 | `GET` | `/admin/users/pending` | ✓ | admin | — | `{ pendingAdvisors: User[] }` |
| 3 | `POST` | `/admin/users/:advisorId/approve` | ✓ | admin | — | `{ success }` |
| 4 | `POST` | `/admin/users/:advisorId/reject` | ✓ | admin | `{ reason? }` | `{ success }` |
| 5 | `GET` | `/admin/users/activity` | ✓ | admin | — | `{ activity: UserActivity[] }` |
| 6 | `POST` | `/admin/users/:userId/status` | ✓ | admin | `{ status: 'active'|'suspended' }` | `{ success }` |
| 7 | `POST` | `/admin/users/:userId/role` | ✓ | admin | `{ role: 'user'|'advisor'|'admin'|'manager' }` | `{ success }` |
| 8 | `DELETE` | `/admin/users/:userId` | ✓ | admin | — | `{ success }` |
| 9 | `GET` | `/admin/users/:userId/storage` | ✓ | admin | — | `{ storageStats }` |

### Statistics & Reports
| # | Method | Endpoint | Auth | Role | Response |
|---|--------|----------|------|------|----------|
| 10 | `GET` | `/admin/stats` | ✓ | admin | `{ totalUsers, activeUsers, totalTransactions, ... }` |
| 11 | `GET` | `/admin/cache/metrics` | ✓ | admin | `{ metrics: CacheMetrics }` |
| 12 | `GET` | `/admin/reports/users` | ✓ | admin | `{ report: UserReport }` |
| 13 | `GET` | `/admin/reports/revenue` | ✓ | admin | `{ report: RevenueReport }` |

### Feature Flags (readable by all auth users, writable by admin)
| # | Method | Endpoint | Auth | Role | Request Body | Response |
|---|--------|----------|------|------|--------------|----------|
| 14 | `GET` | `/admin/features` | ✓ | any | — | `{ features: FeatureFlag[] }` |
| 15 | `GET` | `/admin/ai-features` | ✓ | any | — | `{ aiFeatures: AIFeatureFlag[] }` |
| 16 | `POST` | `/admin/features/toggle` | ✓ | admin | `{ userId, feature, enabled }` | `{ success }` |
| 17 | `POST` | `/admin/ai-features/toggle` | ✓ | admin | `{ feature, enabled }` | `{ success }` |

### AI Intelligence (admin)
| # | Method | Endpoint | Auth | Role | Response |
|---|--------|----------|------|------|----------|
| 18 | `GET` | `/admin/ai/overview` | ✓ | admin | `{ overview: AIOverview }` |
| 19 | `GET` | `/admin/ai/users` | ✓ | admin | `{ users: AIUserData[] }` |
| 20 | `GET` | `/admin/ai/insights` | ✓ | admin | `{ insights: AIInsight[] }` |
| 21 | `GET` | `/admin/ai/patterns` | ✓ | admin | `{ patterns }` |
| 22 | `GET` | `/admin/ai/accuracy` | ✓ | admin | `{ accuracy: AIAccuracy }` |
| 23 | `GET` | `/admin/ai/raw/:userId` | ✓ | admin | `{ rawData }` |
| 24 | `POST` | `/admin/ai/run/features` | ✓ | admin | `{ force? }` | `{ jobId }` |
| 25 | `POST` | `/admin/ai/run/predictions` | ✓ | admin | `{ force? }` | `{ jobId }` |
| 26 | `GET` | `/admin/ai/config` | ✓ | admin | `{ config: AIConfig }` |
| 27 | `POST` | `/admin/ai/config` | ✓ | admin | `{ config: Partial<AIConfig> }` | `{ success }` |

---

## 27. Stocks / Market Page

**Pages:** Market Watch, Stock Search, Price Ticker

| # | Method | Endpoint | Auth | Query Params | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/stocks` | ✗ | `?symbols=AAPL,GOOGL` | `{ stocks: StockQuote[] }` |

---

## 28. Todos / Reminders Page

**Pages:** Todo List, Add/Edit Todo, Completed Tasks

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/todos` | ✓ | `?completed` | `{ todos: Todo[] }` |
| 2 | `POST` | `/todos` | ✓ | `{ title }` | `{ todo: Todo }` |
| 3 | `PUT` | `/todos/:id` | ✓ | `{ title?, completed? }` | `{ todo: Todo }` |
| 4 | `DELETE` | `/todos/:id` | ✓ | — | `{ success }` |

---

## 29. Avatar Management

**Pages:** Profile Avatar Upload

| # | Method | Endpoint | Auth | Request Body | Response |
|---|--------|----------|------|--------------|----------|
| 1 | `GET` | `/avatars/:userId` | ✗ | `:userId` = UUID | Binary image data |
| 2 | `POST` | `/avatars` | ✓ | `multipart/form-data: file (image)` | `{ avatarId, url }` |
| 3 | `DELETE` | `/avatars` | ✓ | — | `{ success }` |

---

## 30. WebSocket Real-time Events

**Connection:**
```javascript
const socket = io('wss://your-api-domain.com', {
  auth: {
    token: 'JWT_ACCESS_TOKEN',
    deviceId: 'DEVICE_UUID'
  }
});
```

**Client → Server Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `sync_request` | `{ lastSyncedAt?, entityTypes? }` | Request delta sync |
| `transaction_update` | `{ transaction: TransactionPayload }` | Create/update transaction |
| `account_update` | `{ account: AccountPayload }` | Create/update account |
| `goal_update` | `{ goal: GoalPayload }` | Create/update goal |
| `booking_request` | `{ bookingId, message? }` | Notify advisor of new booking |
| `booking_status_update` | `{ bookingId, status, rejectionReason? }` | Advisor updates booking status |
| `payment_status_update` | `{ paymentId, status }` | Update payment state |
| `chat_message` | `{ sessionId, message }` | Send chat message in advisor session |

**Server → Client Events:**

| Event | Trigger | Payload |
|-------|---------|---------|
| `sync_response` | After `sync_request` | `{ success, data: { accounts, transactions, ... } }` |
| `transaction_saved` | After `transaction_update` | `{ success, transaction }` |
| `transaction_updated` | Broadcast to all user devices | `{ transaction, timestamp }` |
| `account_saved` | After `account_update` | `{ success, account }` |
| `account_updated` | Broadcast to all user devices | `{ account, timestamp }` |
| `goal_saved` | After `goal_update` | `{ success, goal }` |
| `goal_updated` | Broadcast to all user devices | `{ goal, timestamp }` |
| `booking_notification` | After `booking_request` | `{ type, booking }` — sent to advisor |
| `booking_status_changed` | After `booking_status_update` | `{ booking }` — sent to client |
| `booking_status_updated` | After `booking_status_update` | `{ success, booking }` — confirmation |
| `payment_status_changed` | After `payment_status_update` | `{ payment }` — sent to client |
| `payment_received` | After payment completed | `{ payment }` — sent to advisor |
| `payment_status_updated` | After `payment_status_update` | `{ success, payment }` — confirmation |
| `new_message` | After `chat_message` | `{ message }` — sent to both advisor and client |
| `message_sent` | After `chat_message` | `{ success, message }` — confirmation |

**State machine — Payment transitions:**
```
pending → completed
pending → failed
processing → completed
processing → failed
completed → refunded
```

**State machine — Booking transitions:**
```
pending → accepted
pending → rejected
```

---

## Appendix — HTTP Status Codes Reference

| Code | Meaning | When |
|------|---------|------|
| `200` | OK | Successful GET/PUT/DELETE |
| `201` | Created | Successful POST (resource created) |
| `400` | Bad Request | Validation failure (Zod error) |
| `401` | Unauthorized | Missing/invalid/expired JWT |
| `403` | Forbidden | Insufficient role, feature gate, account suspended |
| `404` | Not Found | Resource not found |
| `409` | Conflict | Duplicate resource (unique constraint) |
| `422` | Unprocessable | Business logic failure |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Unexpected server error |
| `503` | Service Unavailable | Database/external service down |

**Standard error response shape:**
```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE_CONSTANT"
}
```

**Standard success response shape:**
```json
{
  "success": true,
  "data": { ... }
}
```

---

*Document generated from codebase analysis — June 9, 2026. Update when routes change.*

