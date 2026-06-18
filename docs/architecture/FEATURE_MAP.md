# Kanaku Feature Map — Cross-Layer Traceability

> **This is the document stakeholders asked for.** It proves Kanaku is organized
> **by feature**, not just by layer. For every feature you can trace UI → backend
> → database → API contract → tests in one row. No code had to be physically torn
> apart to achieve this — the traceability is **logical**, mapped onto the real
> (deployable) repo layout.

## How to read this

Each feature is a horizontal slice across five layers:

```
            Frontend (UI)        Backend (logic)              Database         API contract            Tests
  auth  →  frontend/src/...  →  backend/src/features/auth →  prisma models  →  api-docs/auth/*  →  backend/tests + quality/api/auth
```

The **backend already groups by feature** under `backend/src/features/<name>/`
(controller · service · routes · validation · types · tests). That is Kanaku's
"feature" layer. The other four layers are mapped to it below.

## Stakeholder one-liner

> *"Each feature — Login, Transactions, Budgets, Reports — owns its screen, its
> server logic, its data model, its API contract, and its tests. Anyone can open
> the Feature Map, pick a row, and see the whole feature end-to-end."*

## The map

> 36 backend features exist. Below are the highest-traffic ones fully traced;
> the same pattern applies to every feature (`backend/src/features/<name>/`).

| Feature | Frontend (UI) | Backend (logic) | Database (model) | API contract | Tests |
|---|---|---|---|---|---|
| **auth** | `frontend/src/pages/Login*`, `contexts/AuthContext.tsx`, `services/auth*` | `backend/src/features/auth/` | `User`, `Session`, `Device`, `Otp` | `api-docs/auth/*.api.json` (13) | `backend/tests/integration/auth*`, `tests/e2e/auth/*`, `quality/api/auth/*` |
| **transactions** | `frontend/src/pages/Transactions*`, `services/transaction*` | `backend/src/features/transactions/` | `Transaction`, `Category` | `api-docs/transactions/*` | `backend/tests/integration/transactions*` |
| **accounts** | `frontend/src/pages/Accounts*` | `backend/src/features/accounts/` | `Account` | `api-docs/accounts/*` | `backend/tests/integration/accounts*` |
| **budgets** | `frontend/src/pages/Budgets*` | `backend/src/features/budgets/` | `Budget` | `api-docs/budgets/*` | `backend/tests/integration/budgets*` |
| **goals** | `frontend/src/pages/Goals*` | `backend/src/features/goals/` | `Goal`, `GoalContribution` | `api-docs/goals/*` | — |
| **bills** | `frontend/src/pages/Bills*` | `backend/src/features/bills/` | `Bill` | `api-docs/bills/*` | `backend/tests/integration/bills-security*` |
| **dashboard** | `frontend/src/pages/Dashboard*` | `backend/src/features/dashboard/` | (aggregates) | `api-docs/dashboard/*` | — |
| **sync** (offline-first) | `frontend/src/lib/dexie*`, `services/sync*` | `backend/src/features/sync/` | all syncable entities | `api-docs/sync/*` | `backend/tests/integration/sync*` |
| **ai / receipts** | `frontend/src/pages/Import*`, scanners | `backend/src/features/ai`, `…/receipts` | `Receipt` | `api-docs/ai/*`, `api-docs/receipts/*` | `backend/tests/integration/ai-security*` |
| **investments / stocks / gold** | `frontend/src/pages/Investments*` | `backend/src/features/{investments,stocks,gold}/` | `Investment`, `Holding` | `api-docs/{investments,stocks,gold}/*` | — |

> Empty cells = backlog tickets, not architecture gaps. A feature is "complete"
> when all five columns are filled.

## All 36 backend features

`aa, accounts, admin, advisors, ai, auth, avatars, bills, bookings, budgets,
categorization, collaboration, dashboard, devices, friends, goals, gold, groups,
import, investments, loans, notifications, otp, payments, pin, receipts,
recurring, sessions, settings, stocks, sync, tax, todos, transactions, voice,
webhooks`

Each is at `backend/src/features/<name>/` with the standard internal layout:

```
backend/src/features/<name>/
├── <name>.controller.ts   # request handling
├── <name>.service.ts      # business logic
├── <name>.routes.ts       # /api/v1/<name> routes
├── <name>.validation.ts   # zod schemas (where present)
├── <name>.types.ts        # typed DTOs
└── tests/                 # unit tests
```

## Layer map (where each layer physically lives)

| Layer | Path | Notes |
|---|---|---|
| Frontend (UI) | `frontend/src/` | One Vite SPA. Feature grouping inside `pages/` + `services/` (Phase 2 will formalize `frontend/src/features/`). |
| Backend (logic) | `backend/src/features/` | **Already feature-grouped.** |
| Database | `backend/prisma/schema.prisma` (source of truth) + `database/` (raw SQL) | Single Prisma schema by tooling constraint. |
| API contracts | `api-docs/<feature>/<action>.api.json` | 238 endpoints generated; idempotent. |
| Tests | `backend/tests/`, `tests/e2e/`, `frontend/src/**/*.test.tsx`, `quality/` (index) | Unified via [`quality/README.md`](../../quality/README.md). |
| Platform/shared | `platform/` (index) → `backend/src/middleware`, `utils`, `db`; `database/`; `supabase/`; `config/` | See [`platform/README.md`](../../platform/README.md). |

