# Proposal — Repository Restructure & Developer Experience (FOR REVIEW)

Status: **awaiting approval — no files have been moved.** 2026-07-19.

Facts this proposal is based on (verified):
- npm workspaces already exist for `frontend` + `backend`; `platform/` is **not** a workspace,
  `platform/shared` is **empty** (no TS files), and nothing imports from `platform/*`.
- `/api` contains 5 Vercel serverless files but `vercel.json` only routes **`stocks.ts`**;
  `auth.ts`, `users.ts`, `health.ts`, `index.ts` are unrouted legacy (health/auth are served
  by the Render backend).
- `backend/generated/` (Prisma client, ~15 MB) is tracked in git despite `generated/` in
  `.gitignore` (force-added at some point).
- 8 loose pre-Prisma SQL files sit in `backend/` root; `supabase/migrations/` holds 20
  client-side/RLS migrations; `backend/prisma/migrations/` is the backend source of truth.
- Root `.env` mixes backend secrets AND frontend `VITE_*` vars; `.env.vercel` duplicates
  dashboard config.
- Root clutter: `scratch/` (20 throwaway scripts + logs), `test-results/` (old Playwright
  artifacts), `rbac-export/` (xlsx), 2 xlsx reports, 4 large architecture .md files,
  `dist/`, `logs/`.

## Two options

### Option A — Conservative cleanup (RECOMMENDED for beta timing)
Keep the `frontend/` `backend/` top-level names (zero churn for Vercel/Render/CI/Capacitor
path references) and fix everything else:

```
kanaku/
├── frontend/                  # unchanged name — Vite React app (@kanaku/frontend)
├── backend/                   # unchanged name — Express API (@kanaku/backend, renamed from KANAKU-backend)
│   └── prisma/                # schema + migrations (source of truth, unchanged)
├── api/                       # Vercel edge fns — SLIMMED to stocks.ts + README (delete 4 legacy files)
├── packages/
│   └── shared/                # NEW @kanaku/shared workspace (seeded from duplicated FE/BE types:
│                              #   transaction/statement/voice action types, zod schemas, currency utils)
├── db/
│   ├── supabase/              # moved from /supabase (client-side migrations + edge functions + README
│   │                          #   explaining the Prisma-vs-Supabase migration split)
│   └── legacy-sql/            # archived backend/*.sql + backend/*.cjs schema helpers (read-only)
├── quality/                   # unchanged; absorbs /test-results and /rbac-export artifacts
├── docs/                      # absorbs root .md files:
│   │                          #   KANAKU_PROJECT_OVERVIEW.md → docs/architecture/OVERVIEW.md
│   │                          #   kanaku_architecture_workflow.md + implementation_plan.md → merged into existing docs/06
│   │                          #   ENGINEERING_DECISIONS.md → docs/architecture/
├── infra/                     # Dockerfile(s), docker-compose.yml, fly.toml, render.yaml
│                              #   (vercel.json + capacitor.config.json stay at root — their tools require it)
├── scripts/                   # keeps gen-docs/dev tooling; /scratch deleted (2 useful scripts moved here)
├── .env.example               # NEW root template documenting the whole env story (see §Env)
├── package.json               # workspaces: ["frontend","backend","packages/*"] + turbo scripts
├── turbo.json                 # NEW task runner (see §CLI)
└── README.md                  # rewritten: structure map, package interactions, from-scratch setup
```

Also in Option A:
- `git rm -r --cached backend/generated` (rebuilt by `postinstall` — repo sheds ~15 MB).
- Delete `dist/`, `logs/` from tracking; delete `test-results/` after archiving into quality/reports.

### Option B — Full apps/packages monorepo
Same as A, plus rename `frontend→apps/web`, `backend→apps/api`, `api→apps/edge`.
Cleaner naming, but touches: `vercel.json` (buildCommand/outputDirectory/functions),
`render.yaml` (dockerfilePath/context), both Dockerfiles, `ci.yml` path filters ×4 jobs,
`fly.toml`, `capacitor.config.json` webDir, `playwright.config`, `jest.config` roots,
~40 npm scripts, and every doc that references the paths. Estimated 2–3 focused days with
staging redeploys to verify. **Recommendation: defer to post-beta; do A now.**

## Env standardization (§Env)

| File | Contents | Committed? |
|---|---|---|
| `.env.example` (root, NEW) | index: points at the two real templates, documents the split | ✅ |
| `backend/.env` | all backend secrets (DB, JWT, SendGrid, AI keys) | ❌ (template: `backend/.env.example`) |
| `backend/.env.test` | dedicated test DB | ❌ (template exists) |
| `frontend/.env` | `VITE_*` only | ❌ (template: `frontend/.env.example`) |
| root `.env` | **retired** — its backend vars move to `backend/.env`, VITE vars to `frontend/.env`; `scripts/dev-full.mjs` loads both | file deleted |
| `.env.vercel` | **retired** — Vercel dashboard is the source of truth | file deleted |

## One-command development (§CLI)

Add **Turborepo** (fits: npm workspaces already exist, gives task graph + caching; no pnpm/Nx
migration churn):

```jsonc
// root package.json (excerpt)
"scripts": {
  "setup":  "npm ci && npm run db:generate",
  "dev":    "turbo run dev --parallel",        // web + api together (backend waits on db:generate)
  "dev:all": "npm run dev & npx supabase start", // optional local supabase
  "build":  "turbo run build",                  // backend → frontend, cached
  "test":   "turbo run test",                   // vitest + jest + (quality) in one gate
  "test:e2e": "playwright test",
  "lint":   "turbo run lint",
  "type-check": "turbo run type-check"
}
```

`turbo.json` pipelines: `build` (backend `tsc` → frontend `vite build`, outputs cached),
`test` depends on `db:generate`, `dev` marked persistent/no-cache. Existing granular
scripts (`qa:*`, `db:*`, `cap:*`) remain untouched.

## /api vs /backend boundary (§3 of the request)

Documented rule (goes in root README):
> **`backend/` is the application API** (all `/api/v1/*` business logic, served by Render).
> **`/api` holds Vercel edge functions only** — currently just the stock-quote proxy that
> must live at the edge for latency/CDN reasons. Nothing else may be added there without
> an ADR. `vercel.json` proxies every other `/api/*` path straight to Render.

The 4 unrouted legacy files in `/api` are deleted (Option A) — their functionality already
lives in `backend/`.

## Execution plan (once approved)

1. PR 1 (mechanical, no behavior change): delete legacy `/api` files, `scratch/`,
   `test-results/`, `.env.vercel`; untrack `backend/generated`, `dist/`, `logs/`;
   archive SQL to `db/legacy-sql/`; move root docs into `docs/`.
2. PR 2: `packages/shared` workspace + first extracted module (shared transaction/statement
   types now duplicated in FE `types/` and BE controllers) wired via TS project references.
3. PR 3: turbo + root scripts + rewritten README + `.env` split.
4. Each PR gated on: `npm run build && npm run test` + one staging deploy (Vercel preview +
   Render) to prove path references survived.
