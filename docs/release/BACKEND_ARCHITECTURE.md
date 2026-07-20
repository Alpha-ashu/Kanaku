# Kanaku — Backend Architecture (Beta Audit Snapshot, 2026-07-19)

Verified against `backend/src` during the beta audit. Canonical deep-dive: [architecture/OVERVIEW.md](../architecture/OVERVIEW.md).

## Layout

```
backend/src
├── app.ts                 # Express wiring: security headers, sanitizer, rate limits, health, metrics
├── server.ts              # HTTP + Socket.IO bootstrap; ledger subscriptions; optional in-process workers
├── worker.ts              # Standalone worker entry (outbox, recurring, cleanup)
├── routes/index.ts        # /api/v1 mount table (37 modules), ENABLED_MODULES mount gating
├── features/<module>/     # routes → controller → service → repository + <module>.validation.ts (zod)
├── middleware/            # auth, rbac, featureGate, pinGate, validate, cache, rateLimit, timeout,
│                          # requestContext (ALS), performanceTracker, metrics, adminPlatformGate
├── cache/                 # redis.ts (get/set/delete-by-prefix + hit metrics), cache-policy.ts (TTLs)
├── workers/               # index.ts (notification outbox), recurring.worker.ts, cleanup.worker.ts, health.ts
├── security/              # crypto (field encryption), idleSession
├── db/prisma.ts           # client + audit interceptor ($allOperations attributes mutations to actor)
├── config/                # logger (winston), metrics (prom-client), cors allowlist, env validation
├── sockets/               # Socket.IO server + auth handshake
└── emails/                # SendGrid templates
```

## Feature modules (37, all mounted in routes/index.ts)

aa*, accounts, admin, advisors, ai, auth, avatars, bills, bookings, budgets, categorization,
collaboration, dashboard, devices, friends, goals, gold, groups, import, investments, loans,
notifications, otp, payments, pin, receipts, recurring, reports, sessions, settings, snapshots†,
stocks, sync, system, todos, transactions, voice, webhooks, events†

\* mount-gated behind `ENABLED_MODULES=aa` &nbsp; † internal services (no routes)

## Cross-cutting conventions (verified on every route file)

| Concern | Mechanism | Coverage |
|---|---|---|
| Authentication | `router.use(authMiddleware)` | all modules except `avatars` (public assets) and `webhooks` (HMAC-verified) |
| Financial PIN gate | `pinGate` | accounts, transactions, loans, goals, budgets, gold, investments, recurring, reports, dashboard, sync |
| RBAC | `requireRole` | admin module (router-wide), advisor endpoints, manager approvals; deny events audited |
| Admin origin isolation | `adminPlatformGate` | admin module + advisor admin endpoints (no-op until `ADMIN_UI_HOSTS` set) |
| Input validation | zod via `validateBody/Params/Query` | mutation routes across modules; global HTML/script sanitizer in `app.ts` as backstop |
| Idempotency | `idempotency({scope})` middleware + `@@unique([userId, sourceModule, idempotencyKey])` | transaction/loan/goal/group mutations |
| Response caching | `responseCache` (user-scoped key) | GET list/item on accounts, transactions, goals, loans |
| Rate limiting | global 60 rpm prod + per-scope (auth login/register/otp/refresh, bills, receipts, sync) | app-level |
| Audit | `utils/auditLogger` + Prisma audit interceptor + `authz.denied` events | financial mutations, auth events, RBAC denials |

## Financial engine

- **Live write path (all modules):** `transaction.service` — atomic `$transaction`, per-account
  balance deltas via row-locking `update({ balance: { increment } })`, no-overdraw invariant,
  Decimal arithmetic, dedup hash, idempotency keys.
- **Ledger V2 (double-entry):** `FinancialLedgerService.postJournalEntry` + `FinancialInvariantValidator`
  + event dispatcher/outbox + `FinancialEvent` store + snapshot service (daily balance,
  monthly category/cashflow) + reconciliation (`GET /admin/ledger/reconcile`) + integrity audit
  (`GET /system/integrity`, admin-only as of this audit).
  **Wiring status:** publishers exist only in the groups module and only when `LEDGER_V2_ENABLED=true`;
  subscribers for goals/loans/investments exist but have no publishers yet. See
  [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §1.

## Background jobs

| Job | Schedule | Function |
|---|---|---|
| Notification outbox drainer | `NOTIFICATION_OUTBOX_CRON` (validated; refuses to start on bad cron) | batch delivery app/email/push, retry w/ backoff, terminal `failed` state |
| Recurring transactions | recurring.worker | executes due `RecurringTransaction` rules, `@@unique([ruleId, scheduledDate])` prevents double-fire |
| Cleanup | cleanup.worker | expired tokens/OTPs/sessions |
| Worker health | `workers/health.ts` | surfaced in `/system/integrity` |

## Error handling

Central `middleware/error.ts` (structured envelope, no stack leak), request timeout guard,
circuit breakers around external calls (`utils/circuitBreaker`), graceful degradation when
Redis/Supabase are absent.
