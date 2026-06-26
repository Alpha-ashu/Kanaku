/**
 * Distributed tracing bootstrap — OpenTelemetry-READY (not yet implemented).
 *
 * Kanaku already has three of the four observability pillars: structured logs
 * (Pino → Loki), metrics (prom-client → Prometheus), and request-ID correlation
 * (AsyncLocalStorage). The remaining pillar is distributed tracing. This module
 * is the single, intentional integration point for it.
 *
 * RIGHT NOW this is a deliberate NO-OP: it adds no dependency and changes no
 * production behavior. `initTracing()` is called first in server.ts and
 * worker.ts purely so the wiring slot already exists — adopting OpenTelemetry
 * later is then an additive change here plus a process flag, with no edits to
 * the entrypoints.
 *
 * The full integration plan (what plugs in where, and why) is documented in
 * docs/04_App_Flow/OPENTELEMETRY_READINESS.md. The summary:
 *
 *   1. Add deps: @opentelemetry/sdk-node, /auto-instrumentations-node,
 *      /exporter-trace-otlp-http, @prisma/instrumentation.
 *   2. Build a NodeSDK here with:
 *        - Resource: { 'service.name': serviceName(), 'service.namespace':'kanaku' }
 *          (serviceName() from ./serviceRole already distinguishes api/worker).
 *        - OTLPTraceExporter → OTEL_EXPORTER_OTLP_ENDPOINT (a future Grafana
 *          Tempo on the Machine 3 observability app, completing logs+metrics+
 *          traces in one Grafana).
 *        - getNodeAutoInstrumentations() (http, express, pg) + PrismaInstrumentation.
 *   3. For auto-instrumentation to wrap http/express/prisma, the SDK must start
 *      BEFORE those libs load — production should launch with
 *      `node --require dist/config/tracing.js dist/server.js`. `initTracing()`
 *      stays as the explicit hook for manual spans / SDK lifecycle.
 *   4. Correlate traces with the existing logs: inject `trace_id`/`span_id` into
 *      every Pino line in config/logger.ts `buildFields()` (one block, next to
 *      the existing requestId injection) using `trace.getActiveSpan()`.
 *
 * Gate it on OTEL_TRACES_ENABLED so tracing can be rolled out per-environment.
 */

/**
 * Initialize distributed tracing. No-op until OpenTelemetry is adopted.
 *
 * Returns `false` when tracing is not active (the current state) so callers can
 * branch without assuming a tracer exists.
 */
export function initTracing(): boolean {
  // Off by default — flipping this without installing the SDK is a config error,
  // so surface it loudly rather than silently pretending traces are flowing.
  if (process.env.OTEL_TRACES_ENABLED !== 'true') return false;

  // eslint-disable-next-line no-console
  console.warn(
    '[tracing] OTEL_TRACES_ENABLED=true but the OpenTelemetry SDK is not installed. ' +
      'Tracing is a deliberate future step — see docs/04_App_Flow/OPENTELEMETRY_READINESS.md. ' +
      'Continuing without tracing.',
  );
  return false;
}
