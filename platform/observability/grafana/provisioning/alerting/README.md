# Alerting — operator runbook

Grafana provisioned alerting for KANAKU (runs on the `kanaku-observability` Fly app).
Three files, one job each:

| File | Job |
|------|-----|
| `alert-rules.yaml` | The alert rules (what fires and when). |
| `notification-policy.yaml` | Routing, grouping + how often alerts repeat. |
| `contactpoints.yaml` | Where alerts go (webhook + email). |
| `templates.yaml` | What the email says (`kanaku.email.body`). |

## The 5 rules

| Rule | Severity | Fires when | On no data |
|------|----------|-----------|-----------|
| `kanaku-worker-stopped` | critical | app is `up` **and** outbox not drained in 5m | **OK** (silent) |
| `kanaku-outbox-backlog` | warning | queue depth > 100 for 10m | **OK** (silent) |
| `kanaku-notification-failures` | warning | failed deliveries > 0.1/s for 10m | **OK** (silent) |
| `kanaku-api-error-rate` | critical | 5xx > 5% for 5m | **OK** (silent) |
| `kanaku-target-down` | critical | a kanaku process isn't scraped (`up==0`) or no targets exist | **Alerting** |

Only `target-down` alerts on missing data — because missing data there *means* the
app is down. The rest stay quiet when there's nothing to measure, so a scaled-down
app produces exactly **one** meaningful alert, not five.

## Alert states (why we care)

- **OK** – condition healthy.
- **Alerting** – condition breached → notifies.
- **NoData / Error** – Grafana couldn't evaluate. Left at Grafana's default these
  fire generic `DatasourceNoData` / `DatasourceError` alerts. **We never leave them
  default** — see the convention block at the top of `alert-rules.yaml`.

## Routing & cadence (`notification-policy.yaml`)

- Everything in the **KANAKU folder groups into ONE notification** (`group_by:
  grafana_folder`), so an incident that trips several rules sends a single email
  listing all of them instead of one email per rule.
- **critical** → first notification after 30s; **warning** after 60s.
- A still-firing alert is re-sent every **24h**, not every few hours.
- Resolved notifications are on, so you get an "all clear" too.
- The email receiver uses `singleEmail: true`, so multiple instances of the same
  alert arrive in one mail rather than one mail each.

Together these mean a normal incident costs **one email**, and an alert nobody
has fixed yet costs **one reminder a day**. If you ever need per-rule threads
back, set `group_by: ['grafana_folder', 'alertname']` (Grafana's default).

Do **not** lower `repeat_interval` below a few hours unless you have a pager
rotation — frequent repeats train you to filter the folder, which is how a real
alert gets missed.

## Email contents (`templates.yaml`)

`kanaku.email.body` renders, for every firing alert: name, severity, service,
the rule's `summary`, how long it has been firing, the **evaluated value** (the
`A=0 B=0 C=1` line), the rule's `description` (its diagnostic steps), plus a
one-click **Silence** link and a link to the rule in Grafana. Resolved alerts get
a one-line entry with fired/cleared timestamps.

If you add an alert rule, write a good `summary` and `description` — that is what
lands in the email. Nothing else needs changing.

## Channels (`contactpoints.yaml`)

Every alert goes to BOTH, so one channel outage can't silence you:
- `ops-webhook` (Slack/Discord) — primary. Set `SLACK_WEBHOOK_URL`.
  (Discord: append `/slack` to the webhook URL.)
- `ops-email` (Brevo SMTP) — secondary. Set `ALERT_EMAIL`.

## Intentional downtime (scaling the app to 0)

`target-down` will correctly fire when the app is off. Before a planned scale-down,
silence it so you don't get paged:

Grafana → **Alerting → Silences → New silence**, matcher `alertname = Health check / target down`,
set a duration. Remove the silence (or let it expire) when the app is back.

## Diagnostics (when target-down fires)

```bash
fly status -a kanaku            # is the app running?
fly machines list -a kanaku
fly proxy 9091:9091 -a kanaku   # then: curl http://localhost:9091/metrics
fly proxy 9090:9090 -a kanaku-observability   # http://localhost:9090/targets
```

## Applying changes

These are provisioning files — Grafana loads them on start. After editing:

```bash
fly deploy -c platform/observability/fly.observability.toml
```

## Adding a new rule — checklist

1. Copy an existing rule block in `alert-rules.yaml`.
2. Set a unique `uid` + `title`.
3. **Set `noDataState` and `execErrState`** (OK for app metrics; Alerting only for
   up/target checks) — this is mandatory, see the file header.
4. Set `severity` label (`critical` or `warning`) so it routes correctly.
5. `fly deploy -c platform/observability/fly.observability.toml` and confirm under Alerting → Alert rules.
