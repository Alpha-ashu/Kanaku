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

Each has a `datasource` template variable — pick your Prometheus datasource on import.
