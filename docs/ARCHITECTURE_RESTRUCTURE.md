# Kanaku Ã¢â‚¬â€œ Enterprise Architecture & Restructure Plan

> **Audience:** developers, QA, security reviewers, and non-technical stakeholders.
> **Status:** Phases 1, 3, 6 applied + clutter-consolidation (Ã‚Â§10) applied. Phase 2 (frontend) and the `apps/` physical move (Ã‚Â§11) are deferred-by-design.
> **Date:** 2026-06-19

Kanaku is a **financial-grade, offline-first** expense & wealth tracker. This document is the single source of truth for **where things live and why**. It maps the *target* enterprise architecture onto the *current* repo so we get clarity **without breaking the production build, mobile builds, or deployment pipelines** (Vercel, Fly.io, Capacitor/Android, Prisma, Supabase).

> Ã°Å¸Â§Â­ **Stakeholders:** start with the **[Feature Map](architecture/FEATURE_MAP.md)** Ã¢â‚¬â€ it traces every feature across UI, backend, database, API, and tests in one table.

---

## 1. High-Level Architecture (Stakeholder View)

```
Kanaku System
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Frontend  (UI Layer)              Ã¢â€ â€™ what the user sees           [React + Vite + Capacitor]
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Backend   (Business Logic Layer)  Ã¢â€ â€™ the rules of money           [Node + Express + Prisma]
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Database  (Data Layer)            Ã¢â€ â€™ the source of truth          [PostgreSQL via Prisma + Supabase]
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ APIs      (Communication Layer)   Ã¢â€ â€™ contracts between layers     [REST /api/v1, documented in docs/api/contracts/]
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Security  (Auth + Authorization)  Ã¢â€ â€™ who can do what              [Supabase identity + custom JWT + RBAC]
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Testing   (Quality Assurance)     Ã¢â€ â€™ proof it works               [Jest, Vitest, Playwright, manual]
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Shared    (Common building blocks)Ã¢â€ â€™ utilities reused everywhere
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ Config    (Environments)          Ã¢â€ â€™ dev / staging / prod settings
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ Archive   (Safe cleanup bucket)   Ã¢â€ â€™ never delete Ã¢â‚¬â€ always archive
```

**One-sentence pitch:** *Every feature (Auth, Transactions, Reports, Ã¢â‚¬Â¦) is self-contained Ã¢â‚¬â€ it owns its UI, server logic, database schema, API docs, and tests Ã¢â‚¬â€ so any reviewer can trace a feature top-to-bottom in minutes.*

---

## 2. Final Folder Structure (Target Tree)

Legend: Ã¢Å“â€¦ exists today Ã‚Â· Ã°Å¸Å¸Â¡ added in Phase 1 Ã‚Â· Ã°Å¸Å¸Â¢ applied in Phase 3 Ã‚Â· Ã°Å¸â€Âµ still pending.

```
Kanaku/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ frontend/                          Ã¢Å“â€¦
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ src/
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ features/                  Ã°Å¸â€Âµ  (Phase 2 Ã¢â‚¬â€œ migrate from src/pages + src/components)
Ã¢â€â€š       Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ auth/{components,pages,services,hooks,state,styles,tests}
Ã¢â€â€š       Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ dashboard/...
Ã¢â€â€š       Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ transactions/...
Ã¢â€â€š       Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ reports/...
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ shared/                    Ã°Å¸â€Âµ  (rename of src/lib + src/utils + src/components/common)
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ app/                       Ã¢Å“â€¦
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ routes/                    Ã°Å¸â€Âµ  (extract from src/app)
Ã¢â€â€š       Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ assets/                    Ã¢Å“â€¦
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ backend/                           Ã¢Å“â€¦
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ src/
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ features/                  Ã°Å¸Å¸Â¢  (RENAMED from modules/ in Phase 3 Ã¢â‚¬â€ 2026-06-19)
Ã¢â€â€š       Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ auth/{*.controller,*.service,*.routes,*.validation,*.types,tests}
Ã¢â€â€š       Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ transactions/...
Ã¢â€â€š       Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ accounts/...
Ã¢â€â€š       Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ Ã¢â‚¬Â¦ (36 features)
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ middleware/                Ã¢Å“â€¦
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ security/                  Ã¢Å“â€¦  (re-export hub Ã¢â‚¬â€œ see backend/src/security/README.md)
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ config/                    Ã¢Å“â€¦
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ utils/                     Ã¢Å“â€¦  (core: logger, error-handler)
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ db/                        Ã¢Å“â€¦  (Prisma client)
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ workers/, sockets/, emails/Ã¢Å“â€¦
Ã¢â€â€š       Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ server.ts, app.ts          Ã¢Å“â€¦
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ database/                          Ã¢Å“â€¦
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ schemas/                       Ã°Å¸â€Âµ  (split schema.sql per feature Ã¢â‚¬â€œ see Ã‚Â§6)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ queries/                       Ã°Å¸â€Âµ
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ migrations/                    Ã¢Å“â€¦  (Prisma Ã¢â‚¬â€œ backend/prisma/migrations)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ seeds/                         Ã°Å¸â€Âµ
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ supabase_schema.sql, init.sql  Ã¢Å“â€¦
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ docs/api/contracts/                          Ã°Å¸Å¸Â¢  Ã¢â€ Â 238 endpoints auto-generated (Phase 5 pilot)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ README.md                      Ã°Å¸Å¸Â¡
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ _template.api.json             Ã°Å¸Å¸Â¡
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ api-index.json                 Ã°Å¸Å¸Â¢  (machine-readable endpoint catalog)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ auth/login.api.json            Ã°Å¸Å¸Â¡  (hand-written reference sample)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ <feature>/<action>.api.json    Ã°Å¸Å¸Â¢  (generated; re-runnable, preserves hand-edits)
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ platform/                          Ã°Å¸Å¸Â¢  Ã¢â€ Â system-services hub (was: security/ + shared/)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ README.md                      Ã°Å¸Å¸Â¢  (indexes database/, supabase/, config/ with reasons)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ security/README.md             Ã°Å¸Å¸Â¢  (Ã¢â€ â€™ backend/src/security/, middleware/)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ shared/README.md               Ã°Å¸Å¸Â¢  (Ã¢â€ â€™ backend/src/utils, frontend/src/lib)
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ quality/                           Ã°Å¸Å¸Â¢  Ã¢â€ Â unified testing hub (was: testing/)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ README.md                      Ã°Å¸Å¸Â¢  (index of all real test locations)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ api/auth/login.test.json       Ã°Å¸Å¸Â¢  (sample API contract test)
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ config/                            Ã¢Å“â€¦  (config/credentials.ts Ã¢â‚¬â€ indexed by platform/)
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ scripts/                           Ã¢Å“â€¦  (+ generate-api-docs.{cjs,ps1}, rename-modules-to-features.ps1)
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ docs/                              Ã¢Å“â€¦  (deep architecture & feature docs)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ architecture/FEATURE_MAP.md    Ã°Å¸Å¸Â¢  Ã¢â€ Â stakeholder traceability
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ guidelines/                    Ã°Å¸Å¸Â¢  (moved from root guidelines/)
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ archive-unused/                    Ã°Å¸Å¸Â¢  Ã¢â€ Â Phase 6 sweep: 17 files archived 2026-06-19
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ README.md                      Ã°Å¸Å¸Â¡  (governance: never delete, always document)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ frontend/one-off-scripts/      Ã°Å¸Å¸Â¢  (7 dead codemods/smoke scripts)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ notes/scratch/                 Ã°Å¸Å¸Â¢  (10 dev scratchpad files)
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ backend/, database/, api/, tests/ (empty Ã¢â‚¬â€ placeholders)
Ã¢â€â€š
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ android/, supabase/, resources/    Ã¢Å“â€¦  (platform-specific Ã¢â‚¬â€œ do not move)
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ vercel.json, fly.toml,             Ã¢Å“â€¦  (deployment Ã¢â‚¬â€œ do not move)
Ã¢â€â€š   capacitor.config.json, Dockerfile
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ package.json, tsconfig.json        Ã¢Å“â€¦
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ README.md, SECURITY.md             Ã¢Å“â€¦
```

---

## 3. Backend Feature Layer (`backend/src/features/`)

Each backend feature is a self-contained folder:

| Template (generic)                          | Kanaku (real, in-repo)                                        |
|---------------------------------------------|---------------------------------------------------------------|
| `backend/features/auth/controller/`         | `backend/src/features/auth/auth.controller.ts`                |
| `backend/features/auth/service/`            | `backend/src/features/auth/auth.service.ts`                   |
| `backend/features/auth/repository/`         | `backend/src/db/` (Prisma) Ã¢â‚¬â€ repo pattern is feature-internal |
| `backend/features/auth/model/`              | `backend/prisma/schema.prisma` (single source of truth)       |
| `backend/features/auth/routes/`             | `backend/src/features/auth/auth.routes.ts`                    |
| `backend/features/auth/validation/`         | `backend/src/features/auth/*.validation.ts` + zod             |
| `backend/features/auth/tests/`              | `backend/src/features/auth/tests/` + `backend/tests/**`       |

> **History:** this directory was previously named `backend/src/modules/`. It was renamed to `backend/src/features/` in Phase 3 on 2026-06-19 via `scripts/rename-modules-to-features.ps1` (97 import sites + 584 api-doc references rewritten in one atomic codemod). Stakeholder-facing docs (53 markdown files) are scheduled for a follow-up doc-only PR.

---

## 4. One Feature End-to-End (Example: **Auth**)

| Layer            | Location                                                              |
|------------------|-----------------------------------------------------------------------|
| Frontend UI      | `frontend/src/pages/Login*.tsx`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/services/auth*.ts` (Phase 2: Ã¢â€ â€™ `frontend/src/features/auth/`) |
| Backend code     | `backend/src/features/auth/` (controller, service, routes, validation, types) |
| DB schema        | `backend/prisma/schema.prisma` (models `User`, `Session`, `Device`, `Otp`) + `backend/create_auth.sql` |
| API docs         | `docs/api/contracts/auth/*.api.json` Ã¢â‚¬â€ 13 endpoints (1 hand-written reference, 12 auto-generated) |
| Security         | `backend/src/middleware/auth.ts`, `platform/security/README.md` Ã¢â€ â€™ `backend/src/security/` (multi-strategy bearer, JWT rotation, rate limits) |
| Tests            | `backend/tests/integration/auth*.test.ts`, `quality/e2e/auth/*`, `quality/api/auth/*.test.json` |
| Manual test plan | `tests/manual/auth.md` (to be added per feature)                      |

**Traceability rule:** every feature must be reachable from these six rows. If a row is empty, that's a backlog ticket.

---

## 5. Sample Artifacts (Shipped in This Change)

- **API doc template:** `docs/api/contracts/_template.api.json`
- **Sample API doc:** `docs/api/contracts/auth/login.api.json`
- **Sample API test:** `testing/api-testing/auth/login.test.json`
- **Archive governance:** `archive-unused/README.md`
- **Platform hub:** `platform/README.md` (+ `platform/security/`, `platform/shared/`)
- **Quality (testing) hub:** `quality/README.md`
- **Feature map:** `docs/architecture/FEATURE_MAP.md`

See each file for the exact format used going forward.

---

## 6. Migration Strategy (How to Move From Current Ã¢â€ â€™ Target Safely)

We use **strangler-fig**, not big-bang. Each phase is independently shippable and revertible.

### Phase 1 Ã¢â‚¬â€ Documentation & Scaffolding (Ã¢Å“â€¦ applied 2026-06-19)
- Added `docs/api/contracts/`, `archive-unused/`, and (later consolidated into) `platform/` + `quality/` root indexes.
- Documented the architecture, governance rules, and feature mapping.
- Shipped one hand-written sample per artifact type.

### Phase 2 Ã¢â‚¬â€ Frontend feature migration (Ã°Å¸â€Âµ pending, per-feature, opt-in)
For each feature (start with the smallest, e.g. `notifications`):
1. Create `frontend/src/features/<name>/{components,pages,services,hooks,state,tests}`.
2. Move files; update imports with a codemod (e.g. `ts-morph` script in `scripts/`).
3. Run `npm --prefix frontend run build` + `vitest` + Playwright smoke.
4. PR with **only one feature** moved. Merge. Repeat.

### Phase 3 Ã¢â‚¬â€ Backend rename `modules/` Ã¢â€ â€™ `features/` (Ã¢Å“â€¦ applied 2026-06-19, code-only)
Executed via `scripts/rename-modules-to-features.ps1 -Apply -SkipDocs`:
- Directory renamed: `backend/src/modules/` Ã¢â€ â€™ `backend/src/features/` (36 feature folders, 200+ files, `git mv` preserved history).
- 15 code files rewritten (97 import/require hits) including `server.ts`, `routes/index.ts`, `routes/sync.ts`, `utils/auth.ts`, and 3 `.claude/` audit scripts.
- 240 api-docs JSON files updated (584 hits) to point at `backend/src/features/...`.
- Generator scripts (`scripts/generate-api-docs.{cjs,ps1}`) patched to scan `features/`.
- **Deferred:** 53 stakeholder markdown files (299 hits) Ã¢â‚¬â€ schedule a doc-only follow-up PR titled `docs: rename modules/ -> features/ across docs/` so the rename is visible, not buried in noise.
- **Verification required before commit** (cannot be run in this environment Ã¢â‚¬â€ no Node installed):
  - `npm --prefix backend run build`
  - `npm --prefix backend test`
  - `npm --prefix backend run test:security`
  - `npm --prefix frontend run build`
  - If anything fails: `git restore --staged --worktree .` reverts the entire codemod cleanly.

### Phase 4 Ã¢â‚¬â€ Database split (Ã°Å¸â€Âµ pending)
Split `backend/schema.sql` / `database/*.sql` into `database/schemas/<feature>/*.sql`. Prisma schema stays single-file (Prisma constraint); split SQL is for **auditing / documentation**, not migrations.

### Phase 5 Ã¢â‚¬â€ Per-feature API docs backfill (Ã¢Å“â€¦ applied 2026-06-19)
Generated **238 endpoint contracts** across **36 features** via `scripts/generate-api-docs.ps1` (and matching `.cjs` for CI). The generator is **idempotent** Ã¢â‚¬â€ hand-edited files (those missing the `generator: { auto: true }` block) are detected and never overwritten. Re-run after every route change.

### Phase 6 Ã¢â‚¬â€ Archive sweep (Ã¢Å“â€¦ applied 2026-06-19)
17 verified-dead files moved into `archive-unused/` with `reason.md` documentation:
- `archive-unused/frontend/one-off-scripts/` (7 dead codemods + smoke scripts)
- `archive-unused/notes/scratch/` (10 dev scratchpad files; original `scratch/` directory removed)

Future sweeps: run `npx depcheck` and `npx ts-prune`, then move only verified-unused files per the `archive-unused/README.md` governance.

---

### Phase 7 â€” `apps/` layout migration (CODEMOD READY, opt-in)
A complete, guarded codemod ships at `scripts/migrate-to-apps-layout.ps1`:
- **Dry-run by default** (prints the full plan; writes nothing). `-Apply` to execute.
- Moves `frontend/`â†’`apps/frontend/`, `backend/`â†’`apps/backend/`, `api/`â†’`apps/edge/` via `git mv` (history preserved), directory moves done **last**.
- Auto-rewrites **13 config edits** (package.json workspaces+scripts, vercel.json, fly.toml, capacitor.config.json) and **6 cross-boundary code refs** (backend/apply_schema.cjs `../database`â†’`../../database`, the `scripts/gen-*` generators, `scripts/seed_e2e_users.cjs`).
- **Residual detector** prints any remaining cross-boundary references for manual review (e.g. `api/index.ts`'s `../backend/dist/app.js`, which stays valid as a sibling under `apps/`).
- Idempotent guard + a printed post-apply verification checklist.
> **Must be run in a Node + full-CI environment** (this session has no Node). Gate:
> `npm install && npm run build && npm test && npm --prefix apps/backend test && npm --prefix apps/backend run test:security && npx playwright test && npx cap sync`.
> Any failure â‡’ `git restore --staged --worktree .` reverts the whole migration.

---

## 7. Governance Rules (MUST follow Ã¢â‚¬â€ add to PR checklist)

1. **One feature Ã¢â€ â€™ one folder** across every layer (frontend, backend, db, api-docs, tests).
2. **No cross-feature imports** except via `platform/shared` or a published interface (`*.types.ts`).
3. **Every new API endpoint requires:**
   - a route under `/api/v1/...`
   - zod validation middleware
   - an `docs/api/contracts/<feature>/<action>.api.json` entry
   - a `quality/api/<feature>/<action>.test.json` entry
   - an integration test in `backend/tests/`
4. **Money rules are server-authoritative.** All balance mutations run in a Prisma `$transaction`.
5. **Ownership check before every read/write** on user-scoped resources.
6. **No `any` in new code.** Use zod-inferred types or explicit interfaces.
7. **Offline-first:** writes hit Dexie first Ã¢â€ â€™ mark `syncPending` Ã¢â€ â€™ background retry.
8. **Secrets never in code.** Use env + `platform/config/credentials.ts` resolver.
9. **Unused files Ã¢â€ â€™ `archive-unused/` with `reason.md`.** Never `rm`.
10. **Security-sensitive changes** (auth, tokens, raw SQL, validation) require review per `SECURITY.md`.
11. **Naming:** `<feature>.<action>.<type>` for backend (`auth.login.controller.ts`), kebab-case for frontend folders.
12. **Tests required before merge.** CI must be green.

---

## 8. What This Achieves

Ã¢Å“â€ **Clean** Ã¢â‚¬â€ clear ownership per feature.
Ã¢Å“â€ **Secure** Ã¢â‚¬â€ security controls indexed and discoverable (`platform/security/README.md` Ã¢â€ â€™ `backend/src/security/`).
Ã¢Å“â€ **Scalable** Ã¢â‚¬â€ adding a feature = copy the template, no central file to edit.
Ã¢Å“â€ **Easy to understand** Ã¢â‚¬â€ stakeholder map in Ã‚Â§1 + [Feature Map](architecture/FEATURE_MAP.md).
Ã¢Å“â€ **Easy to test** Ã¢â‚¬â€ every API has a docs file AND a test file in the same shape; unified hub at `quality/`.
Ã¢Å“â€ **Audit-friendly** Ã¢â‚¬â€ `SECURITY_AUDIT_REPORT.md` + `backend/src/security/README.md` + `docs/api/contracts/` give auditors a single read path.
Ã¢Å“â€ **Safe** Ã¢â‚¬â€ nothing ever deleted; `archive-unused/` is the only sink.

---

## 9. Quick Links

- Feature traceability map: [`docs/architecture/FEATURE_MAP.md`](architecture/FEATURE_MAP.md)
- Backend feature index: [`backend/src/features/README.md`](../backend/src/features/README.md)
- Platform hub: [`platform/README.md`](../platform/README.md) Ã‚Â· Security: [`platform/security/README.md`](../platform/security/README.md)
- Quality (testing) hub: [`quality/README.md`](../quality/README.md)
- API contracts index: [`docs/api/contracts/api-index.json`](api/contracts/api-index.json) Ã‚Â· [`docs/api/contracts/README.md`](api/contracts/README.md)
- API catalog (generated): [`quality/api/API_CATALOG.md`](../quality/api/API_CATALOG.md)
- Master docs: [`docs/MASTER_DOCUMENTATION.md`](MASTER_DOCUMENTATION.md)
- Production readiness: [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md)
- Security policy: [`SECURITY.md`](SECURITY.md)

---

## 10. Clutter Consolidation (Ã¢Å“â€¦ applied 2026-06-19)

Reduced top-level folder sprawl **without touching load-bearing code**:

| Action | Before (root) | After | Risk |
|---|---|---|---|
| Fold testing index hub | `testing/` | `quality/` | none (was an index I authored) |
| Group security index | `security/` | `platform/security/` | none |
| Group shared index | `shared/` | `platform/shared/` | none |
| Move contributor guidelines | `guidelines/` | `docs/guidelines/` | none (only doc refs) |
| New platform hub | Ã¢â‚¬â€ | `platform/` (+ README indexing database/supabase/config) | none |

**Net:** removed `testing/`, `security/`, `shared/`, `guidelines/` from root; added `quality/` + `platform/`. Stakeholders now see fewer, clearer top-level buckets.

---

## 11. Decision Matrix Ã¢â‚¬â€ Why the literal `apps/ + features-colocated` rewrite was NOT executed

A stakeholder proposal asked to move `frontend/`Ã¢â€ â€™`apps/frontend`, `backend/`Ã¢â€ â€™`apps/backend`, co-locate `features/<x>/{frontend,backend,database,api,tests}`, delete root `api/`, and merge `database`+`supabase`. Each was evaluated against the **actual deploy/build configs**:

| Proposed move | Verdict | Hard evidence |
|---|---|---|
| `frontend/`Ã¢â€ â€™`apps/frontend/` | Ã¢ÂÅ’ blocked | `package.json` `workspaces:["frontend","backend"]`; `vercel.json` `outputDirectory:"frontend/dist"`; `capacitor.config.json` `webDir:"frontend/dist"` |
| `backend/`Ã¢â€ â€™`apps/backend/` | Ã¢ÂÅ’ blocked | `fly.toml` `dockerfile='backend/Dockerfile'`; `db:*` scripts hardcode `backend/prisma/...` |
| Delete root `api/` | Ã¢ÂÅ’ blocked | `vercel.json` routes `/api/v1/stocks`Ã¢â€ â€™`api/stocks.ts` + `functions` entry Ã¢â‚¬â€ **live serverless function** |
| Merge `database`+`supabase` | Ã¢ÂÅ’ blocked | `supabase/` is the **Supabase CLI root**; `database/*.sql` read by `backend/apply_schema.cjs` |
| Move `api-testing/`, `platform/database/docs/` | Ã¢ÂÅ’ futile | **auto-generated** by `scripts/gen-catalogs.mjs` at fixed root paths |
| Co-locate one SPA + one Express app into per-feature physical trees | Ã¢ÂÅ’ scope | Single Vite entry + single Prisma `rootDir`; this is an Nx/Turborepo migration, not a refactor |
| Consolidate index folders, add `platform/`+`quality/`, feature map | Ã¢Å“â€¦ done | Ã‚Â§10 above |

> The **conceptual** model the proposal wants (apps / features / platform / quality / docs) is delivered as the **logical view** in [`FEATURE_MAP.md`](architecture/FEATURE_MAP.md) + the `platform/` and `quality/` hubs Ã¢â‚¬â€ without the breakage.

### Migration mapping (old Ã¢â€ â€™ target) for a future, CI-verified `apps/` move

If the literal physical move is later required, do it in a Node + full-CI environment (not achievable in this session Ã¢â‚¬â€ no Node installed). Mapping and the configs each step must update:

| Old | New | Configs that MUST be updated in the same PR |
|---|---|---|
| `frontend/` | `apps/frontend/` | `package.json` workspaces, all `--workspace`/`--prefix frontend` scripts, `vercel.json` (buildCommand, outputDirectory), `capacitor.config.json` webDir, `tsconfig*.json` paths |
| `backend/` | `apps/backend/` | `package.json` workspaces + `db:*` + `qa:*` scripts, `fly.toml` dockerfile, `backend/Dockerfile` COPY paths, `backend/tsconfig.json` rootDir, `jest.config.ts`, Prisma schema path in `db:generate` |
| `api/` | `apps/edge/` (Vercel functions) | `vercel.json` `routes` dests + `functions` keys |
| `database/`, `supabase/`, `config/` | `platform/*` | `backend/apply_schema.cjs` path, `scripts/gen-catalogs.mjs` output paths, Supabase CLI `supabase/config.toml` location (CLI may require root) |
| `tests/` | `quality/e2e/` | `playwright.config.ts` testDir/outputDir/3 reporters, ~40 doc links |

**Required verification gate (any of these red Ã¢â€¡â€™ revert with `git restore --staged --worktree .`):**
```
npm run build           # backend + frontend
npm test                # frontend vitest
npm --prefix backend test
npm --prefix backend run test:security
npx playwright test
npx cap sync            # mobile
```

- Codemods: `scripts/generate-api-docs.{cjs,ps1}`, `scripts/rename-modules-to-features.ps1`

