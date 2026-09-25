# Kanaku — agent operating rules

Read this before touching anything. These are release-control requirements, not
preferences.

---

## 1. RELEASE CONTROL — do not commit, push, merge or deploy without explicit approval

**Never commit, push, merge or deploy uncommitted changes unless the repository
owner has explicitly approved that specific action.**

This is not caution for its own sake. `render.yaml` sets `autoDeploy: true` on
the `kanaku-api` service, so **a push to `main` deploys to production**, and
`preDeployCommand: npm run db:deploy` **runs migrations against the production
database** as part of that deploy.

On 2026-09-24 an agent committed an entire uncommitted working tree as
`cd2301db "version 20.5"` and pushed it. That deployed unreviewed changes to
production and ran a migration there. It has happened more than once.

Consequences to keep in mind:

- A clean `git status` does **not** mean your work was reviewed. Check
  `git log -1 --stat` and `git rev-list --left-right --count origin/main...HEAD`
  before assuming anything about the tree state.
- Work left uncommitted is **staged for production** the moment someone commits
  it. Treat an uncommitted change as a change that could ship without warning.
- If you believe something must ship, say so and wait. Do not push.

## 2. Deploy-order dependencies

Some changes are unsafe to deploy before a matching environment change. Check
before committing anything that touches these:

| Change | Must be configured FIRST |
|---|---|
| `/metrics` fail-closed guard (`app.ts`) | `METRICS_TOKEN` on Render **and** on the Prometheus scraper — otherwise `/metrics` returns 503 and monitoring goes dark |
| `AA_ENCRYPTION_ROOT_KEY` required in prod (`config/env.ts`) | The variable on Render — otherwise the API **refuses to boot** (`validateConfig()` throws at import time) |

## 3. `backend/.env` points at PRODUCTION

`DATABASE_URL` and `DIRECT_URL` in `backend/.env` are the **production**
Supabase database with real user data. The local dev backend, every
`npm run seed:*` script and every ad-hoc Prisma/psql script reads and writes
production unless you override the URL.

- Read-only first. Dry-run, then `--apply`, and ask before applying.
- Never run the test suite against it. `quality/backend/tests/setup.ts` now
  refuses any database whose name is not `test|ci|scratch|staging|shadow` (or a
  loopback host), with `ALLOW_NON_TEST_DATABASE=true` as a deliberate override.
- Use a scratch cluster instead: PostgreSQL 18 on `127.0.0.1:55433`, user
  `postgres`, password `scratch`. `createdb kanaku_ci` then
  `npx prisma migrate deploy` with `DATABASE_URL`/`DIRECT_URL` pointed at it.

## 4. Migrations

Additive only. No destructive migrations, no dropped columns, no data rewrites
without explicit approval. Production carries triggers and constraints that no
migration created — audit `pg_trigger` and `pg_constraint` when a write fails
for no visible reason.

Verify before committing a schema change:

```bash
# fresh DB applies cleanly
DATABASE_URL=$CI_URL DIRECT_URL=$CI_URL npx prisma migrate deploy
# schema and migrations agree
node ../node_modules/prisma/build/index.js migrate diff \
  --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma --exit-code
```

## 5. The gate

Every change runs all of these before it is proposed for commit:

```bash
npm run type-check                                   # 3/3 workspaces
npm run lint                                         # 0 errors
cd backend && npx jest --runInBand ../quality/backend/unit
cd frontend && npx vitest run
cd backend && npx jest --runInBand ../quality/backend/tests/integration   # needs a scratch DB
```

Lint ceilings are **at their limit** (`--max-warnings 1171` frontend, 652
backend). Any new warning fails CI — fix yours rather than raising the ceiling.

## 6. House rules

- Brand is **KANAKU**. Never "MyKanaku", never "Kanku".
- Account balances are **derived**, not accumulated:
  `openingBalance + transactions + goalContributions + loanPayments`. Before
  syncing any table the balance engine reads, check you are not double-counting
  a movement the server already records as its own `Transaction`.
- Every create path must be duplicate-proof. State which layers you checked:
  `useSubmitLock`, `coalesceCreate`, `duplicateSubmitGuard`, idempotency key,
  `dedupHash`.
- Never log passwords, OTP values, tokens or keys. `{ error }` is the correct
  call-site form — `logger.ts` serialises it centrally.
