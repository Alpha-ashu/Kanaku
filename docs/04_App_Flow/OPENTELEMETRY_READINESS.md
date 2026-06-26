# OpenTelemetry Readiness — Distributed Tracing Integration Plan

**Status:** prepared, not implemented. No OpenTelemetry dependency is installed
and no production behavior changes. This document records exactly where tracing
plugs into the current architecture so adopting it later is an additive change.

## Why this is "prep, not implementation"

Kanaku already has three of the four observability pillars:

| Pillar | Today |
|---|---|
| **Logs** | Pino structured JSON → Vector → Loki ([`config/logger.ts`](../../backend/src/config/logger.ts)) |
| **Metrics** | prom-client → self-hosted Prometheus ([`config/metrics.ts`](../../backend/src/config/metrics.ts)) |
| **Correlation** | `requestId` via AsyncLocalStorage, propagated client→API→worker→audit ([`middleware/requestContext.ts`](../../backend/src/middleware/requestContext.ts)) |
| **Traces** | ⏳ *this document* |

The correlation pillar is the important part: the request-context plumbing and
the per-line `requestId` injection are already the hard parts of tracing. Adding
OpenTelemetry is mostly "turn on the SDK and let it ride the existing context."

## The single integration point

[`backend/src/config/tracing.ts`](../../backend/src/config/tracing.ts) is the one
intentional slot. It exports `initTracing()`, called first in both entrypoints
([`server.ts`](../../backend/src/server.ts), [`worker.ts`](../../backend/src/worker.ts)).
Today it is a guarded no-op (off unless `OTEL_TRACES_ENABLED=true`, and even then
it only warns because the SDK isn't installed). The entrypoint wiring already
exists, so adoption needs **no entrypoint edits**.

## Adoption steps (when we decide to do it)

1. **Add dependencies** (the only new packages):
   - `@opentelemetry/sdk-node`
   - `@opentelemetry/auto-instrumentations-node`
   - `@opentelemetry/exporter-trace-otlp-http`
   - `@prisma/instrumentation`

2. **Implement `initTracing()`** in `config/tracing.ts`:
   - **Resource / service identity** — reuse [`config/serviceRole.ts`](../../backend/src/config/serviceRole.ts) `serviceName()` for `service.name` (`api` | `worker`), namespace `kanaku`. This is the same value already stamped on every log line and metric, so traces, logs and metrics share one service dimension.
   - **Exporter** — `OTLPTraceExporter` pointed at `OTEL_EXPORTER_OTLP_ENDPOINT`. Planned backend: a **Grafana Tempo** service added to the Machine 3 observability app, so logs + metrics + traces all land in one Grafana (trace↔log correlation via the shared `requestId`/`trace_id`).
   - **Instrumentations** — `getNodeAutoInstrumentations()` (HTTP, Express, `pg`) + `PrismaInstrumentation()`.

3. **Start before instrumented libs load.** Auto-instrumentation must wrap
   `http`/`express`/`pg`/Prisma before they are imported, so launch with a
   `--require`/`--import` preload rather than relying on import order:
   - API: `node --require dist/config/tracing.js dist/server.js`
   - Worker: `node --require dist/config/tracing.js dist/worker.js`
   - (Wire via `fly.toml` `[processes]` or the Dockerfile `CMD`.) `initTracing()`
     remains the explicit hook for manual spans and clean SDK shutdown.

4. **Correlate traces with logs.** In [`config/logger.ts`](../../backend/src/config/logger.ts)
   `buildFields()`, next to the existing `requestId` injection, add the active
   span's `trace_id` / `span_id` (`trace.getActiveSpan()?.spanContext()`). One
   block; every existing log line then carries trace identity automatically.

## Integration-point map

| # | Capability | Where it hooks in | Code change |
|---|---|---|---|
| 1 | SDK bootstrap | `config/tracing.ts` `initTracing()` | implement (slot exists) |
| 2 | Service identity (`service.name`) | `config/serviceRole.ts` `serviceName()` | reuse, no change |
| 3 | HTTP/Express spans | `app.ts` request pipeline | auto (preload), no change |
| 4 | DB spans | Prisma `$extends` in [`db/prisma.ts`](../../backend/src/db/prisma.ts) | `PrismaInstrumentation`, no change |
| 5 | Context propagation | `middleware/requestContext.ts` (ALS) | runs alongside OTel context; optionally derive `requestId` from `traceId` |
| 6 | Incoming trace continuation | global middleware (reads `traceparent`) | auto via HTTP instrumentation |
| 7 | Worker job spans | outbox drain in [`workers/index.ts`](../../backend/src/workers/index.ts) | wrap each tick in a manual span (the metrics timing sites mark the spot) |
| 8 | Trace↔log correlation | `config/logger.ts` `buildFields()` | add `trace_id`/`span_id` |
| 9 | Export destination | new Grafana **Tempo** on `platform/observability/` | infra add, no app change |
| 10 | Config validation | `OTEL_*` vars in [`config/env.ts`](../../backend/src/config/env.ts) manifest | add lines when adopted |

## Guarantees

- **No behavior change now.** `initTracing()` returns `false` unless
  `OTEL_TRACES_ENABLED=true`; the SDK is absent, so nothing instruments.
- **Minimal future diff.** The entrypoint slots, service identity, request
  context, and log-field plumbing already exist — adoption is dependencies +
  one module body + a preload flag + a Tempo service.
- **No new attack surface or DB access.** Tracing exports over OTLP to the
  observability machine only; it never connects Grafana to the production DB
  (same boundary the logs/metrics pillars already respect).
