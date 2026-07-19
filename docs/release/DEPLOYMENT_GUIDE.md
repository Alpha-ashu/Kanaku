# Kanaku — Deployment Guide (Beta)

Detailed migration/runbook material: [docs/runbooks/render-migration.md](../runbooks/render-migration.md),
[docs/DATABASE_MIGRATIONS.md](../DATABASE_MIGRATIONS.md). This is the verified summary.

## Topology

| Tier | Provider | Config | Notes |
|---|---|---|---|
| Frontend | Vercel (`sin1`) | [vercel.json](../../vercel.json) | SPA + immutable asset caching; proxies `/api/*`, `/health`, `/socket.io` to Render; `/api/v1/stocks` runs as a Vercel function |
| Backend API + workers | Render (Singapore, Docker) | [render.yaml](../../render.yaml) | combined API+worker mode (`RUN_WORKERS_IN_API` unset); health check `/health`; auto-deploy on push to `main` |
| Alt backend | Fly.io | [fly.toml](../../fly.toml) | kept as a portable fallback |
| Database/Auth/Storage | Supabase | `DATABASE_URL` (pgbouncer :6543) + `DIRECT_URL` (:5432) | migrations use DIRECT_URL |
| Email | SendGrid | env secrets | outbox pattern with retries |
| Observability | Grafana Cloud | `METRICS_TOKEN`, `LOKI_*`, `RENDER_DRAIN_TOKEN` | Prometheus scrape of `/metrics` + Render log drain → Loki |
| Android | GitHub Actions | `build-android-aab.yml` | Capacitor AAB, optional signing secrets |

## CI/CD (GitHub Actions, verified)

1. **ci.yml** — path-filtered: backend (Postgres 16 service container → prisma db push →
   type-check → lint → jest unit subset) and frontend (type-check → lint → vitest → build).
2. **codeql.yml** — static security analysis.
3. **backend-feature-matrix.yml** — full feature matrix against a service DB on main pushes.
4. **build-android-aab.yml** — release AAB on frontend/android changes.
5. Deploys: Render builds from main (blueprint), Vercel builds frontend on push.

## Environment variables

Canonical templates: `backend/.env.example`, `backend/.env.test.example`, `frontend/.env.example`.
Production secrets live only in the Render/Vercel dashboards (`sync: false` blueprint entries).
`config/env.ts` validates at boot and fails fast on missing values.
**Never commit real `.env*` files** — enforced by `.gitignore` (hardened during this audit
after finding a tracked `.env.test`; see SECURITY_AUDIT F-1 — rotate that credential).

## Database migrations

- Author with `npm run db:migrate` (dev) against DIRECT_URL.
- Production: `prisma migrate deploy` during release (documented flow in DATABASE_MIGRATIONS.md);
  baseline + 5 incremental migrations currently.
- Rollback: every migration has a documented down-path in DATABASE_MIGRATIONS.md; DB-level
  point-in-time recovery via Supabase (below) is the catastrophic-case fallback.

## Backup & recovery

- Supabase automated daily backups + PITR (provider-side).
- `quality/database/backup-validation.cjs` verifies backup restorability.
- `quality/database/disaster_recovery.cjs` rehearses corrupt→restore→reconcile and asserts
  100 % ledger consistency afterwards.
- PII export path: `backend/backups/` (gitignored) via the documented user-PII backup script.

## Release procedure

See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Summary: green CI → staging deploy →
`scale_benchmark` + `qa:api-report` against staging → prisma migrate deploy → promote →
post-deploy `/health`, `/api/v1/health/deep`, Grafana dashboard verification.
