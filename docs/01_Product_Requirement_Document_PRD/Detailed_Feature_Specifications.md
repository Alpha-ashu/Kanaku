# Detailed Feature Specifications — Kanaku (End-to-End, per Module)

> Deep spec for every functional module (36 backend feature domains + platform concerns). Each entry: Purpose → User flow → Technical flow → Data (Postgres/Dexie) → Endpoints → Edge cases. Cross-reference `Feature_List.csv` (IDs), `../02_Technical_Requirement_Document_TRD/API_Specifications.md`, and `../05_Backend_Data_Schema/*`.

---

## 1. Identity, PIN & Sessions
### 1.1 Auth (F-AUTH-*)
- **Purpose**: Secure registration/login; Supabase identity + custom JWT authorization.
- **User flow**: check email → register (strong password) → 2-step login challenge → JWT issued.
- **Technical**: Supabase signUp/signIn → `/auth/exchange|login` → custom HS256 access (15m) + refresh (7d, httpOnly). Multi-strategy verify: custom → Supabase JWKS → Supabase /user → dev bypass. Self-healing bcrypt/Argon2 migration for legacy accounts.
- **Data**: `User`, `profiles`, `RefreshToken`.
- **Edge**: invalid creds, expired token (→401→refresh), offline cached session, weak password (`PASSWORD_TOO_WEAK`), email change OTP.

### 1.2 PIN gate (F-PIN-*)
- **Purpose**: Local access gate after login.
- **Flow**: setup 4–6 digit → PIN gate on every fresh start → unlock.
- **Technical**: client SHA-256 + per-user salt → server Argon2id; lockout after 5 attempts; key backup; expiry warnings; OTP/self reset.
- **Data**: `UserPin`; localStorage key/salt.

### 1.3 OTP / Sessions / Devices (F-OTP/SESS/DEV-*)
- OTP send/verify (MSG91/Twilio + Resend); active session list + revoke; device register/list/sync/revoke.
- **Data**: `OtpCode`, `OtpRequest`, `Device`.

---

## 2. Accounts & Transactions
### 2.1 Accounts (F-ACC-*)
- Types: bank, card, cash, digital (brand iconography). CRUD with name uniqueness, Redis-cached reads, feature-gated create/edit/delete.
- **Data**: `Account` (`balance Decimal(18,2)`), Dexie `accounts`.

### 2.2 Transactions (F-TXN-*)
- Types: expense, income, transfer (self/others, bank/cash), loan, goal. Atomic balance via `prisma.$transaction`; idempotency via `clientId`. Bulk create (voice). Linked bills/attachments (`document:{id}`, Eye view). Mobile detail bottom sheet; month/day/year timeline.
- **Edge**: negative balance rules, currency mismatch, duplicate offline writes, conflict (server authoritative on money).

### 2.3 Recurring & Categorization (F-REC/CAT-*)
- Recurring CRUD + toggle; worker auto-posts on `nextDueDate`. Smart categorization predict + learn from corrections (`merchantProfiles`, `userCategoryPreferences`).

### 2.4 Import (F-IMP-*)
- Statement upload (bank/card only) → parse → review → confirm → transactions. SMS auto-detection matches bank messages to accounts.
- **Data**: `ImportLog`, Dexie `importHistories`, `smsTransactions`.

---

## 3. Wealth
### 3.1 Goals (F-GOAL-*)
- CRUD (idempotent); contribute (atomic txn + balance + `goals.current`); group goals + members (`GoalMember`).
### 3.2 Loans (F-LOAN-*)
- Institutional vs P2P (friends); EMI payment atomic (insert `LoanPayment` + txn + update `outstanding` + balance + notify).
### 3.3 Investments / Stocks / Gold (F-INV/STK/GOLD-*)
- Investment CRUD, close position, Wealth Vault net-worth; stock search/quote (cached 60s)/batch + live ticker; gold positions + live metal price.
### 3.4 Budgets & Tax (F-BUD/TAX-*)
- Budget CRUD + recalculate spent + threshold alerts; tax calculations CRUD + regime comparison UI.

---

## 4. Dashboard, Reports & Notifications
- Dashboard summary (Redis 30s) + cashflow. Reports + PDF/CSV export (`statementReportPdf`). Notifications list/unread/read/clear/admin-send; worker fan-out realtime + email + SMS.

---

## 5. Social & Collaboration
### 5.1 Friends & Groups (F-FRND/GRP-*)
- Friends CRUD + bulk + CSV import + profile. Groups CRUD + member repair + expense split (equal/%/custom) with `GroupExpenseMember`; realtime via Socket.IO + notifications.
### 5.2 To-Do (F-TODO-*) & Collaboration (F-COLL-*)
- Lists (Together/Individual via `listType`) + items (assignee) + shares/collaborators; realtime invite/accept/toggle. Collaboration ACL: list/pending/get/revoke.

---

## 6. Advisory Cooperative
### 6.1 Advisors & Applications (F-ADV-*)
- List advisors; apply with KYC docs (PAN/Aadhaar/Cert to Storage); manager/admin approve/reject → role promotion; availability CRUD; online status / role mode; sessions list + rate.
### 6.2 Bookings & Sessions (F-BOOK/SESN-*)
- Booking lifecycle: pending→confirmed→in_session→completed/cancelled. Chat session messages over Socket.IO; start/complete/cancel; session notes.
### 6.3 Workspaces
- Advisor workspace + Client management (clients from active sessions; portfolio valuation from shared salary). Manager verification queue.

---

## 7. Intelligence (AI / Voice / Receipts)
### 7.1 Receipt OCR (F-RCP-*)
- Hybrid: Tesseract.js (client text) → `/receipts/parse` → Gemini 1.5 Flash (structuring) within `withCircuitBreaker` → `receipt_ai` FastAPI fallback. Scan (OCR) vs Add Attachment (no OCR) modes. Low-confidence = manual confirm. Training/feedback loop.
### 7.2 Voice (F-VOICE-*)
- Speech → `/voice/process(-audio)` → keyword segmenter → Gemini for ambiguous → multi-intent actions → VoiceReview (per-row) → `/transactions/bulk`. Learns from corrections. Gated by `voiceAssistant` AI flag.
### 7.3 AI insights (F-AI-*)
- Events capture, quota, insights, health-score, recommendations (smartCategorization), fraud-alerts (anomalyDetection), bill-predictions (subscriptionDetection), spending-patterns. Stored in `ai_events`, `ai_insights`, `ai_model_runs`.

---

## 8. Account Aggregator (Setu AA, RBI) — F-AA-*
- Consent create/status/artifact/revoke; data session + fetch; financial summary; notification webhook. AES-256-GCM at rest (per-user DEK); worker polling; auto-categorize imported data.
- **Data**: `AaConsent`, `AaConsentArtifact`, `AaDataSession`, `AaFinancialData`, `AaTransaction`.

---

## 9. Payments — F-PAY-*
- Payment intent: initiate/complete/fail/refund; provider webhook (signature verified). `Payment` model.

---

## 10. Sync, Devices & Offline — F-SYNC/OFF-*
- Pull/push deltas (idempotent); register/list/deactivate device; sync monitor (admin). State machine: pending→syncing→synced|conflict|failed; backoff 2s→10m; monetary fields server-authoritative on conflict.
- **Data**: `SyncQueue`, Dexie `syncQueue`, `syncEventLogs`.

---

## 11. Admin & Platform — F-ADM/FG/RT/PWA/SRCH/GUEST-*
- Admin: users (list/pending/activity/status/role/delete/storage), platform stats, cache metrics, reports (users/revenue), AI ops (overview/users/insights/patterns/accuracy/raw/run/config), feature + AI feature flag toggles.
- Feature gates: deny-by-default RBAC at Module → Sub-feature → AI capability; admin toggle → Redis invalidate → Socket.IO broadcast → live nav.
- Realtime: user-scoped, delta-based channels. PWA install + offline banner. Global command palette (Cmd+K) across nav/accounts/transactions. Guest/limited mode.

---

## 12. Webhooks — F-WEB-*
- SendGrid event webhook with ECDSA P-256 / SHA-256 signature verification (10-min replay window); Setu AA + MSG91 callbacks.

---

## Acceptance & validation
- Every mutating route: zod validation + ownership filter (`where: { userId }`).
- Every balance-coupled write: single `prisma.$transaction`.
- All amounts `Decimal(18,2)`; no float; no `any` in new code.
- See `../01_Product_Requirement_Document_PRD/Acceptance_Criteria.md` for Given/When/Then.

