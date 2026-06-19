# Product Requirement Document (PRD) — Kanaku

> Financial-grade, local-first expense tracker (React 18 + TS / Vite + Capacitor, Node/Express + Prisma/PostgreSQL, Supabase identity, Dexie offline sync).

## 1. Product Overview
Kanaku is a privacy-first, offline-capable personal finance and expense-tracking
application. It lets users record income/expenses, scan receipts, track balances
across accounts, and view spending intelligence. Data is captured locally first
(Dexie) and synced asynchronously to the cloud, so the app remains fully usable
without connectivity.

**Target users**
- Individuals tracking day-to-day personal spending.
- Households managing shared budgets.
- Power users who want receipt OCR + spending insights.

## 2. Goals & Objectives
**Business goals**
- Deliver a trustworthy, "financial-grade" UX that retains daily-active users.
- Differentiate via offline-first reliability and receipt intelligence.
- Keep monetary logic server-authoritative to protect data integrity.

**User goals**
- Record a transaction in under 3 seconds, online or offline.
- Always see an accurate, reconciled balance.
- Understand where money goes via categorized insights.

## 3. Features
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

## 4. User Stories
- As a user, I want to log in securely so that my financial data is protected.
- As a user, I want to add an expense offline so that I never lose a record.
- As a user, I want my balances to always be correct so that I can trust the app.
- As a user, I want to scan a receipt so that data entry is fast.
- As an admin, I can manage feature gates so that rollouts are controlled.

## 5. Acceptance Criteria
- Login must validate credentials and reject invalid/expired tokens.
- Error messages are shown clearly and never leak secrets/stack traces.
- A transaction created offline appears immediately and syncs when online.
- Balance changes and transaction creation are atomic (same DB transaction).
- Ownership is enforced before any read/write of a user's records.

## 6. Non-functional Requirements
- **Performance:** Local writes < 50ms; dashboard first paint < 1.5s on cached data.
- **Security:** Helmet + CORS + rate limiting; zod validation on all routes; `/api/v1` versioning; no hardcoded secrets.
- **Scalability:** Stateless API, indexed Postgres, delta sync to limit payloads.
- **Reliability:** Offline-first with retry; idempotent sync to avoid duplicates.
- **Privacy:** User-scoped data access end-to-end.

