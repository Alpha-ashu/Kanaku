# Kanaku Feature Map â€” Cross-Layer Traceability

> **This is the document stakeholders asked for.** It proves Kanaku is organized
> **by feature**, not just by layer. For every feature you can trace UI â†’ backend
> â†’ database â†’ API contract â†’ tests in one row. No code had to be physically torn
> apart to achieve this â€” the traceability is **logical**, mapped onto the real
> (deployable) repo layout.

## How to read this

Each feature is a horizontal slice across five layers:

```
            Frontend (UI)        Backend (logic)              Database         API contract            Tests
  auth  â†’  frontend/src/...  â†’  backend/src/features/auth â†’  prisma models  â†’  docs/api/contracts/auth/*  â†’  backend/tests + quality/api/auth
```

The **backend already groups by feature** under `backend/src/features/<name>/`
(controller Â· service Â· routes Â· validation Â· types Â· tests). That is Kanaku's
"feature" layer. The other four layers are mapped to it below.

## Stakeholder one-liner

> *"Each feature â€” Login, Transactions, Budgets, Reports â€” owns its screen, its
> server logic, its data model, its API contract, and its tests. Anyone can open
> the Feature Map, pick a row, and see the whole feature end-to-end."*

## The map

> 36 backend features exist. Below are the highest-traffic ones fully traced;
> the same pattern applies to every feature (`backend/src/features/<name>/`).

| Feature | Frontend (UI) | Backend (logic) | Database (model) | API contract | Tests |
|---|---|---|---|---|---|
| **auth** | `frontend/src/pages/Login*`, `contexts/AuthContext.tsx`, `services/auth*` | `backend/src/features/auth/` | `User`, `Session`, `Device`, `Otp` | `docs/api/contracts/auth/*.api.json` (13) | `backend/tests/integration/auth*`, `tests/e2e/auth/*`, `quality/api/auth/*` |
| **transactions** | `frontend/src/pages/Transactions*`, `services/transaction*` | `backend/src/features/transactions/` | `Transaction`, `Category` | `docs/api/contracts/transactions/*` | `backend/tests/integration/transactions*` |
| **accounts** | `frontend/src/pages/Accounts*` | `backend/src/features/accounts/` | `Account` | `docs/api/contracts/accounts/*` | `backend/tests/integration/accounts*` |
| **budgets** | `frontend/src/pages/Budgets*` | `backend/src/features/budgets/` | `Budget` | `docs/api/contracts/budgets/*` | `backend/tests/integration/budgets*` |
| **goals** | `frontend/src/pages/Goals*` | `backend/src/features/goals/` | `Goal`, `GoalContribution` | `docs/api/contracts/goals/*` | â€” |
| **bills** | `frontend/src/pages/Bills*` | `backend/src/features/bills/` | `Bill` | `docs/api/contracts/bills/*` | `backend/tests/integration/bills-security*` |
| **dashboard** | `frontend/src/pages/Dashboard*` | `backend/src/features/dashboard/` | (aggregates) | `docs/api/contracts/dashboard/*` | â€” |
| **sync** (offline-first) | `frontend/src/lib/dexie*`, `services/sync*` | `backend/src/features/sync/` | all syncable entities | `docs/api/contracts/sync/*` | `backend/tests/integration/sync*` |
| **ai / receipts** | `frontend/src/pages/Import*`, scanners | `backend/src/features/ai`, `â€¦/receipts` | `Receipt` | `docs/api/contracts/ai/*`, `docs/api/contracts/receipts/*` | `backend/tests/integration/ai-security*` |
| **investments / stocks / gold** | `frontend/src/pages/Investments*` | `backend/src/features/{investments,stocks,gold}/` | `Investment`, `Holding` | `docs/api/contracts/{investments,stocks,gold}/*` | â€” |

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
â”œâ”€â”€ <name>.controller.ts   # request handling
â”œâ”€â”€ <name>.service.ts      # business logic
â”œâ”€â”€ <name>.routes.ts       # /api/v1/<name> routes
â”œâ”€â”€ <name>.validation.ts   # zod schemas (where present)
â”œâ”€â”€ <name>.types.ts        # typed DTOs
â””â”€â”€ tests/                 # unit tests
```

## Layer map (where each layer physically lives)

| Layer | Path | Notes |
|---|---|---|
| Frontend (UI) | `frontend/src/` | One Vite SPA. Feature grouping inside `pages/` + `services/` (Phase 2 will formalize `frontend/src/features/`). |
| Backend (logic) | `backend/src/features/` | **Already feature-grouped.** |
| Database | `backend/prisma/schema.prisma` (source of truth) + `database/` (raw SQL) | Single Prisma schema by tooling constraint. |
| API contracts | `docs/api/contracts/<feature>/<action>.api.json` | 238 endpoints generated; idempotent. |
| Tests | `backend/tests/`, `tests/e2e/`, `frontend/src/**/*.test.tsx`, `quality/` (index) | Unified via [`quality/README.md`](../../quality/README.md). |
| Platform/shared | `platform/` (index) â†’ `backend/src/middleware`, `utils`, `db`; `database/`; `supabase/`; `config/` | See [`platform/README.md`](../../platform/README.md). |

