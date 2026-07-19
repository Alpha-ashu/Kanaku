# /api — Vercel Edge Functions

This folder contains **Vercel serverless functions only**. There is exactly one:

- `stocks.ts` — public stock/market-data quote proxy (`/api/v1/stocks*`), served at the
  edge for latency and CDN caching. Self-contained: no backend imports, no database.

## The boundary rule

**`backend/` is the application API.** All `/api/v1/*` business logic — auth, RBAC,
persistence, sync, ledger — lives in the Express backend deployed on Render.
`vercel.json` proxies every other `/api/*` path straight to that backend.

Nothing may be added to this folder without an ADR in `docs/architecture/`. If an
endpoint needs auth, the database, or any backend module, it belongs in `backend/`.

(The former `auth.ts`, `users.ts`, `health.ts`, and `index.ts` here were unrouted legacy
duplicates of backend functionality and were removed in the 2026-07 repo cleanup.)
