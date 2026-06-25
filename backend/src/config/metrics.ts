/**
 * Prometheus metrics (Phase 3 — observability).
 *
 * A single registry, scraped at `GET /metrics` (port 9091, the Fly `[[metrics]]`
 * port) on BOTH the API and worker machines. `service` label distinguishes them.
 * Default Node/process metrics (cpu, memory, event-loop lag, uptime via
 * `process_start_time_seconds`) are included for the health dashboards.
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

export const metricsContentType = registry.contentType;
export const renderMetrics = (): Promise<string> => registry.metrics();
