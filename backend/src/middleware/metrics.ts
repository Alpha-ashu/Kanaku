/**
 * Lightweight request metrics — no external dependency.
 *
 * Captures per-route counters:
 *   - total requests
 *   - requests by status class (2xx / 4xx / 5xx)
 *   - latency p50 / p95 / p99 via a rolling 1024-sample reservoir
 *   - in-flight gauge
 *
 * Exposed via `getMetricsSnapshot()` — wired into
 * `GET /api/v1/health/metrics` (admin-only) so ops dashboards can
 * scrape without us pulling in `prom-client`.
 *
 * For full Prometheus support later, swap `record()` to feed a Histogram
 * + Counter from `prom-client` — the contract here is intentionally
 * Prom-shaped to make that drop-in.
 */

import type { NextFunction, Request, Response } from 'express';
import { httpRequestsTotal, httpRequestDuration } from '../config/metrics';

interface RouteMetric {
  count: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
  inFlight: number;
  /** Ring-buffer of recent latency samples (ms). */
  latencies: number[];
}

const MAX_SAMPLES = 1024;
const metrics = new Map<string, RouteMetric>();
let totalRequests = 0;
const startTime = Date.now();

const getOrCreate = (key: string): RouteMetric => {
  let m = metrics.get(key);
  if (!m) {
    m = {
      count: 0,
      status2xx: 0,
      status3xx: 0,
      status4xx: 0,
      status5xx: 0,
      inFlight: 0,
      latencies: [],
    };
    metrics.set(key, m);
  }
  return m;
};

const normalizeRoute = (req: Request): string => {
  // Prefer the matched route pattern (`/transactions/:id`) over the raw
  // URL so we do not blow up cardinality with one bucket per UUID.
  const matched = (req as any).route?.path ?? req.baseUrl ?? '';
  const base = req.baseUrl ?? '';
  if (matched) return `${req.method} ${base}${matched}`;
  return `${req.method} ${req.path.replace(/\/[0-9a-f-]{8,}/gi, '/:id')}`;
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();
  totalRequests += 1;

  // Defer the route lookup until we have a matched route (after Express
  // routing). We capture the *eventual* route on `res.finish` instead of
  // freezing it here so wildcards / 404s land in the right bucket.
  let recorded = false;
  const finalize = () => {
    const route = normalizeRoute(req);
    const m = getOrCreate(route);
    m.count += 1;
    m.inFlight = Math.max(0, m.inFlight - 1);

    const status = res.statusCode;
    if (status >= 200 && status < 300) m.status2xx += 1;
    else if (status >= 300 && status < 400) m.status3xx += 1;
    else if (status >= 400 && status < 500) m.status4xx += 1;
    else if (status >= 500) m.status5xx += 1;

    const elapsedNs = Number(process.hrtime.bigint() - startedAt);
    const elapsedMs = elapsedNs / 1_000_000;

    if (m.latencies.length >= MAX_SAMPLES) {
      // Reservoir-style overwrite — keeps a steady window of recent samples.
      m.latencies[Math.floor(Math.random() * MAX_SAMPLES)] = elapsedMs;
    } else {
      m.latencies.push(elapsedMs);
    }

    // Prometheus exposition (guard the finish+close double-fire so we count once).
    if (!recorded) {
      recorded = true;
      httpRequestsTotal.inc({ method: req.method, route, status_class: `${Math.floor(status / 100)}xx` });
      httpRequestDuration.observe({ method: req.method, route }, elapsedMs / 1000);
    }
  };

  // Bump in-flight on a best-effort key — recompute on finish.
  const tentativeKey = `${req.method} ${req.path}`;
  getOrCreate(tentativeKey).inFlight += 1;

  res.on('finish', finalize);
  res.on('close', finalize);
  next();
};

export interface MetricsSnapshot {
  uptimeSeconds: number;
  totalRequests: number;
  routes: Array<{
    route: string;
    count: number;
    inFlight: number;
    status: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
    latencyMs: { p50: number; p95: number; p99: number; max: number };
  }>;
}

export const getMetricsSnapshot = (): MetricsSnapshot => {
  const routes: MetricsSnapshot['routes'] = [];
  for (const [route, m] of metrics.entries()) {
    const sorted = [...m.latencies].sort((a, b) => a - b);
    routes.push({
      route,
      count: m.count,
      inFlight: m.inFlight,
      status: { '2xx': m.status2xx, '3xx': m.status3xx, '4xx': m.status4xx, '5xx': m.status5xx },
      latencyMs: {
        p50: Math.round(percentile(sorted, 50) * 100) / 100,
        p95: Math.round(percentile(sorted, 95) * 100) / 100,
        p99: Math.round(percentile(sorted, 99) * 100) / 100,
        max: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
      },
    });
  }

  // Sort by request count descending for quick eyeballing.
  routes.sort((a, b) => b.count - a.count);

  return {
    uptimeSeconds: Math.round((Date.now() - startTime) / 1000),
    totalRequests,
    routes,
  };
};

export const resetMetrics = (): void => {
  metrics.clear();
  totalRequests = 0;
};

