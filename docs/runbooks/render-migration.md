# Fly.io → Render (free tier) migration runbook

**Why:** Fly now hard-blocks deploys without payment info (403 on release).
Render's free tier needs **no card**: Docker deploys from GitHub, auto-TLS,
health checks, 1-click rollback. The stack stays open-source and portable —
same image, same Supabase, same contracts. Swap hosts again anytime.

**Free-tier trade-offs (accepted for now):**
- One combined instance (API + background jobs in-process — the app's default
  mode when `RUN_WORKERS_IN_API` is unset).
- Sleeps after 15 min idle → ~50s cold start. Mitigated by the uptime ping
  (step 4), which keeps it awake ~24/7 and doubles as monitoring.
- 512 MB RAM / shared CPU. Fine pre-launch; upgrade is a plan toggle ($7).

## Cutover steps (no downtime)

1. **Create the service** — render.com → sign in with GitHub (no card) →
   New → **Blueprint** → select the Kanaku repo. It reads `render.yaml`.
2. **Set secrets** — the dashboard prompts for every `sync: false` var; copy
   values from `backend/.env`. Add any extra prod vars the env validator
   requires (it fails fast and names what's missing — check deploy logs).
3. **Verify** — wait for the first deploy, then:
   `curl https://kanaku-api.onrender.com/health` → expect 200.
   Exercise login + a transaction against the Render URL before flipping.
4. **Uptime ping / keep-alive** — UptimeRobot.com (free, no card): HTTP
   monitor on `https://kanaku-api.onrender.com/health`, 5-min interval,
   email alert on failure. This is now the primary "is prod up" alarm.
5. **Flip traffic** — in Vercel, change the `/api/*` proxy/rewrite target from
   the Fly hostname to `https://kanaku-api.onrender.com`. Same-origin cookie
   flow (refresh token) is preserved because the browser still talks only to
   Vercel. Native (Capacitor) needs no change if it uses the Vercel domain.
6. **Watch 24–48 h** — Fly machines may keep serving until Fly suspends the
   org; that's the free rollback window (flip the Vercel target back).
7. **Retire Fly** — delete `.github/workflows/deploy-fly.yml` (Render builds
   on push by itself; the workflow would just fail red against Fly's 403).
   Remove the Fly apps from the dashboard when convenient.

## Observability replacement

The `kanaku-observability` Fly app (Grafana/Loki/Prometheus) dies with Fly.
Free, card-less replacements:
- **UptimeRobot** (step 4): uptime + alerting. Do this one now.
- **Grafana Cloud Free** (later, optional): generous free metrics/logs tier;
  point the app's existing `/metrics` + log shipping at it when wanted. The
  alert rules + conventions live in
  `platform/observability/grafana/provisioning/alerting/` and port over.

## Student credits (the upgrade path before revenue)

- **GitHub Student Developer Pack** (education.github.com/pack) — free with a
  student email; unlocks credits across many hosts.
- **Azure for Students** — $100/yr credit, **no card required**, renewable
  while enrolled. The natural next host when the free tier pinches
  (Container Apps or a B1s VM) — same Docker image.

## Scale path (host changes, architecture never does)

| Stage | Host | Cost |
|---|---|---|
| Now (pre-launch) | Render free | $0 |
| Cold starts hurt / first users | Render Starter or Azure student credit | $7 / $0 |
| Real revenue | Hetzner VPS + Coolify (the self-hosted OSS setup) | ~€5 |
| Scale demands it | Managed Kubernetes | usage-based |

Same container, same Supabase, same env contract at every stage.
