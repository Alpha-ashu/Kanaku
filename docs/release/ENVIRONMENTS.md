# Kanaku — Environments & Branch Flow

Three long-lived branches, each tied to one environment. Every change reaches
production by being promoted through them, so it is tested in the same shape
before users see it.

| Branch | Environment | Purpose | Web (Vercel) | Backend + DB |
|---|---|---|---|---|
| `dev` | **Development** | Integrate finished features; developers check them together | Preview, branch URL `kanaku-git-dev-<team>.vercel.app` | **Non-prod** (see [Setup](#one-time-setup)) |
| `staging` | **Staging / QA** (pre-production) | QA and sign-off on exactly what will ship | Preview, branch URL `kanaku-git-staging-<team>.vercel.app` | **Non-prod** |
| `main` | **Production** | What users run | Production, `kanaku-fawn.vercel.app` | Render `kanaku-api` + production Supabase |

Short-lived branches are the only place work happens:

- `feature/<name>`, `fix/<name>`: branch from `dev`, open a PR into `dev`.
- `hotfix/<name>`: branch from `main` for production emergencies only (see below).

## Promotion flow

```
feature/* ──PR──▶ dev ──PR──▶ staging ──PR──▶ main
                  (dev check)  (QA sign-off)   (release)
```

1. **Into `dev`:** PR from a feature branch. CI must pass. Squash-merge.
2. **`dev` → `staging`:** open a PR `dev → staging` when a set of features is ready for QA.
   Merge with a merge commit (not squash) so the branches keep sharing history.
3. **`staging` → `main`:** open a PR `staging → main` after QA signs off. Merging it deploys
   production (Render backend, Vercel web) and builds the mobile apps.

Never commit directly to `staging` or `main`, and never merge `main`-only work "down" except
for hotfixes.

### Hotfixes

For a production-only emergency (e.g. a security fix):

1. Branch `hotfix/<name>` from `main`, fix, PR into `main`.
2. Immediately bring the same commit into `staging` and `dev` (merge `main` into each), so the
   next normal promotion does not revert it.

Example: `f3cb4ea4` (verify-later account-takeover fix, 2026-09-16) was applied to all three
branches at once.

## What runs where

| Workflow | `dev` | `staging` | `main` | PRs |
|---|---|---|---|---|
| `ci.yml`: lint, type-check, unit + integration tests | push | push | push | into any of the three |
| `backend-feature-matrix.yml` | push | push | push | — |
| `build-android-aab.yml`: signed AAB + APK artifacts | manual | manual | push | — |
| `build-ios.yml`: unsigned IPA artifact | manual | manual | push | any PR |
| Render deploy (backend) | — | staging service (after setup) | auto | — |
| Vercel deploy (web) | preview | preview | production | preview per PR |

"Manual" = Actions tab → workflow → **Run workflow** → pick the branch. Mobile builds read
`frontend/.env.android` / `.env.ios`, which point at the **production** API, so a build from
`dev`/`staging` still talks to production until those files get per-environment variants.

Dependabot opens its PRs against `dev`.

## ⚠ Data isolation — read before using dev/staging

Until the setup below is done, **the dev and staging websites use the production backend and
production data.** `vercel.json` sends every deployment's `/api/*` to
`https://kanaku-api.onrender.com`, and a web build without `VITE_API_URL` uses that proxy.
Anything created on a dev/staging URL (sign-ups, transactions, test emails) is real
production data.

## One-time setup

These steps need dashboard access (Vercel, Render, Supabase, GitHub). A single shared
non-production backend for both `dev` and `staging` is enough at this stage and fits the free
tiers.

### 1. Non-production database (Supabase)

- Create a **separate Supabase project**, e.g. `kanaku-nonprod`. Do not reuse
  `staging_kanakku` on the production cluster: the backend integration tests write to and wipe
  it.
- Build the schema from the repo. The migration history does not yet fully reproduce
  `schema.prisma` (see [Schema drift](#schema-drift)), so for now use:
  ```bash
  cd backend
  DATABASE_URL="<nonprod direct url>" DIRECT_URL="<nonprod direct url>" npx prisma db push
  ```
- Enable Storage with an `expense-bills` bucket.

### 2. Non-production backend (Render)

Render dashboard → **New → Web Service** → this repo:

| Setting | Value |
|---|---|
| Name | `kanaku-api-nonprod` |
| Branch | `staging` (redeploys on each promotion to staging) |
| Runtime | Docker, `./backend/Dockerfile`, context `.` |
| Pre-deploy | `npm run db:deploy` |
| Health check | `/health` |

Environment: copy the production variable list from `render.yaml`, **with new values**:

- `DATABASE_URL` / `DIRECT_URL`: the non-prod Supabase project.
- `JWT_SECRET`, `SUPABASE_JWT_SECRET`, `SECURITY_JWT_SECRET`, `METRICS_TOKEN`: fresh random values
  (`openssl rand -hex 32`), never production's. A production token must not work on
  non-prod, or vice versa.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: from the non-prod project.
- `FRONTEND_URL` / `CORS_ORIGIN`: `https://kanaku-git-staging-<team>.vercel.app,https://kanaku-git-dev-<team>.vercel.app`
- Email: a separate sender, or SMTP to a test inbox, so QA cannot email real users.

### 3. Point the dev/staging websites at it (Vercel)

Vercel → Project → **Settings → Environment Variables**, add for environment **Preview**, with
**Git branch** set to `staging`, then again for `dev`:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://kanaku-api-nonprod.onrender.com/api/v1` |
| `VITE_SOCKET_URL` | `https://kanaku-api-nonprod.onrender.com` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | the non-prod Supabase project |

Vite bakes these in at build time, so redeploy both branches afterwards (Deployments → ⋯ →
Redeploy). An absolute `VITE_API_URL` makes the app call that backend directly, bypassing the
`vercel.json` proxy. Production (`main`) keeps no `VITE_API_URL` and stays on the proxy.

Optional: **Settings → Domains** → add `staging.<your-domain>` and `dev.<your-domain>`, each
assigned to its Git branch, for stable, shareable URLs.

### 4. Protect the branches (GitHub)

Settings → **Rules → Rulesets → New branch ruleset**, targeting `main` and `staging`:

- Require a pull request before merging (1 approval once there is a second reviewer).
- Require status checks: `Backend (Node.js / Jest)`, `Frontend (Vite / Vitest)`.
- Block force pushes; restrict deletions.

For `dev`: require status checks, block force pushes.

Optional: set the **default branch** to `dev` (Settings → General), so new PRs target it by
default. Production is unaffected: Render and Vercel production are tied to `main` by name.

## Schema drift

CI's "Guard schema drift against migrations" replays `backend/prisma/migrations` into an empty
database and diffs the result against `schema.prisma`. It is **advisory**
(`continue-on-error`) until the history is reconciled; the job summary shows the current diff.

Remaining differences need owner decisions before a reconcile migration can be written,
because the migration would also run on production:

1. **Legacy `todo_lists`, `todo_items`, `todo_list_shares`**: created by migrations, absent from
   `schema.prisma`. Drop them (check production for rows first), or add them to the schema?
2. **`clientRequestId` uniqueness on Account, Goal, Investment, Loan**: migrations make it
   globally unique; the schema says unique per user (`userId, clientRequestId`). Check that
   production already has the per-user indexes before switching.
3. The rest is additive (Transaction ledger columns, CollaborationParticipant columns,
   indexes). Production very likely already has it via `db push`, so write it idempotently.

Once `prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --exit-code`
returns 0, remove `continue-on-error` from the step, and new environments can be built with
`prisma migrate deploy` instead of `db push`.
