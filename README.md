# Kanaku

Offline-first personal-finance platform: accounts, transactions, budgets, goals, loans,
group expenses & settlements, investments, an advisor marketplace, and AI capture
(voice-to-transaction, receipt OCR, bank-statement import).

## Repository map

```
kanaku/
├── frontend/          @kanaku/frontend — React 18 + Vite SPA/PWA (offline-first via Dexie),
│                      Capacitor Android wrapper. Deployed on Vercel.
├── backend/           @kanaku/backend — Express + Prisma API (/api/v1, 37 feature modules),
│                      Socket.IO realtime, background workers. Deployed on Render (Docker).
│   └── prisma/        Database schema + migrations (source of truth).
├── packages/
│   └── shared/        @kanaku/shared — declaration-only API wire-contract types
│                      consumed by both apps (import type only; see its README).
├── api/               Vercel edge functions ONLY (currently just the stocks proxy).
│                      Everything else under /api/* is proxied to the Render backend —
│                      see api/README.md for the boundary rule.
├── db/
│   ├── supabase/      Supabase-side migrations (RLS, auth triggers) + edge functions.
│   └── legacy-sql/    Archived pre-Prisma SQL. Read-only, never run.
├── quality/           Central test hub: backend jest suites, frontend vitest suites,
│                      Playwright E2E, performance/DB/chaos tooling, reports.
├── docs/              Product & engineering docs. Start at docs/00_DOCS_INDEX.md;
│                      deep-dive: docs/architecture/OVERVIEW.md; release audit: docs/release/.
├── platform/          Cross-cutting engineering guidelines (database/security/observability docs).
├── scripts/           Repo tooling (dev orchestration, doc/QA generators).
├── android/           Capacitor Android project.
└── supabase → db/supabase, infra configs at root: vercel.json, render.yaml, fly.toml
                       (render.yaml/fly.toml must stay at root — platform requirement).
```

How the packages interact: `packages/shared` defines the HTTP wire-contract types;
`backend` implements them, `frontend` consumes them (both via `import type` from
`@kanaku/shared`), so contract drift is a compile error. The frontend talks to the
backend through `/api/v1/*` (Vercel proxies to Render in production, Vite proxies in dev)
and syncs its offline Dexie store through `/api/v1/sync`.

## Getting started (from scratch)

Prereqs: Node 22+ (see `.nvmrc`), npm 11+.

```bash
git clone https://github.com/Alpha-ashu/Kanaku.git && cd Kanaku

# 1. Environment (see .env.example for the full map — there is no root .env)
cp backend/.env.example backend/.env       # fill in DATABASE_URL/DIRECT_URL + JWT_SECRET minimum
cp frontend/.env.example frontend/.env     # defaults work for local dev

# 2. Install workspaces + generate the Prisma client
npm run setup

# 3. Run everything
npm run dev            # frontend (5173) + backend (3001) via turbo
```

Optional AI features activate with `GOOGLE_API_KEY` (voice NLP/STT, receipt OCR,
statement parsing) and `OPENAI_API_KEY` (Whisper STT) in `backend/.env` — everything
degrades gracefully without them.

## Everyday commands (root)

| Command | What it does |
|---|---|
| `npm run dev` | Start frontend + backend dev servers (turbo, parallel) |
| `npm run dev:full` | Legacy orchestrator (port cleanup + prisma freshness checks) |
| `npm run build` | Build all deployable targets (turbo: shared → backend → frontend, cached) |
| `npm run test` | vitest (frontend) + jest (backend; needs `backend/.env.test`) |
| `npm run test:e2e` | Playwright suite (needs dev servers + `npm run e2e:seed`) |
| `npm run lint` / `npm run type-check` | All workspaces via turbo |
| `npm run db:migrate` / `db:seed` / `db:studio` | Prisma workflows against backend/.env |

## Deployment

Vercel builds `frontend/` on push to main; Render builds `backend/Dockerfile` via the
root `render.yaml` blueprint. CI (GitHub Actions) runs type-check/lint/tests/CodeQL.
Full guides: [docs/release/DEPLOYMENT_GUIDE.md](docs/release/DEPLOYMENT_GUIDE.md) and
[docs/release/OPERATIONS_RUNBOOK.md](docs/release/OPERATIONS_RUNBOOK.md).
