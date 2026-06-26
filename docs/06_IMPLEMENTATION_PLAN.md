# Project Roadmap & Implementation Plan — Kanaku

> Strategic development stages, sprint plans, task lists, security hardening backlogs, and AI development guardrails.

---

## 1. Project Roadmap
The development of Kanaku spans five distinct stages to deliver a secure, offline-first personal finance experience.

- **Phase 1: Foundations (Core Security & API):** Identity, PIN gates, rate limiting, and basic `/api/v1` routes.
- **Phase 2: Transactions Core:** Accounts, transactions, and category logs with server-authoritative balance recomputations.
- **Phase 3: Offline Sync Engine:** Dexie local-first IndexedDB replication, idempotent pushes/pulls, and conflict merging.
- **Phase 4: Net Worth & Wealth:** Stock quote caches, gold tickers, goals, loans, and budgets.
- **Phase 5: Intelligence & Social:** Receipt scanning (OCR), voice natural language commands, group splits, and advisor collaboration.

---

## 2. Sprint Schedule
Sprints are organized as two-week intervals with clear definition of done objectives.

### Sprint 1 — Foundations
- **Scope:** Supabase auth integration + backend JWT token management, PIN creation, Zod middleware validation.
- **Exit Criteria:** Regular users can sign in, and protected routes return 401 when request lacks valid tokens.

### Sprint 2 — Transactions Core
- **Scope:** Create, read, update, delete (CRUD) transactions with owner-only database queries. Atomic balance triggers inside Postgres transactions.
- **Exit Criteria:** Transactions appear in the UI, and account balances are updated atomically.

### Sprint 3 — Sync Engine
- **Scope:** Idempotent `/sync/push` and `/sync/pull` delta handlers. Background synchronization retries with exponential backoff on client.
- **Exit Criteria:** Offline-added transactions replicate automatically to PostgreSQL when the client goes online.

### Sprint 4 — Dashboard & Wealth
- **Scope:** Aggregated metrics, cashflow visualizers, stock caches, gold trackers, and category budgets.
- **Exit Criteria:** Dashboard loads instantly from local IndexedDB and reconciles delta syncs in the background.

### Sprint 5 — Receipt Scanner & Social
- **Scope:** Receipt image capture, Tesseract text parsing, Gemini fallback validation, and group expense split settlement.
- **Exit Criteria:** Low-confidence OCR scans trigger a manual review dialog before save.

---

## 3. Granular Task Breakdown

### Authentication
- [ ] Implement Supabase client auth providers (frontend).
- [ ] Write custom token verification middleware (backend).
- [ ] Cache auth credentials on device to support offline sessions.
- [ ] Create token refresh loops and intercept 401 responses.

### API & Router Platform
- [ ] Set up global Helmet header parameters, CORS allow-lists, and Express rate-limit configurations.
- [ ] Write centralized schema-validation middleware (`validateBody`, `validateQuery`, `validateParams`).
- [ ] Standardize the JSON response schema for error codes and request IDs.

### Core Ledger & Sync
- [ ] Draft database migrations matching accounts, transactions, and recurring schema revisions.
- [ ] Implement atomic operations inside single database transactions (`prisma.$transaction`).
- [ ] Write client-side IndexedDB Dexie tables matching target Prisma shapes.
- [ ] Implement backoff sync retry intervals (2s → 4s → 8s → 30s → 10m).

---

## 4. Hardening Backlog (Sprint 2026-07 Security)
Backlog items aimed at fixing security and performance concerns surfaced during code auditing.

1. **Vulnerability Mitigation:** Upgrade NPM package dependabot reports (10 high, 6 moderate, 5 low).
2. **Client API Throttling:** Restrict client GET queries at the react hook level (caching queries via `useApi`).
3. **Zod Validation Tightening:** Enforce strict checks on input lengths (e.g. restrict `email` to `< 100` chars, `pin` to `<= 64`).
4. **SQL Injection Checks:** Apply `containsSqlInjection` checks on onboarding inputs and account names.
5. **AI Runway Checks:** Lock AI insights so suggestions are bound strictly to declared user income profiles.

---

## 5. AI Developer Guardrail Prompts
Use this prompt as system context when instructing AI coding agents:

```markdown
You are an expert developer building Kanaku. Maintain these rules:
1. Local-first: all user transactions are written to Dexie DB first.
2. Zod Validation: all /api/v1 routes require zod schemas for body/query/params.
3. Server Authoritative: monetary totals must be verified and saved inside single PostgreSQL transactions. Do not trust client balances.
4. Access Control: enforce where: { userId } on every read and write database query.
5. Code Hygiene: do not use 'any' in new code. Define clear TypeScript contracts.
```
