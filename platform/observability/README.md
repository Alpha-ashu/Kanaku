# KANAKU Observability (Phase 3)

Structured logging (Pino) + Prometheus metrics. Grafana/Loki centralization is **Phase 4** — these are the standardized formats it will consume.

## Logs
- **Engine:** Pino. Every line is JSON: `{ timestamp, level, service, requestId?, action?, message, ...meta }`.
- **service:** `api` | `worker` (auto-detected from the entrypoint).
- **requestId:** auto-injected from the request context → one id across frontend → API → worker → audit.
- **Redaction:** passwords, PINs, OTPs, JWTs, refresh/access tokens, private keys, financial secrets (`utils/redact.ts`).
- **Destinations:** stdout (captured by `fly logs`) + rotating gzip file (`logs/app.log`), daily/100 MB rotation, 3-day retention, 100 MB total cap.

## Metrics
Prometheus exposition at `GET /metrics` on **port 9091** (the Fly `[[metrics]]` port) on both the API and worker machines; `service` label distinguishes them. Plus default Node/process metrics.

| Metric | Type | Labels |
|---|---|---|
| `kanaku_http_requests_total` | counter | method, route, status_class |
| `kanaku_http_request_duration_seconds` | histogram | method, route |
| `kanaku_outbox_drains_total` | counter | — |
| `kanaku_outbox_drain_duration_seconds` | histogram | — |
| `kanaku_outbox_queue_depth` | gauge | — |
| `kanaku_notification_deliveries_total` | counter | channel (email/push), status (sent/failed) |
| `kanaku_notification_outcomes_total` | counter | outcome (sent/failed/retrying) |
| `kanaku_worker_job_failures_total` | counter | job |

## Dashboards
`dashboards/*.json` are Grafana dashboards (import via Dashboards → Import in Phase 4):
- `api-dashboard.json` — request volume, error rate, latency p50/p95/p99, uptime.
- `worker-dashboard.json` — drain rate, failures, queue depth, drain latency, uptime.
- `notification-dashboard.json` — deliveries by channel/status, success rate, outcomes, pending.
- `audit-dashboard.json` — audit volume/actions/actors/failures + search by actor/requestId (queries the immutable `AuditLog` via Postgres).

Each Prometheus dashboard has a `datasource` template variable — pick your datasource on import.

---

# Phase 4 — Centralized observability (config-as-code)

Stack = **Loki** (log store) + **Grafana** (dashboards/alerts) + **Vector log-shipper**
(the Fly-native Promtail). Metrics come from **Fly's managed Prometheus**, which
already scrapes `/metrics:9091` on both machines.

```
app + worker (stdout Pino JSON) → Fly log stream → Vector → Loki ┐
                                                                 ├→ Grafana ← dashboards + alerts
Fly Prometheus (scrapes /metrics:9091) ───────────────────────── ┘
AuditLog table (Postgres, read-only) ──────────────────────────── ┘ (Audit dashboard)
```

## Files
- `loki/loki-config.yaml` — single-binary Loki, 14-day retention, compactor (bounded storage).
- `log-shipper/vector.toml` — Fly NATS log stream → Loki; **low-cardinality labels only** (`app`,`service`,`level`).
- `grafana/provisioning/` — datasources (Loki, Fly Prometheus, AuditDB), dashboard provider, **alert rules**.
- `docker-compose.observability.yml` — runs the stack (local: `loki`+`grafana`; Fly: + `log-shipper`).

## Deploy options (host decided later)
- **Self-hosted on Fly (Machine 3):** new `kanaku-observability` app from the compose; add a volume for `loki-data`; deploy `fly-log-shipper` with `ORG`/`ACCESS_TOKEN`/`LOKI_URL`.
- **Grafana Cloud:** run only the `log-shipper` with `LOKI_URL`→Cloud + `LOKI_USER`/`LOKI_PASSWORD`; import the dashboards into hosted Grafana.

## Log search (LogQL) — request IDs / users / entities are CONTENT, not labels
```logql
{app="kanaku"} | json | requestId="req-7f3a9c21"      # by Request ID (end-to-end)
{app="kanaku"} | json | userId="u_123"                  # by User
{app="kanaku", service="worker"} | json | resource=~"Account:.*"   # by Entity
{app="kanaku", level="error"} | json                    # all errors
{app="kanaku"} |= "[AUDIT]" | json | action="auth.login"          # audit events
```
Labels stay low-cardinality (`app`,`service`,`level`); high-cardinality fields are filtered from the JSON body — so Loki streams never explode.

## Alerts (`grafana/provisioning/alerting/alert-rules.yaml`)
| Alert | Fires when |
|---|---|
| Worker stopped | no outbox drains in 5m |
| Outbox backlog growing | queue depth > 100 for 10m |
| Notification failures | failed deliveries > 0.1/s for 10m |
| High API error rate | 5xx share > 5% for 5m |
| Health check / target down | `up{app="kanaku"}` < 1 for 3m |

Wire a contact point (Slack/email/PagerDuty) + notification policy at deploy time — the destination is environment-specific.

> Note: financial-mutation audits live in the `AuditLog` table (interceptor, DB-only); the Audit dashboard reads them via the read-only `AuditDB` datasource. Event audits (`audit()`) also appear in Loki as `[AUDIT]` lines.
