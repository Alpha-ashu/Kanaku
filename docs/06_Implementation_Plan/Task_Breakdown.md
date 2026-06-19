# Task Breakdown — Kanaku

## Auth
- [ ] Supabase client integration (frontend).
- [ ] Backend JWT issue + verify middleware.
- [ ] Cached/offline session handling.
- [ ] 401 re-auth flow on token expiry.

## API Platform
- [ ] `/api/v1` router base.
- [ ] Helmet + CORS allow-list + rate limiter.
- [ ] zod validation middleware (params/query/body).
- [ ] Standard error contract + handler.

## Transactions
- [ ] Prisma models + migration.
- [ ] Create/list/update/delete with ownership checks.
- [ ] Atomic balance update (DB transaction).
- [ ] Idempotency via `client_op_id`.

## Offline & Sync
- [ ] Dexie schema + local-first writes.
- [ ] Sync-pending markers + UI indicators.
- [ ] `/sync/push` + `/sync/pull` delta endpoints.
- [ ] Background retry + conflict resolution.

## Dashboard
- [ ] Aggregations + category analytics.
- [ ] Date-range filtering.
- [ ] Cache-first render + delta reconcile.

## Receipts
- [ ] Capture + OCR pipeline.
- [ ] Confidence threshold → manual confirm.

## Quality
- [ ] Jest unit tests.
- [ ] Playwright e2e (login, add tx, offline→sync).
- [ ] Security checklist (no secrets, validation coverage).

