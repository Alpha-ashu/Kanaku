/**
 * Prometheus metrics — scraped at `GET /metrics` on the main public port (3000)
 * guarded by a `METRICS_TOKEN` bearer secret. Grafana Agent polls this endpoint
 * and remote-writes to Grafana Cloud Prometheus.
 *
 * `service` label ("api" | "worker") distinguishes process types.
 * Default Node/process metrics (cpu, memory, event-loop lag, uptime via
 * `process_start_time_seconds`) are included automatically.
 *
 * On Render the API and worker run in ONE combined process (server.ts), so all
 * metrics originate from the same process and share the same registry.
 */
import client from 'prom-client';
import { serviceName } from './serviceRole';

export const registry = new client.Registry();
registry.setDefaultLabels({ service: serviceName() });
client.collectDefaultMetrics({ register: registry });

// ── API metrics ───────────────────────────────────────────────────────────────
export const httpRequestsTotal = new client.Counter({
  name: 'kanaku_http_requests_total',
  help: 'HTTP requests by method, route and status class',
  labelNames: ['method', 'route', 'status_class'] as const,
  registers: [registry],
});

export const httpRequestDuration = new client.Histogram({
  name: 'kanaku_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

// ── Outbox / notification (worker) metrics ────────────────────────────────────
export const outboxDrainsTotal = new client.Counter({
  name: 'kanaku_outbox_drains_total',
  help: 'Outbox drain ticks completed',
  registers: [registry],
});

export const outboxDrainDuration = new client.Histogram({
  name: 'kanaku_outbox_drain_duration_seconds',
  help: 'Duration of an outbox drain tick in seconds',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const outboxQueueDepth = new client.Gauge({
  name: 'kanaku_outbox_queue_depth',
  help: 'Notifications currently pending or retrying in the outbox',
  registers: [registry],
});

export const notificationDeliveriesTotal = new client.Counter({
  name: 'kanaku_notification_deliveries_total',
  help: 'Notification delivery attempts by channel (email|push) and result (sent|failed)',
  labelNames: ['channel', 'status'] as const,
  registers: [registry],
});

export const notificationOutcomesTotal = new client.Counter({
  name: 'kanaku_notification_outcomes_total',
  help: 'Per-notification terminal/retry outcomes (sent|failed|retrying)',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const workerJobFailuresTotal = new client.Counter({
  name: 'kanaku_worker_job_failures_total',
  help: 'Background job failures by job name',
  labelNames: ['job'] as const,
  registers: [registry],
});

// ── Error telemetry ──────────────────────────────────────────────────────────
/** Incremented in errorHandler for every 4xx/5xx — enables error-rate alerts. */
export const errorsTotal = new client.Counter({
  name: 'kanaku_errors_total',
  help: 'HTTP errors by status class and error code',
  labelNames: ['status_class', 'code', 'service'] as const,
  registers: [registry],
});

// ── Database telemetry ────────────────────────────────────────────────────────
/** Histogram of Prisma query latency. Opt-in: call `observeDbQuery(ms)` from
 *  a Prisma middleware or individual repo call sites. */
export const dbQueryDuration = new client.Histogram({
  name: 'kanaku_db_query_duration_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const observeDbQuery = (operation: string, durationMs: number): void => {
  dbQueryDuration.observe({ operation }, durationMs / 1000);
};

// ── Process lifecycle ─────────────────────────────────────────────────────────
/** Unix timestamp of process start. Lets Grafana compute uptime and detect
 *  cold starts: a rising edge on this metric = the container restarted. */
export const coldStartTimestamp = new client.Gauge({
  name: 'kanaku_cold_start_timestamp_seconds',
  help: 'Unix timestamp (seconds) when this process started — a rising edge signals a cold start / restart',
  registers: [registry],
});
// Set once at module load — before any server binds.
coldStartTimestamp.set(Date.now() / 1000);

export const metricsContentType = registry.contentType;
export const renderMetrics = (): Promise<string> => registry.metrics();
