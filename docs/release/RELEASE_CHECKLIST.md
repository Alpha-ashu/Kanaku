# Kanaku — Beta Release Checklist

## 0. Outstanding from the 2026-07-19 audit (do first)
- [ ] **Rotate the Supabase DB password** exposed by the previously-tracked `backend/.env.test`
      (SECURITY_AUDIT F-1). Update Render/Vercel/local envs afterwards.
- [ ] Decide `LEDGER_V2_ENABLED` for beta (KNOWN_LIMITATIONS §1) and set it explicitly in Render env.
- [ ] Commit/deploy the audit fixes (factory reset upsert, reconcile engine, integrity RBAC).

## 1. Code gates (all verified green on 2026-07-19)
- [x] Backend `tsc --noEmit` clean
- [x] Frontend `tsc --noEmit` clean
- [x] Frontend production build succeeds
- [x] Frontend unit tests 151/151
- [x] Backend integration suites green (per-suite; see TEST_RESULTS.md)
- [x] Security suites green; CodeQL enabled
- [x] No missing-endpoint findings in the API contract audit
- [ ] E2E happy-path run against staging build (`npm run test:e2e`)
- [ ] `qa:api-report` against staging

## 2. Production environment (Render dashboard)
- [ ] `NODE_ENV=production`, `JWT_SECRET` (32+ chars), `SUPABASE_JWT_SECRET`
- [ ] `DATABASE_URL` / `DIRECT_URL` (post-rotation values; prefer verified TLS)
- [ ] `FRONTEND_URL` + CORS origins correct
- [ ] `METRICS_TOKEN` set (mandatory — /metrics must not be open)
- [ ] `RENDER_DRAIN_TOKEN`, `LOKI_*` set; Grafana dashboards receiving data
- [ ] SendGrid keys + from-address verified
- [ ] `ENABLED_MODULES` unset (AA stays dark) unless Phase 5 is go
- [ ] `ADMIN_UI_HOSTS` set so adminPlatformGate enforces origin isolation
- [ ] Rate-limit envs left at defaults unless load says otherwise

## 3. Database
- [ ] `prisma migrate deploy` executed against production (DIRECT_URL)
- [ ] `ensure-db-integrity` script run
- [ ] Supabase backups + PITR confirmed enabled; latest backup restorable
      (`quality/database/backup-validation.cjs`)

## 4. Deploy & verify
- [ ] Render deploy green; `/health` 200; cold-start ping job active
- [ ] Vercel deploy green; SPA loads; `/api` proxy reaches Render
- [ ] `/api/v1/health/deep` with ops token: DB connected, breakers closed, crypto configured
- [ ] Admin login → `/system/integrity` healthy → `/admin/ledger/reconcile` CLEAN
- [ ] `scale_benchmark.cjs` against staging within SLAs
- [ ] Socket.IO connect + a cross-device sync smoke test
- [ ] Android AAB build (if shipping mobile beta) installs and syncs

## 5. Post-launch (first 48 h)
- [ ] Grafana error-rate and P95 panels reviewed twice daily
- [ ] Notification outbox depth ~0; no dead-letters
- [ ] Daily `/system/integrity` + reconcile CLEAN
- [ ] Beta feedback channel wired to the todo/issue tracker

Sign-off: engineering ▢ security ▢ ops ▢
