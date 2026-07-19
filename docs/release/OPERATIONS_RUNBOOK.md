# Kanaku — Operations Runbook (Beta)

## Health & monitoring surfaces

| Surface | Auth | Use |
|---|---|---|
| `GET /health` | public | liveness (Render health check + uptime ping) |
| `GET /api/v1/health/deep` | JWT | DB probe, circuit breakers, crypto config — for ops tokens/monitors |
| `GET /api/v1/health/metrics` | admin | per-route counters + P50/P95/P99, cache hit rates |
| `GET /metrics` | `METRICS_TOKEN` bearer | Prometheus for Grafana Cloud |
| `GET /api/v1/system/integrity` | admin | ledger balance/duplicate/orphan audit + queue/worker/DB/memory |
| `GET /api/v1/admin/ledger/reconcile` | admin | full reconciliation report (drift per account, budget drift auto-repair) |
| Grafana Cloud | — | dashboards over Prometheus metrics + Loki logs (Render drain) |

Logs are structured JSON (winston) with `requestId` / `correlationId` / `sessionId` on every
line; a user action can be traced HTTP → ledger → worker → notification by correlation ID.

## Routine checks (daily/weekly)

1. Grafana: error-rate and P95 panels; notification outbox depth; worker heartbeat.
2. `GET /system/integrity` — expect `isHealthy: true`; investigate any imbalanced/orphan counts.
3. `GET /admin/ledger/reconcile` — expect `status: CLEAN`.
4. Supabase dashboard: connection pool saturation, storage growth, backup success.

## Incident playbooks

**API down / cold start loop (Render free tier sleeps):** confirm uptime ping is running
(5-min external ping); check Render deploy logs; `/health` 200 = warm.

**Database connectivity:** `/api/v1/health/deep` shows `database.status`. If
`EMAXCONNSESSION`/pool exhaustion: identify leaking clients (each process = 1 Prisma client),
restart the service, and check pgbouncer pool size vs instance count.

**Notification backlog:** `system/integrity → notificationsQueue.pending/failed`.
Failed rows are dead-lettered at MAX_ATTEMPTS with reasons in `deliveryStatus`; requeue by
resetting `status` after fixing the channel (e.g. SendGrid key).

**Ledger drift detected:** run `/admin/ledger/reconcile` (budget drift auto-repairs;
account drift is report-only). Cross-check with `quality/database/ledger-integrity-check.cjs`.
Never hand-edit balances; post a correcting journal entry.

**Factory-reset stuck/failed:** events `FACTORY_RESET_STARTED/COMPLETED/FAILED` are in the
FinancialEvent store (they survive rollbacks); idempotency cache ignores concurrent repeats.

**Suspected security event:** `AuditLog` table (all financial mutations with actor/IP/UA,
`authz.denied` events, auth failures); correlate by requestId with Loki.

**Secret rotation:** rotate in Render/Vercel dashboards; `JWT_SECRET` rotation invalidates
sessions (users re-login); DB password rotation = update `DATABASE_URL`+`DIRECT_URL` and
redeploy. ⚠ Outstanding from audit: rotate the staging DB password exposed in git history
(SECURITY_AUDIT F-1).

## Worker operations

Combined mode (current prod): workers run inside the API process. Split mode: set
`RUN_WORKERS_IN_API=false` and run `npm run start:worker` as a second service.
Outbox cron is validated at boot — an invalid `NOTIFICATION_OUTBOX_CRON` logs an error and
refuses to start (visible in `system/integrity → worker`).

## Capacity levers

`API_RATE_LIMIT`, `SYNC_RATE_LIMIT`, `BILL_UPLOAD_RATE_LIMIT`, `RECEIPT_SCAN_RATE_LIMIT`,
`REQUEST_TIMEOUT_MS`, `UPLOAD_MAX_BYTES`, DB `connection_limit` (per instance), Render plan
size. Multi-instance caveats: KNOWN_LIMITATIONS.md §4.
