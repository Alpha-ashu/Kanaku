# Product Requirement Document (PRD) — Kanaku

> Financial-grade, local-first expense tracker (React 18 + TS / Vite + Capacitor, Node/Express + Prisma/PostgreSQL, Supabase identity, Dexie offline sync).

---

## 1. Product Overview
Kanaku is a privacy-first, offline-capable personal finance and expense-tracking application. It lets users record income/expenses, scan receipts, track balances across accounts, and view spending intelligence. Data is captured locally first (Dexie) and synced asynchronously to the cloud, so the app remains fully usable without connectivity.

### Target users
- Individuals tracking day-to-day personal spending.
- Households managing shared budgets.
- Power users who want receipt OCR + spending insights.

---

## 2. Goals & Objectives
### Business goals
- Deliver a trustworthy, "financial-grade" UX that retains daily-active users.
- Differentiate via offline-first reliability and receipt intelligence.
- Keep monetary logic server-authoritative to protect data integrity.

### User goals
- Record a transaction in under 3 seconds, online or offline.
- Always see an accurate, reconciled balance.
- Understand where money goes via categorized insights.

---

## 3. Core Features
### Feature 1: Authentication (Supabase identity + backend JWT)
- **Description:** Sign up / sign in via Supabase; backend issues a custom JWT for API authorization.
- **Inputs / Outputs:** Inputs: email, password (or OTP). Outputs: session, JWT, user profile.
- **Edge Cases:** Invalid credentials, expired token, offline login with cached session, OTP timeout.

### Feature 2: Dashboard
- **Description:** Aggregated balances, recent transactions, spend-by-category.
- **Inputs / Outputs:** Inputs: user scope, date range. Outputs: widgets, charts, KPIs.
- **Edge Cases:** No data yet, stale cache, partial sync, very large transaction history.

### Feature 3: Transactions (income/expense)
- **Description:** Create/edit/delete transactions; server-authoritative balance updates inside DB transactions.
- **Inputs / Outputs:** Inputs: amount, category, account, date, note. Outputs: persisted record + updated balance.
- **Edge Cases:** Negative balance rules, currency mismatch, duplicate offline writes, conflict resolution.

### Feature 4: Receipt OCR
- **Description:** Capture receipt image, extract amount/merchant/date, prefill a transaction.
- **Inputs / Outputs:** Inputs: image. Outputs: parsed draft transaction.
- **Edge Cases:** Blurry image, unsupported currency, low-confidence parse (require manual confirm).

### Feature 5: Offline-first Sync
- **Description:** Local write first, mark sync pending, retry in background, delta-based realtime updates scoped per user.
- **Edge Cases:** Long offline periods, conflicting edits, partial failure mid-batch.

---

## 4. User Stories
Format: `As a <role>, I want <capability> so that <benefit>.`

### Authentication
- **US-001** As a user, I want to sign up with email so that I can create an account.
  - Notes: validate email format; password strength; confirmation flow.
- **US-002** As a user, I want to sign in offline using a cached session so that I can keep working without internet.
  - Notes: session valid window; re-auth required after expiry.
- **US-003** As a user, I want to log out so that my session is cleared on shared devices.

### Transactions
- **US-010** As a user, I want to add an expense so that I can track spending.
  - Notes: amount > 0; category required; default to today.
- **US-011** As a user, I want to add income so that my balance reflects earnings.
- **US-012** As a user, I want to edit/delete a transaction so that I can fix mistakes.
  - Notes: balance recalculated atomically; ownership enforced.
- **US-013** As a user, I want offline transactions to sync automatically so that I never lose data.

### Dashboard & Insights
- **US-020** As a user, I want to see total balance and recent activity so that I understand my finances at a glance.
- **US-021** As a user, I want spend-by-category charts so that I can spot overspending.
- **US-022** As a user, I want to filter by date range so that I can review specific periods.

### Receipts
- **US-030** As a user, I want to scan a receipt so that data entry is faster.
  - Notes: low-confidence parses require manual confirmation.

### Admin / Platform
- **US-040** As an admin, I want feature gates so that I can control rollouts.
- **US-041** As an admin, I want rate limiting so that the API is protected from abuse.

---

## 5. Acceptance Criteria
Written in Given/When/Then format for QA testability.

### Authentication
#### AC-Login-Valid
- **Given** a registered user with correct credentials
- **When** they submit the login form
- **Then** a session + backend JWT is issued and they land on the Dashboard.

#### AC-Login-Invalid
- **Given** wrong credentials
- **When** they submit
- **Then** a clear error is shown, no token issued, no stack trace leaked.

#### AC-Token-Expired
- **Given** an expired JWT
- **When** a protected API call is made
- **Then** the API returns 401 and the client triggers re-auth.

### Transactions
#### AC-Create-Offline
- **Given** the device is offline
- **When** a user adds an expense
- **Then** it is stored locally, marked `sync pending`, and appears instantly.

#### AC-Sync-Online
- **Given** pending local writes
- **When** connectivity returns
- **Then** writes sync in background, idempotently, with no duplicates.

#### AC-Balance-Atomicity
- **Given** a transaction creation that changes a balance
- **When** it is persisted
- **Then** balance update and transaction insert occur in one DB transaction (all-or-nothing).

#### AC-Ownership
- **Given** a transaction owned by user A
- **When** user B requests it
- **Then** the API returns 403/404 (no cross-user access).

### Validation
#### AC-Validation-Middleware
- **Given** any `/api/v1` route
- **When** a request hits it
- **Then** params/query/body are validated by zod; invalid input returns 400 with field errors.

### Receipts
#### AC-Receipt-LowConfidence
- **Given** a low-confidence OCR parse
- **When** the draft is generated
- **Then** the user must confirm/edit before saving.

---

## 6. Detailed Feature Specifications (per Module)

### 1. Identity, PIN & Sessions
#### 1.1 Auth (F-AUTH-*)
- **Purpose**: Secure registration/login; Supabase identity + custom JWT authorization.
- **User flow**: check email → register (strong password) → 2-step login challenge → JWT issued.
- **Technical**: Supabase signUp/signIn → `/auth/exchange|login` → custom HS256 access (15m) + refresh (7d, httpOnly). Multi-strategy verify: custom → Supabase JWKS → Supabase /user → dev bypass. Self-healing bcrypt/Argon2 migration for legacy accounts.
- **Data**: `User`, `profiles`, `RefreshToken`.
- **Edge**: invalid creds, expired token (→401→refresh), offline cached session, weak password (`PASSWORD_TOO_WEAK`), email change OTP.

#### 1.2 PIN gate (F-PIN-*)
- **Purpose**: Local access gate after login.
- **Flow**: setup 4–6 digit → PIN gate on every fresh start → unlock.
- **Technical**: client SHA-256 + per-user salt → server Argon2id; lockout after 5 attempts; key backup; expiry warnings; OTP/self reset.
- **Data**: `UserPin`; localStorage key/salt.

#### 1.3 OTP / Sessions / Devices (F-OTP/SESS/DEV-*)
- OTP send/verify (MSG91/Twilio + Resend); active session list + revoke; device register/list/sync/revoke.
- **Data**: `OtpCode`, `OtpRequest`, `Device`.

---

### 2. Accounts & Transactions
#### 2.1 Accounts (F-ACC-*)
- Types: bank, card, cash, digital (brand iconography). CRUD with name uniqueness, Redis-cached reads, feature-gated create/edit/delete.
- **Data**: `Account` (`balance Decimal(18,2)`), Dexie `accounts`.

#### 2.2 Transactions (F-TXN-*)
- Types: expense, income, transfer (self/others, bank/cash), loan, goal. Atomic balance via `prisma.$transaction`; idempotency via `clientId`. Bulk create (voice). Linked bills/attachments (`document:{id}`). Mobile detail bottom sheet; month/day/year timeline.
- **Edge**: negative balance rules, currency mismatch, duplicate offline writes, conflict (server authoritative on money).

#### 2.3 Recurring & Categorization (F-REC/CAT-*)
- Recurring CRUD + toggle; worker auto-posts on `nextDueDate`. Smart categorization predict + learn from corrections (`merchantProfiles`, `userCategoryPreferences`).

#### 2.4 Import (F-IMP-*)
- Statement upload (bank/card only) → parse → review → confirm → transactions. SMS auto-detection matches bank messages to accounts.
- **Data**: `ImportLog`, Dexie `importHistories`, `smsTransactions`.

---

### 3. Wealth
#### 3.1 Goals (F-GOAL-*)
- CRUD (idempotent); contribute (atomic txn + balance + `goals.current`); group goals + members (`GoalMember`).
#### 3.2 Loans (F-LOAN-*)
- P2P (friends) and Institutional; EMI payment atomic (insert `LoanPayment` + txn + update `outstanding` + balance + notify).
#### 3.3 Investments / Stocks / Gold (F-INV/STK/GOLD-*)
- Investment CRUD, close position, Wealth Vault net-worth; stock search/quote (cached 60s)/batch + live ticker; gold positions + live metal price.
#### 3.4 Budgets (F-BUD-*)
- Budget CRUD + recalculate spent + threshold alerts.

---

### 4. Dashboard, Reports & Notifications
- Dashboard summary (Redis 30s) + cashflow. Reports + PDF/CSV export (`statementReportPdf`). Notifications list/unread/read/clear/admin-send; worker fan-out realtime + email + SMS.

---

### 5. Social & Collaboration
#### 5.1 Friends & Groups (F-FRND/GRP-*)
- Friends CRUD + bulk + CSV import + profile. Groups CRUD + member repair + expense split (equal/%/custom) with `GroupExpenseMember`; realtime via Socket.IO + notifications.
#### 5.2 To-Do (F-TODO-*) & Collaboration (F-COLL-*)
- Lists (Together/Individual via `listType`) + items (assignee) + shares/collaborators; realtime invite/accept/toggle. Collaboration ACL: list/pending/get/revoke.

---

### 6. Advisory Cooperative
#### 6.1 Advisors & Applications (F-ADV-*)
- List advisors; apply with KYC docs (PAN/Aadhaar/Cert to Storage); manager/admin approve/reject → role promotion; availability CRUD; online status / role mode; sessions list + rate.
#### 6.2 Bookings & Sessions (F-BOOK/SESN-*)
- Booking lifecycle: pending→confirmed→in_session→completed/cancelled. Chat session messages over Socket.IO; start/complete/cancel; session notes.
#### 6.3 Workspaces
- Advisor workspace + Client management (portfolio valuation). Manager verification queue.

---

### 7. Intelligence (AI / Voice / Receipts)
#### 7.1 Receipt OCR (F-RCP-*)
- Hybrid: Tesseract.js (client text) → `/receipts/parse` → Gemini 1.5 Flash (structuring) within `withCircuitBreaker` → `receipt_ai` FastAPI fallback. Scan (OCR) vs Add Attachment (no OCR) modes. Low-confidence = manual confirm. Training/feedback loop.
#### 7.2 Voice (F-VOICE-*)
- Speech → `/voice/process(-audio)` → keyword segmenter → Gemini for ambiguous → multi-intent actions → VoiceReview (per-row) → `/transactions/bulk`. Learns from corrections. Gated by `voiceAssistant` AI flag.
#### 7.3 AI insights (F-AI-*)
- Events capture, quota, insights, health-score, recommendations (smartCategorization), fraud-alerts (anomalyDetection), bill-predictions (subscriptionDetection), spending-patterns. Stored in `ai_events`, `ai_insights`, `ai_model_runs`.

---

### 8. Account Aggregator (Setu AA, RBI) — F-AA-*
- Consent create/status/artifact/revoke; data session + fetch; financial summary; notification webhook. AES-256-GCM at rest (per-user DEK); worker polling; auto-categorize imported data.
- **Data**: `AaConsent`, `AaConsentArtifact`, `AaDataSession`, `AaFinancialData`, `AaTransaction`.

---

### 9. Payments — F-PAY-*
- Payment intent: initiate/complete/fail/refund; provider webhook (signature verified). `Payment` model.

---

### 10. Sync, Devices & Offline — F-SYNC/OFF-*
- Pull/push deltas (idempotent); register/list/deactivate device; sync monitor (admin). State machine: pending→syncing→synced|conflict|failed; backoff 2s→10m; monetary fields server-authoritative on conflict.
- **Data**: `SyncQueue`, Dexie `syncQueue`, `syncEventLogs`.

---

### 11. Admin & Platform — F-ADM/FG/RT/PWA/SRCH/GUEST-*
- Admin: users (list/pending/activity/status/role/delete/storage), platform stats, cache metrics, reports (users/revenue), AI ops, feature + AI feature flag toggles.
- Feature gates: deny-by-default RBAC at Module → Sub-feature → AI capability; admin toggle → Redis invalidate → Socket.IO broadcast → live nav.
- Realtime: user-scoped, delta-based channels. PWA install + offline banner. Global command palette (Cmd+K). Guest/limited mode.

---

### 12. Webhooks — F-WEB-*
- SendGrid event webhook with ECDSA P-256 / SHA-256 signature verification (10-min replay window); Setu AA + MSG91 callbacks.

---

## 7. Non-functional Requirements
- **Performance:** Local writes < 50ms; dashboard first paint < 1.5s on cached data.
- **Security:** Helmet + CORS + rate limiting; zod validation on all routes; `/api/v1` versioning; no hardcoded secrets.
- **Scalability:** Stateless API, indexed Postgres, delta sync to limit payloads.
- **Reliability:** Offline-first with retry; idempotent sync to avoid duplicates.
- **Privacy:** User-scoped data access end-to-end.
