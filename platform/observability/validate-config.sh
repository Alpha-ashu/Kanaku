#!/bin/sh
# ──────────────────────────────────────────────────────────────────────────────
# Machine 3 (observability) startup configuration validation.
#
# The observability stack runs no Node process, so its fail-fast gate is this
# container pre-flight (the counterpart to the backend's config/env.ts
# validateConfig()). It is invoked by entrypoint.sh BEFORE supervisord launches
# Loki/Grafana/Prometheus/Vector. If a REQUIRED value is missing it prints a
# clear report and exits non-zero, so the machine refuses to boot rather than
# coming up half-configured (e.g. Vector unable to authenticate, or Grafana on
# the default admin/admin password).
#
# Two tiers, mirroring the backend:
#   REQUIRED     — the stack cannot function; missing ⇒ refuse to start.
#   RECOMMENDED  — a capability degrades (e.g. one alert channel); missing ⇒ warn.
# ──────────────────────────────────────────────────────────────────────────────
set -eu

missing_required=""
missing_recommended=""

# present KEY — true when the env var is set and non-empty.
present() {
  eval "v=\${$1:-}"
  [ -n "$v" ]
}

require() {     # require KEY "purpose"
  if ! present "$1"; then missing_required="$missing_required\n      - $1 — $2"; fi
}
recommend() {   # recommend KEY "purpose"
  if ! present "$1"; then missing_recommended="$missing_recommended\n      - $1 — $2"; fi
}

# ── REQUIRED ──────────────────────────────────────────────────────────────────
require ORG          "Fly org slug — Vector NATS auth (log ingestion)"
require ACCESS_TOKEN "Fly read-only token — Vector NATS auth (log ingestion)"
require LOKI_URL     "Loki push/query endpoint — Vector sink + Grafana datasource"
require GF_SECURITY_ADMIN_PASSWORD "Grafana admin password — must not run on default admin/admin"

# ── RECOMMENDED ───────────────────────────────────────────────────────────────
recommend ALERT_EMAIL       "Email contact point (Brevo) for alert delivery"
recommend SLACK_WEBHOOK_URL "Webhook contact point (Slack/Discord) for alert delivery"

# Alerting must be able to reach SOMEONE: at least one channel is required.
if ! present ALERT_EMAIL && ! present SLACK_WEBHOOK_URL; then
  missing_required="$missing_required\n      - ALERT_EMAIL or SLACK_WEBHOOK_URL — at least one alert channel must be configured"
fi

NODE_ENV_LABEL="${FLY_APP_NAME:-observability}"

if [ -n "$missing_required" ]; then
  printf '[config] %s · FAILED\n  ✗ MISSING REQUIRED:%b\n' "$NODE_ENV_LABEL" "$missing_required" >&2
  [ -n "$missing_recommended" ] && printf '  ⚠ missing (capability degraded):%b\n' "$missing_recommended" >&2
  printf '[config] Refusing to start the observability stack with partial configuration.\n' >&2
  exit 1
fi

if [ -n "$missing_recommended" ]; then
  printf '[config] %s · OK (with warnings)\n  ⚠ missing (capability degraded):%b\n' "$NODE_ENV_LABEL" "$missing_recommended"
else
  printf '[config] %s · OK — all required and recommended configuration present\n' "$NODE_ENV_LABEL"
fi
