# Render Log Drain Setup — Kanaku → Grafana Cloud Loki

This runbook explains how to connect Render's HTTP log drain to your backend so
that every log line from the Kanaku API (Pino structured JSON) is forwarded to
**Grafana Cloud Loki** and becomes searchable in Grafana.

---

## How it works

```
Render container stdout/stderr
        │
        ▼  (HTTP POST, NDJSON batch, every ~10s)
POST /internal/logs/drain   ← your Kanaku API
        │
        ▼  (fire-and-forget, Basic Auth)
Grafana Cloud Loki Push API
        │
        ▼
Grafana → Explore → Loki → {app="kanaku"}
```

The handler is implemented in `backend/src/middleware/renderDrain.ts`.
It validates a bearer token, parses Render's NDJSON body, and pushes to Loki.

---

## Step 1 — Set secrets on Render

In your Render dashboard → **kanaku-api** → **Environment**:

| Key | Value | Notes |
|-----|-------|-------|
| `METRICS_TOKEN` | (generate: `openssl rand -hex 32`) | Guards `/metrics` |
| `RENDER_DRAIN_TOKEN` | (generate: `openssl rand -hex 32`) | Guards `/internal/logs/drain` |
| `LOKI_PUSH_URL` | Your Grafana Cloud Loki push URL | e.g. `https://logs-prod-012.grafana.net` |
| `LOKI_USERNAME` | Grafana Cloud Loki user ID | Numeric, from Grafana Cloud |
| `LOKI_API_KEY` | Grafana Cloud API key | Needs `logs:write` scope |

### How to get Grafana Cloud Loki credentials

1. Sign up at [grafana.com/auth/sign-up](https://grafana.com/auth/sign-up) (free, no card)
2. After creating your stack, go to **Home → Connections → Data sources → Loki**
3. Click **Sending data** tab → copy:
   - **Host** → this is your `LOKI_PUSH_URL`
   - **User** → `LOKI_USERNAME`
4. Go to **Security → API keys** → Create key with **MetricsPublisher** role → `LOKI_API_KEY`

---

## Step 2 — Add the Log Drain in Render

1. Open [Render dashboard](https://dashboard.render.com)
2. Click **kanaku-api** → **Logs** tab
3. Click **Log Drains** → **Add Log Drain**
4. Select **HTTP**
5. Fill in:
   - **URL**: `https://kanaku-api.onrender.com/internal/logs/drain`
   - **Headers**: `Authorization: Bearer <RENDER_DRAIN_TOKEN>`
6. Click **Save**

Render will immediately start POSTing log batches to your endpoint.

---

## Step 3 — Verify logs appear in Grafana Cloud

1. Open your Grafana Cloud stack URL (e.g. `https://yourstack.grafana.net`)
2. Go to **Explore** → select **Loki** datasource
3. Query: `{app="kanaku"}` → you should see log lines
4. Filter errors: `{app="kanaku"} | json | level = \`error\``
5. Filter audit events: `{app="kanaku"} |= "[AUDIT]"`

---

## Step 4 — Configure Prometheus scraping (for metrics)

### Option A — Grafana Cloud HTTP scraper (simplest, no binary needed)

1. In Grafana Cloud: **Home → Connections → Add new connection → Hosted Prometheus metrics**
2. Click **Remote Write** tab → copy the Remote Write URL + credentials
3. Create a **Grafana Agent** config using `platform/observability/grafana-agent.yaml`
4. Run Grafana Agent anywhere (your laptop, a free Oracle Cloud ARM, GitHub Actions)

### Option B — Grafana Cloud synthetic monitoring (scrapes from Grafana's infrastructure)

1. In Grafana Cloud: **Home → Connections → Synthetic Monitoring**
2. Install the plugin → Add probe → HTTP → `https://kanaku-api.onrender.com/metrics`
3. Add header: `Authorization: Bearer <METRICS_TOKEN>`

---

## Troubleshooting

### Logs not appearing in Loki

```bash
# 1. Check the drain is reachable
curl -X POST https://kanaku-api.onrender.com/internal/logs/drain \
  -H "Authorization: Bearer <RENDER_DRAIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message":"test log","level":"info","timestamp":"2026-01-01T00:00:00Z"}'
# Expected: {"success":true,"received":true}

# 2. Check Render logs for drain errors
# Render dashboard → kanaku-api → Logs → filter: "[log-drain]"
```

### Metrics not appearing in Prometheus

```bash
# 1. Verify /metrics endpoint works
curl -H "Authorization: Bearer <METRICS_TOKEN>" \
  https://kanaku-api.onrender.com/metrics
# Expected: Prometheus text format output

# 2. Verify Grafana Agent is running and writing
# Check agent logs for "remote_write" errors
```

### Still getting DatasourceNoData alert emails

This means the old Fly.io observability machine (`kanaku-observability`) is still
running. Log into [fly.io/dashboard](https://fly.io/dashboard) and:
1. Go to **Apps** → `kanaku-observability`
2. Click **Settings** → **Delete app**

This permanently stops the Fly stack and the alert emails.

---

## Alert reference

| Alert | Fires when | Root cause steps |
|-------|-----------|-----------------|
| `Health check / target down` | `/metrics` not scraped for 5m | Check Render service status, Grafana Agent health |
| `High API error rate` | 5xx > 5% for 5m | Check Render logs, error-codes panel |
| `Error spike` | > 20 errors/min for 5m | Filter by code in API dashboard |
| `Worker stopped` | No outbox drains for 5m | Check Render logs for outbox drainer crash |
| `Outbox backlog growing` | Queue depth > 100 for 10m | SendGrid / Firebase outage |
| `Notification delivery failures` | Failures > 0.1/s for 10m | Check provider API keys |
| `Slow database queries` | DB p95 > 2s for 5m | Supabase connection pool, slow query log |
