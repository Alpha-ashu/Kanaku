# Kanaku — Production Readiness Checklist

> Generated: 2026-06-17  
> Status key: ✅ Done · ⚠️ Partial · ❌ Blocking · 📋 Recommended

---

## 1. Security

| # | Item | Status | Notes |
|---|------|--------|-------|
| S1 | bcrypt rounds ≥ 12 | ✅ | Fixed — auth.service.ts (3 locations) |
| S2 | CSPRNG for OTP | ✅ | Fixed — `crypto.randomInt` replaces `Math.random()` |
| S3 | Admin routes RBAC | ✅ | Fixed — `repair-all-members` + `role-mode` now guarded |
| S4 | Webhook HMAC verification | ❌ | Payment webhook accepts any payload without signature check |
| S5 | `deleteList` ownership clause | ❌ | Any authenticated user can delete any todo list by ID |
| S6 | OTP hash uses HMAC (not bare SHA-256) | ⚠️ | Should use `HMAC-SHA256(secret, code)` |
| S7 | Challenge code not in response body | ⚠️ | Frontend reads it from response; requires coordinated OTP delivery change |
| S8 | PIN security endpoint proof | ⚠️ | `POST /pin/verify-security` issues token without PIN/OTP proof |
| S9 | Rate limiting on auth endpoints | 📋 | Redis-backed rate limit recommended for `/auth/login`, `/auth/challenge` |
| S10 | HTTPS enforced in production | 📋 | Ensure all traffic termination at load balancer; `Strict-Transport-Security` header |
| S11 | JWT expiry + refresh rotation | 📋 | Verify access token TTL ≤ 15 min; refresh tokens single-use |

---

## 2. Data Integrity

| # | Item | Status | Notes |
|---|------|--------|-------|
| D1 | Prisma schema matches Dexie for investments | ❌ | ~14 fields in Dexie missing from Prisma — lost on sync |
| D2 | Prisma schema matches Dexie for loans | ❌ | ~12 fields missing from Prisma |
| D3 | RecurringTransaction type/frequency in Prisma | ⚠️ | 4 fields missing; feature works offline only |
| D4 | Soft delete on all user-facing models | ⚠️ | Verify `deletedAt` exists on Transactions, Budgets, Goals, RecurringTransactions |
| D5 | DB backup strategy | 📋 | Postgres: daily automated snapshots with 30-day retention |
| D6 | Migration tested on copy of prod data | 📋 | Run `prisma migrate deploy` against a prod data snapshot before go-live |

---

## 3. Offline-First Sync

| # | Item | Status | Notes |
|---|------|--------|-------|
| O1 | Transactions — offline write + sync | ✅ | Dexie-first, background backend sync |
| O2 | RecurringTransactions — offline CRUD | ✅ | Fixed — fully offline-first with `syncStatus` badge |
| O3 | Budgets — offline CRUD | ✅ | Fixed — offline-first with backend background sync |
| O4 | Calendar reminders — persisted | ✅ | Fixed — stored in `db.settings['calendar_reminders']` |
| O5 | AI Insights — real data from Dexie | ✅ | Fixed — no more hardcoded amounts |
| O6 | Conflict resolution strategy | ⚠️ | No merge logic when same record modified on two devices; last-write-wins |
| O7 | Sync failure retry with backoff | 📋 | Background sync errors are swallowed silently; add retry queue |
| O8 | Pending sync indicator | ⚠️ | `syncStatus: 'pending'` badge shown on RecurringTransactions; not on others |

---

## 4. Email / Notifications

| # | Item | Status | Notes |
|---|------|--------|-------|
| E1 | SendGrid sender verified | ❌ | `candidatex002@gmail.com` sender still unverified — ALL transactional email blocked |
| E2 | Email worker running in prod | 📋 | `backend/src/workers/email.worker.ts` must be started as a separate process |
| E3 | Push notification keys configured | 📋 | Verify VAPID keys in `.env.production` |

---

## 5. Performance

| # | Item | Status | Notes |
|---|------|--------|-------|
| P1 | Database indexes on foreign keys | ⚠️ | Audit Prisma schema for missing `@@index` on `userId`, `accountId`, `categoryId` |
| P2 | N+1 query protection | ⚠️ | Review Prisma `include` chains; use `select` to limit projection |
| P3 | Redis caching layer | 📋 | Recommended for session store and rate limiting; not yet implemented |
| P4 | gRPC transport | 📋 | Architectural recommendation for internal service calls; weeks of work |
| P5 | Bundle size / code splitting | 📋 | Run `next build --analyze`; lazy-load heavy chart libraries |

---

## 6. Infrastructure

| # | Item | Status | Notes |
|---|------|--------|-------|
| I1 | Environment variables documented | ⚠️ | Ensure `.env.example` is complete and up to date |
| I2 | Docker compose for local dev | ✅ | Assumed present from project structure |
| I3 | CI/CD pipeline | 📋 | TypeScript compile + Prisma validate in CI; Playwright tests in staging |
| I4 | Health check endpoints | 📋 | `GET /health` should return `{ status: 'ok', db: 'ok', redis: 'ok' }` |
| I5 | Zero-downtime deploys | 📋 | Use rolling deploys or blue-green; migrations run before new instances start |

---

## 7. Monitoring & Observability

| # | Item | Status | Notes |
|---|------|--------|-------|
| M1 | Error tracking (Sentry) | 📋 | Add `@sentry/nextjs` + `@sentry/node`; capture unhandled rejections |
| M2 | Structured logging | 📋 | Replace `console.log` with pino/winston; include `userId`, `requestId` in context |
| M3 | Uptime monitoring | 📋 | Ping health endpoint every 60 s; page on 2 consecutive failures |
| M4 | Prisma query metrics | 📋 | Enable `metrics` preview feature; alert on p99 > 500 ms |

---

## 8. Legal / Compliance

| # | Item | Status | Notes |
|---|------|--------|-------|
| L1 | Privacy Policy published | 📋 | Required before collecting any PII |
| L2 | Terms of Service published | 📋 | Required before user account creation |
| L3 | Cookie consent banner | 📋 | Required for EU users (GDPR) |
| L4 | Data retention + deletion flow | 📋 | Users must be able to delete their account and all associated data |
| L5 | RBI/SEBI compliance (India) | 📋 | Financial data apps may require registration if handling investment advice |

---

## Launch Blockers (must fix before go-live)

1. **❌ S4** — Webhook HMAC verification (payment fraud risk)
2. **❌ S5** — `deleteList` ownership clause (any user can delete any list)
3. **❌ E1** — SendGrid sender verification (all email is broken)
4. **❌ D1/D2** — Investment + Loan Prisma schema gaps (data silently lost)

## High-Priority (fix within first sprint post-launch)

- S6 OTP HMAC · S7 challenge code in response · S8 PIN endpoint proof
- O6 conflict resolution · O7 sync retry
- D3 RecurringTransaction schema gaps
- M1 error tracking · M2 structured logging
