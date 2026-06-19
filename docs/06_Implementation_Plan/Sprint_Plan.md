# Sprint Plan — Kanaku

Two-week sprints. Each story must be developer-ready + QA-testable.

## Sprint 1 — Foundations
- Auth: Supabase login + backend JWT issuance/validation.
- Base `/api/v1` scaffolding: Helmet, CORS, rate limiting, zod middleware.
- Prisma schema + initial migration (users, accounts).
- **Exit:** user can sign in; protected route returns 401 without token.

## Sprint 2 — Transactions Core
- Create/list transactions with ownership checks.
- Atomic balance update in DB transaction.
- Dexie local-first writes + sync-pending markers.
- **Exit:** AC-Create-Offline, AC-Balance-Atomicity pass.

## Sprint 3 — Sync Engine
- `/sync/push` (idempotent) + `/sync/pull` (delta, user-scoped).
- Background retry with backoff; conflict handling.
- **Exit:** AC-Sync-Online passes; no duplicates.

## Sprint 4 — Dashboard & Insights
- KPIs, spend-by-category, date filters.
- **Exit:** dashboard renders from cache then reconciles deltas.

## Sprint 5 — Receipts + Hardening
- OCR draft → confirm → save.
- Security review, e2e coverage, perf pass.
- **Exit:** production readiness checklist green.

