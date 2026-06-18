# Kanaku â€“ Enterprise Architecture & Restructure Plan

> **Audience:** developers, QA, security reviewers, and non-technical stakeholders.
> **Status:** Phases 1, 3, 6 applied + clutter-consolidation (Â§10) applied. Phase 2 (frontend) and the `apps/` physical move (Â§11) are deferred-by-design.
> **Date:** 2026-06-19

Kanaku is a **financial-grade, offline-first** expense & wealth tracker. This document is the single source of truth for **where things live and why**. It maps the *target* enterprise architecture onto the *current* repo so we get clarity **without breaking the production build, mobile builds, or deployment pipelines** (Vercel, Fly.io, Capacitor/Android, Prisma, Supabase).

> ðŸ§­ **Stakeholders:** start with the **[Feature Map](docs/architecture/FEATURE_MAP.md)** â€” it traces every feature across UI, backend, database, API, and tests in one table.

---

## 1. High-Level Architecture (Stakeholder View)

```
Kanaku System
â”œâ”€â”€ Frontend  (UI Layer)              â†’ what the user sees           [React + Vite + Capacitor]
â”œâ”€â”€ Backend   (Business Logic Layer)  â†’ the rules of money           [Node + Express + Prisma]
â”œâ”€â”€ Database  (Data Layer)            â†’ the source of truth          [PostgreSQL via Prisma + Supabase]
â”œâ”€â”€ APIs      (Communication Layer)   â†’ contracts between layers     [REST /api/v1, documented in api-docs/]
â”œâ”€â”€ Security  (Auth + Authorization)  â†’ who can do what              [Supabase identity + custom JWT + RBAC]
â”œâ”€â”€ Testing   (Quality Assurance)     â†’ proof it works               [Jest, Vitest, Playwright, manual]
â”œâ”€â”€ Shared    (Common building blocks)â†’ utilities reused everywhere
â”œâ”€â”€ Config    (Environments)          â†’ dev / staging / prod settings
â””â”€â”€ Archive   (Safe cleanup bucket)   â†’ never delete â€” always archive
```

**One-sentence pitch:** *Every feature (Auth, Transactions, Reports, â€¦) is self-contained â€” it owns its UI, server logic, database schema, API docs, and tests â€” so any reviewer can trace a feature top-to-bottom in minutes.*

---

## 2. Final Folder Structure (Target Tree)

Legend: âœ… exists today Â· ðŸŸ¡ added in Phase 1 Â· ðŸŸ¢ applied in Phase 3 Â· ðŸ”µ still pending.

```
Kanaku/
â”œâ”€â”€ frontend/                          âœ…
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ features/                  ðŸ”µ  (Phase 2 â€“ migrate from src/pages + src/components)
â”‚       â”‚   â”œâ”€â”€ auth/{components,pages,services,hooks,state,styles,tests}
â”‚       â”‚   â”œâ”€â”€ dashboard/...
â”‚       â”‚   â”œâ”€â”€ transactions/...
â”‚       â”‚   â””â”€â”€ reports/...
â”‚       â”œâ”€â”€ shared/                    ðŸ”µ  (rename of src/lib + src/utils + src/components/common)
â”‚       â”œâ”€â”€ app/                       âœ…
â”‚       â”œâ”€â”€ routes/                    ðŸ”µ  (extract from src/app)
â”‚       â””â”€â”€ assets/                    âœ…
â”‚
â”œâ”€â”€ backend/                           âœ…
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ features/                  ðŸŸ¢  (RENAMED from modules/ in Phase 3 â€” 2026-06-19)
â”‚       â”‚   â”œâ”€â”€ auth/{*.controller,*.service,*.routes,*.validation,*.types,tests}
â”‚       â”‚   â”œâ”€â”€ transactions/...
â”‚       â”‚   â”œâ”€â”€ accounts/...
â”‚       â”‚   â””â”€â”€ â€¦ (36 features)
â”‚       â”œâ”€â”€ middleware/                âœ…
â”‚       â”œâ”€â”€ security/                  âœ…  (re-export hub â€“ see backend/src/security/README.md)
â”‚       â”œâ”€â”€ config/                    âœ…
â”‚       â”œâ”€â”€ utils/                     âœ…  (core: logger, error-handler)
â”‚       â”œâ”€â”€ db/                        âœ…  (Prisma client)
â”‚       â”œâ”€â”€ workers/, sockets/, emails/âœ…
â”‚       â””â”€â”€ server.ts, app.ts          âœ…
â”‚
â”œâ”€â”€ database/                          âœ…
â”‚   â”œâ”€â”€ schemas/                       ðŸ”µ  (split schema.sql per feature â€“ see Â§6)
â”‚   â”œâ”€â”€ queries/                       ðŸ”µ
â”‚   â”œâ”€â”€ migrations/                    âœ…  (Prisma â€“ backend/prisma/migrations)
â”‚   â”œâ”€â”€ seeds/                         ðŸ”µ
â”‚   â””â”€â”€ supabase_schema.sql, init.sql  âœ…
â”‚
â”œâ”€â”€ api-docs/                          ðŸŸ¢  â† 238 endpoints auto-generated (Phase 5 pilot)
â”‚   â”œâ”€â”€ README.md                      ðŸŸ¡
â”‚   â”œâ”€â”€ _template.api.json             ðŸŸ¡
â”‚   â”œâ”€â”€ api-index.json                 ðŸŸ¢  (machine-readable endpoint catalog)
â”‚   â”œâ”€â”€ auth/login.api.json            ðŸŸ¡  (hand-written reference sample)
â”‚   â””â”€â”€ <feature>/<action>.api.json    ðŸŸ¢  (generated; re-runnable, preserves hand-edits)
â”‚
â”œâ”€â”€ platform/                          ðŸŸ¢  â† system-services hub (was: security/ + shared/)
â”‚   â”œâ”€â”€ README.md                      ðŸŸ¢  (indexes database/, supabase/, config/ with reasons)
â”‚   â”œâ”€â”€ security/README.md             ðŸŸ¢  (â†’ backend/src/security/, middleware/)
â”‚   â””â”€â”€ shared/README.md               ðŸŸ¢  (â†’ backend/src/utils, frontend/src/lib)
â”‚
â”œâ”€â”€ quality/                           ðŸŸ¢  â† unified testing hub (was: testing/)
â”‚   â”œâ”€â”€ README.md                      ðŸŸ¢  (index of all real test locations)
â”‚   â””â”€â”€ api/auth/login.test.json       ðŸŸ¢  (sample API contract test)
â”‚
â”œâ”€â”€ config/                            âœ…  (config/credentials.ts â€” indexed by platform/)
â”œâ”€â”€ scripts/                           âœ…  (+ generate-api-docs.{cjs,ps1}, rename-modules-to-features.ps1)
â”œâ”€â”€ docs/                              âœ…  (deep architecture & feature docs)
â”‚   â”œâ”€â”€ architecture/FEATURE_MAP.md    ðŸŸ¢  â† stakeholder traceability
â”‚   â””â”€â”€ guidelines/                    ðŸŸ¢  (moved from root guidelines/)
â”‚
â”œâ”€â”€ archive-unused/                    ðŸŸ¢  â† Phase 6 sweep: 17 files archived 2026-06-19
â”‚   â”œâ”€â”€ README.md                      ðŸŸ¡  (governance: never delete, always document)
â”‚   â”œâ”€â”€ frontend/one-off-scripts/      ðŸŸ¢  (7 dead codemods/smoke scripts)
â”‚   â”œâ”€â”€ notes/scratch/                 ðŸŸ¢  (10 dev scratchpad files)
â”‚   â”œâ”€â”€ backend/, database/, api/, tests/ (empty â€” placeholders)
â”‚
â”œâ”€â”€ android/, supabase/, resources/    âœ…  (platform-specific â€“ do not move)
â”œâ”€â”€ vercel.json, fly.toml,             âœ…  (deployment â€“ do not move)
â”‚   capacitor.config.json, Dockerfile
â”œâ”€â”€ package.json, tsconfig.json        âœ…
â””â”€â”€ README.md, SECURITY.md             âœ…
```

---

## 3. Backend Feature Layer (`backend/src/features/`)

Each backend feature is a self-contained folder:

| Template (generic)                          | Kanaku (real, in-repo)                                        |
|---------------------------------------------|---------------------------------------------------------------|
| `backend/features/auth/controller/`         | `backend/src/features/auth/auth.controller.ts`                |
| `backend/features/auth/service/`            | `backend/src/features/auth/auth.service.ts`                   |
| `backend/features/auth/repository/`         | `backend/src/db/` (Prisma) â€” repo pattern is feature-internal |
| `backend/features/auth/model/`              | `backend/prisma/schema.prisma` (single source of truth)       |
| `backend/features/auth/routes/`             | `backend/src/features/auth/auth.routes.ts`                    |
| `backend/features/auth/validation/`         | `backend/src/features/auth/*.validation.ts` + zod             |
| `backend/features/auth/tests/`              | `backend/src/features/auth/tests/` + `backend/tests/**`       |

> **History:** this directory was previously named `backend/src/modules/`. It was renamed to `backend/src/features/` in Phase 3 on 2026-06-19 via `scripts/rename-modules-to-features.ps1` (97 import sites + 584 api-doc references rewritten in one atomic codemod). Stakeholder-facing docs (53 markdown files) are scheduled for a follow-up doc-only PR.

---

## 4. One Feature End-to-End (Example: **Auth**)

| Layer            | Location                                                              |
|------------------|-----------------------------------------------------------------------|
| Frontend UI      | `frontend/src/pages/Login*.tsx`, `frontend/src/contexts/AuthContext.tsx`, `frontend/src/services/auth*.ts` (Phase 2: â†’ `frontend/src/features/auth/`) |
| Backend code     | `backend/src/features/auth/` (controller, service, routes, validation, types) |
| DB schema        | `backend/prisma/schema.prisma` (models `User`, `Session`, `Device`, `Otp`) + `backend/create_auth.sql` |
| API docs         | `api-docs/auth/*.api.json` â€” 13 endpoints (1 hand-written reference, 12 auto-generated) |
| Security         | `backend/src/middleware/auth.ts`, `platform/security/README.md` â†’ `backend/src/security/` (multi-strategy bearer, JWT rotation, rate limits) |
| Tests            | `backend/tests/integration/auth*.test.ts`, `tests/e2e/auth/*`, `quality/api/auth/*.test.json` |
| Manual test plan | `tests/manual/auth.md` (to be added per feature)                      |

**Traceability rule:** every feature must be reachable from these six rows. If a row is empty, that's a backlog ticket.

---

## 5. Sample Artifacts (Shipped in This Change)

- **API doc template:** `api-docs/_template.api.json`
- **Sample API doc:** `api-docs/auth/login.api.json`
- **Sample API test:** `testing/api-testing/auth/login.test.json`
- **Archive governance:** `archive-unused/README.md`
- **Platform hub:** `platform/README.md` (+ `platform/security/`, `platform/shared/`)
- **Quality (testing) hub:** `quality/README.md`
- **Feature map:** `docs/architecture/FEATURE_MAP.md`

See each file for the exact format used going forward.

---

## 6. Migration Strategy (How to Move From Current â†’ Target Safely)

We use **strangler-fig**, not big-bang. Each phase is independently shippable and revertible.

### Phase 1 â€” Documentation & Scaffolding (âœ… applied 2026-06-19)
- Added `api-docs/`, `archive-unused/`, and (later consolidated into) `platform/` + `quality/` root indexes.
- Documented the architecture, governance rules, and feature mapping.
- Shipped one hand-written sample per artifact type.

### Phase 2 â€” Frontend feature migration (ðŸ”µ pending, per-feature, opt-in)
For each feature (start with the smallest, e.g. `notifications`):
1. Create `frontend/src/features/<name>/{components,pages,services,hooks,state,tests}`.
2. Move files; update imports with a codemod (e.g. `ts-morph` script in `scripts/`).
3. Run `npm --prefix frontend run build` + `vitest` + Playwright smoke.
4. PR with **only one feature** moved. Merge. Repeat.

### Phase 3 â€” Backend rename `modules/` â†’ `features/` (âœ… applied 2026-06-19, code-only)
Executed via `scripts/rename-modules-to-features.ps1 -Apply -SkipDocs`:
- Directory renamed: `backend/src/modules/` â†’ `backend/src/features/` (36 feature folders, 200+ files, `git mv` preserved history).
- 15 code files rewritten (97 import/require hits) including `server.ts`, `routes/index.ts`, `routes/sync.ts`, `utils/auth.ts`, and 3 `.claude/` audit scripts.
- 240 api-docs JSON files updated (584 hits) to point at `backend/src/features/...`.
- Generator scripts (`scripts/generate-api-docs.{cjs,ps1}`) patched to scan `features/`.
- **Deferred:** 53 stakeholder markdown files (299 hits) â€” schedule a doc-only follow-up PR titled `docs: rename modules/ -> features/ across docs/` so the rename is visible, not buried in noise.
- **Verification required before commit** (cannot be run in this environment â€” no Node installed):
  - `npm --prefix backend run build`
  - `npm --prefix backend test`
  - `npm --prefix backend run test:security`
  - `npm --prefix frontend run build`
  - If anything fails: `git restore --staged --worktree .` reverts the entire codemod cleanly.

### Phase 4 â€” Database split (ðŸ”µ pending)
Split `backend/schema.sql` / `database/*.sql` into `database/schemas/<feature>/*.sql`. Prisma schema stays single-file (Prisma constraint); split SQL is for **auditing / documentation**, not migrations.

### Phase 5 â€” Per-feature API docs backfill (âœ… applied 2026-06-19)
Generated **238 endpoint contracts** across **36 features** via `scripts/generate-api-docs.ps1` (and matching `.cjs` for CI). The generator is **idempotent** â€” hand-edited files (those missing the `generator: { auto: true }` block) are detected and never overwritten. Re-run after every route change.

### Phase 6 â€” Archive sweep (âœ… applied 2026-06-19)
17 verified-dead files moved into `archive-unused/` with `reason.md` documentation:
- `archive-unused/frontend/one-off-scripts/` (7 dead codemods + smoke scripts)
- `archive-unused/notes/scratch/` (10 dev scratchpad files; original `scratch/` directory removed)

Future sweeps: run `npx depcheck` and `npx ts-prune`, then move only verified-unused files per the `archive-unused/README.md` governance.

---

### Phase 7 — `apps/` layout migration (CODEMOD READY, opt-in)
A complete, guarded codemod ships at `scripts/migrate-to-apps-layout.ps1`:
- **Dry-run by default** (prints the full plan; writes nothing). `-Apply` to execute.
- Moves `frontend/`→`apps/frontend/`, `backend/`→`apps/backend/`, `api/`→`apps/edge/` via `git mv` (history preserved), directory moves done **last**.
- Auto-rewrites **13 config edits** (package.json workspaces+scripts, vercel.json, fly.toml, capacitor.config.json) and **6 cross-boundary code refs** (backend/apply_schema.cjs `../database`→`../../database`, the `scripts/gen-*` generators, `scripts/seed_e2e_users.cjs`).
- **Residual detector** prints any remaining cross-boundary references for manual review (e.g. `api/index.ts`'s `../backend/dist/app.js`, which stays valid as a sibling under `apps/`).
- Idempotent guard + a printed post-apply verification checklist.
> **Must be run in a Node + full-CI environment** (this session has no Node). Gate:
> `npm install && npm run build && npm test && npm --prefix apps/backend test && npm --prefix apps/backend run test:security && npx playwright test && npx cap sync`.
> Any failure ⇒ `git restore --staged --worktree .` reverts the whole migration.

---

## 7. Governance Rules (MUST follow â€” add to PR checklist)

1. **One feature â†’ one folder** across every layer (frontend, backend, db, api-docs, tests).
2. **No cross-feature imports** except via `platform/shared` or a published interface (`*.types.ts`).
3. **Every new API endpoint requires:**
   - a route under `/api/v1/...`
   - zod validation middleware
   - an `api-docs/<feature>/<action>.api.json` entry
   - a `quality/api/<feature>/<action>.test.json` entry
   - an integration test in `backend/tests/`
4. **Money rules are server-authoritative.** All balance mutations run in a Prisma `$transaction`.
5. **Ownership check before every read/write** on user-scoped resources.
6. **No `any` in new code.** Use zod-inferred types or explicit interfaces.
7. **Offline-first:** writes hit Dexie first â†’ mark `syncPending` â†’ background retry.
8. **Secrets never in code.** Use env + `config/credentials.ts` resolver.
9. **Unused files â†’ `archive-unused/` with `reason.md`.** Never `rm`.
10. **Security-sensitive changes** (auth, tokens, raw SQL, validation) require review per `SECURITY.md`.
11. **Naming:** `<feature>.<action>.<type>` for backend (`auth.login.controller.ts`), kebab-case for frontend folders.
12. **Tests required before merge.** CI must be green.

---

## 8. What This Achieves

âœ” **Clean** â€” clear ownership per feature.
âœ” **Secure** â€” security controls indexed and discoverable (`platform/security/README.md` â†’ `backend/src/security/`).
âœ” **Scalable** â€” adding a feature = copy the template, no central file to edit.
âœ” **Easy to understand** â€” stakeholder map in Â§1 + [Feature Map](docs/architecture/FEATURE_MAP.md).
âœ” **Easy to test** â€” every API has a docs file AND a test file in the same shape; unified hub at `quality/`.
âœ” **Audit-friendly** â€” `SECURITY_AUDIT_REPORT.md` + `backend/src/security/README.md` + `api-docs/` give auditors a single read path.
âœ” **Safe** â€” nothing ever deleted; `archive-unused/` is the only sink.

---

## 9. Quick Links

- Feature traceability map: [`docs/architecture/FEATURE_MAP.md`](docs/architecture/FEATURE_MAP.md)
- Backend feature index: [`backend/src/features/README.md`](backend/src/features/README.md)
- Platform hub: [`platform/README.md`](platform/README.md) Â· Security: [`platform/security/README.md`](platform/security/README.md)
- Quality (testing) hub: [`quality/README.md`](quality/README.md)
- API contracts index: [`api-docs/api-index.json`](api-docs/api-index.json) Â· [`api-docs/README.md`](api-docs/README.md)
- API catalog (generated): [`api-testing/API_CATALOG.md`](api-testing/API_CATALOG.md)
- Master docs: [`docs/MASTER_DOCUMENTATION.md`](docs/MASTER_DOCUMENTATION.md)
- Production readiness: [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md)
- Security policy: [`SECURITY.md`](SECURITY.md)

---

## 10. Clutter Consolidation (âœ… applied 2026-06-19)

Reduced top-level folder sprawl **without touching load-bearing code**:

| Action | Before (root) | After | Risk |
|---|---|---|---|
| Fold testing index hub | `testing/` | `quality/` | none (was an index I authored) |
| Group security index | `security/` | `platform/security/` | none |
| Group shared index | `shared/` | `platform/shared/` | none |
| Move contributor guidelines | `guidelines/` | `docs/guidelines/` | none (only doc refs) |
| New platform hub | â€” | `platform/` (+ README indexing database/supabase/config) | none |

**Net:** removed `testing/`, `security/`, `shared/`, `guidelines/` from root; added `quality/` + `platform/`. Stakeholders now see fewer, clearer top-level buckets.

---

## 11. Decision Matrix â€” Why the literal `apps/ + features-colocated` rewrite was NOT executed

A stakeholder proposal asked to move `frontend/`â†’`apps/frontend`, `backend/`â†’`apps/backend`, co-locate `features/<x>/{frontend,backend,database,api,tests}`, delete root `api/`, and merge `database`+`supabase`. Each was evaluated against the **actual deploy/build configs**:

| Proposed move | Verdict | Hard evidence |
|---|---|---|
| `frontend/`â†’`apps/frontend/` | âŒ blocked | `package.json` `workspaces:["frontend","backend"]`; `vercel.json` `outputDirectory:"frontend/dist"`; `capacitor.config.json` `webDir:"frontend/dist"` |
| `backend/`â†’`apps/backend/` | âŒ blocked | `fly.toml` `dockerfile='backend/Dockerfile'`; `db:*` scripts hardcode `backend/prisma/...` |
| Delete root `api/` | âŒ blocked | `vercel.json` routes `/api/v1/stocks`â†’`api/stocks.ts` + `functions` entry â€” **live serverless function** |
| Merge `database`+`supabase` | âŒ blocked | `supabase/` is the **Supabase CLI root**; `database/*.sql` read by `backend/apply_schema.cjs` |
| Move `api-testing/`, `database/docs/` | âŒ futile | **auto-generated** by `scripts/gen-catalogs.mjs` at fixed root paths |
| Co-locate one SPA + one Express app into per-feature physical trees | âŒ scope | Single Vite entry + single Prisma `rootDir`; this is an Nx/Turborepo migration, not a refactor |
| Consolidate index folders, add `platform/`+`quality/`, feature map | âœ… done | Â§10 above |

> The **conceptual** model the proposal wants (apps / features / platform / quality / docs) is delivered as the **logical view** in [`FEATURE_MAP.md`](docs/architecture/FEATURE_MAP.md) + the `platform/` and `quality/` hubs â€” without the breakage.

### Migration mapping (old â†’ target) for a future, CI-verified `apps/` move

If the literal physical move is later required, do it in a Node + full-CI environment (not achievable in this session â€” no Node installed). Mapping and the configs each step must update:

| Old | New | Configs that MUST be updated in the same PR |
|---|---|---|
| `frontend/` | `apps/frontend/` | `package.json` workspaces, all `--workspace`/`--prefix frontend` scripts, `vercel.json` (buildCommand, outputDirectory), `capacitor.config.json` webDir, `tsconfig*.json` paths |
| `backend/` | `apps/backend/` | `package.json` workspaces + `db:*` + `qa:*` scripts, `fly.toml` dockerfile, `backend/Dockerfile` COPY paths, `backend/tsconfig.json` rootDir, `jest.config.ts`, Prisma schema path in `db:generate` |
| `api/` | `apps/edge/` (Vercel functions) | `vercel.json` `routes` dests + `functions` keys |
| `database/`, `supabase/`, `config/` | `platform/*` | `backend/apply_schema.cjs` path, `scripts/gen-catalogs.mjs` output paths, Supabase CLI `supabase/config.toml` location (CLI may require root) |
| `tests/` | `quality/e2e/` | `playwright.config.ts` testDir/outputDir/3 reporters, ~40 doc links |

**Required verification gate (any of these red â‡’ revert with `git restore --staged --worktree .`):**
```
npm run build           # backend + frontend
npm test                # frontend vitest
npm --prefix backend test
npm --prefix backend run test:security
npx playwright test
npx cap sync            # mobile
```

- Codemods: `scripts/generate-api-docs.{cjs,ps1}`, `scripts/rename-modules-to-features.ps1`

