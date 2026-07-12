# Kanaku Observability — Render + Grafana Cloud

This directory contains the complete observability stack for Kanaku running on **Render**.

> **Migration note**: The previous Fly.io-based self-hosted observability stack (Grafana + Loki + Prometheus on a Fly Machine 3) has been deprecated and replaced with **Grafana Cloud** (free tier). The `Dockerfile` and `fly.observability.toml` files are kept for historical reference only.

---

## Architecture

```
Kanaku API (Render)
├── GET /metrics          ← guarded by METRICS_TOKEN bearer auth
└── POST /internal/logs/drain  ← Render HTTP log drain → Loki

Grafana Agent (runs anywhere — laptop / VPS / scheduled job)
└── scrapes /metrics every 30s → remote-writes to Grafana Cloud Prometheus

Render log drain
└── POSTs stdout/stderr to /internal/logs/drain → Grafana Cloud Loki

Grafana Cloud (hosted, free tier)
├── Prometheus (metrics, 10k series, 14-day retention)
├── Loki (logs, 50 GB/month)
└── Grafana UI (dashboards, alerts, email notifications)
```

---

## Directory contents

| File / Directory | Purpose |
|-----------------|---------|
| `grafana-agent.yaml` | Grafana Agent config — scrapes `/metrics` + remote-writes to Grafana Cloud |
| `grafana/provisioning/datasources/` | Datasource config (Grafana Cloud Prometheus + Loki endpoints) |
| `grafana/provisioning/alerting/` | Alert rules, contact points, notification policy |
| `dashboards/` | Grafana dashboard JSON (import into Grafana Cloud UI) |
| `render-log-drain-setup.md` | **START HERE** — step-by-step setup guide |
| `loki/` | Loki config (local dev only) |
| `log-shipper/` | Vector config (Fly-era, deprecated) |
| `Dockerfile` | **DEPRECATED** — Fly self-hosted observability machine |
| `fly.observability.toml` | **DEPRECATED** — Fly deployment config |

---

## Quick start

1. **Read `render-log-drain-setup.md`** — it covers everything end-to-end.
2. Create a [Grafana Cloud free account](https://grafana.com/auth/sign-up).
3. Set secrets on Render: `METRICS_TOKEN`, `RENDER_DRAIN_TOKEN`, `LOKI_PUSH_URL`, `LOKI_USERNAME`, `LOKI_API_KEY`.
4. Add the HTTP log drain in Render dashboard → Service → Logs → Log Drains.
5. Run Grafana Agent with `grafana-agent.yaml` (any machine with internet access).
6. Import the 4 dashboard JSONs from `dashboards/` into Grafana Cloud.
7. **Delete the `kanaku-observability` Fly app** to stop the stale alert emails.

---

## Dashboards

| Dashboard | What it shows |
|-----------|--------------|
| `api-dashboard.json` | Request volume, error rate, latency, error-by-code, DB latency, cold starts |
| `worker-dashboard.json` | Outbox drain rate, queue depth, drain latency, job failures |
| `notification-dashboard.json` | Delivery by channel, success rate, outcomes, queue depth |
| `audit-dashboard.json` | Financial audit trail, failure events, top actors, all errors |

Import via Grafana Cloud UI: **Dashboards → New → Import → Upload JSON**.

---

## Alert rules

7 rules, all in `grafana/provisioning/alerting/alert-rules.yaml`:

| Rule | Severity | Fires when |
|------|----------|-----------|
| `Health check / target down` | critical | `/metrics` not scraped for 5m |
| `High API error rate` | critical | 5xx > 5% for 5m |
| `Error spike` | warning | > 20 errors/min for 5m |
| `Worker stopped` | critical | No outbox drains for 5m |
| `Outbox backlog growing` | warning | Queue depth > 100 for 10m |
| `Notification delivery failures` | warning | Failures > 0.1/s for 10m |
| `Slow database queries` | warning | DB p95 > 2s for 5m |

Each alert includes a `description` annotation with exact diagnostic steps.

---

## Adding a new alert rule — checklist

1. Copy an existing rule block in `alert-rules.yaml`.
2. Set a unique `uid` + `title`.
3. **Set `noDataState` and `execErrState`**:
   - `OK` for app-metric rules (quiet when app is idle)
   - `Alerting` only for absence-of-scrape rules
4. Set `severity` label (`critical` or `warning`).
5. Write a clear `description` annotation with root-cause steps.
6. Apply in Grafana Cloud: **Alerting → Alert rules → New alert rule** (or paste the YAML in the provisioning API).

---

## Planned maintenance / silencing

Before a planned restart or scale-down:

**Grafana Cloud → Alerting → Silences → New silence**
- Matcher: `alertname = Health check / target down`
- Duration: however long the maintenance window is

---

## Local development

Run Loki + Grafana locally (no Prometheus — use the hosted one):

```bash
docker compose -f platform/observability/docker-compose.observability.yml up loki grafana
```

Then open http://localhost:3001 (Grafana, admin/admin).
Point Grafana Agent at http://localhost:9090 for local Prometheus.
