/**
 * Worker entrypoint (Infrastructure Part 1 — Machine 2).
 *
 * A dedicated, NON-public process that owns all asynchronous processing:
 *   - Notification outbox draining (email + push delivery, retries/backoff)
 *   - AI background jobs
 *   - Scheduled cleanup jobs (account-deletion sweep, etc.)
 *
 * It deliberately does NOT create an Express server or Socket.IO instance, so
 * it exposes no HTTP/public endpoints. It talks only to PostgreSQL and the
 * email/push providers. Crashes here cannot affect API responsiveness.
 *
 * Lifecycle mirrors server.ts (graceful shutdown + last-resort safety nets) so
 * the two entrypoints behave identically under signals and fatal errors.
 */
import 'dotenv/config';
// `./config/env` self-validates on import (imported before any job module), so a
// misconfigured worker fails fast and refuses to run with partial config.
// `validateConfig('worker')` below is the explicit, logged startup gate.
import { validateConfig } from './config/env';
import { initTracing } from './config/tracing';
import http from 'http';
import { logger } from './config/logger';
import { closeRedis, initRedis } from './cache/redis';
import { closePurposeClients } from './config/redis-connections';
import { startAIBackgroundJobs, stopAIBackgroundJobs } from './features/ai/ai.engine';
import { startNotificationOutbox, stopNotificationOutbox } from './workers/index';
import { startCleanupWorker, stopCleanupWorker } from './workers/cleanup.worker';
import { startRecurringWorker, stopRecurringWorker } from './workers/recurring.worker';
import { getWorkerHealth } from './workers/health';
import './features/budgets/budget.listener';
import { renderMetrics, metricsContentType } from './config/metrics';

// Explicit startup gate (config/env already validated on import above) +
// distributed-tracing hook (a no-op until OpenTelemetry is adopted — see
// docs/04_App_Flow/OPENTELEMETRY_READINESS.md).
validateConfig('worker');
initTracing();

logger.info('Worker starting');

// ── Internal health + metrics server ─────────────────────────────────────────
// Liveness/health AND Prometheus metrics for the worker. Bound to the Fly private
// network only (port 9091 = the fly.toml `[[metrics]]` port) — NOT declared under
// any [http_service]/[[services]], so it is not publicly routable (the worker
// stays free of public endpoints). Fly's machine check (`[checks]`) probes
// /health (→ 200 ok|starting / 503 stale) and Fly scrapes /metrics.
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT || 9091);
const healthServer = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/health/worker')) {
    const { healthy, body } = getWorkerHealth();
    res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }
  if (req.method === 'GET' && req.url === '/metrics') {
    renderMetrics()
      .then((text) => { res.writeHead(200, { 'content-type': metricsContentType }); res.end(text); })
      .catch(() => { res.writeHead(500); res.end(); });
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});
healthServer.listen(HEALTH_PORT, () => {
  logger.info(`Worker health + metrics server listening on :${HEALTH_PORT}`);
});

void initRedis();

// Start every background job. Unlike the API process, the worker always runs
// these — that is its entire reason to exist (RUN_WORKERS_IN_API is irrelevant
// here).
try {
  startNotificationOutbox();
} catch (error) {
  logger.error('Failed to start notification outbox drainer:', error);
}

startAIBackgroundJobs();
startCleanupWorker();
startRecurringWorker();

logger.info('Worker ready — background jobs running');

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down worker...`);

  stopAIBackgroundJobs();
  stopCleanupWorker();
  stopRecurringWorker();
  await stopNotificationOutbox();
  healthServer.close();
  await closePurposeClients();
  await closeRedis();
  process.exit(0);

  // Force-exit if a job hangs during drain so the orchestrator restarts cleanly.
  setTimeout(() => process.exit(0), 10_000).unref();
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

// Last-resort safety nets — match server.ts semantics so the worker fails the
// same way the API does (log everything; exit on an undefined-state exception
// so a fresh instance starts).
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception — shutting down worker', {
    message: error.message,
    stack: error.stack,
  });
  void stopNotificationOutbox().finally(() => {
    setTimeout(() => process.exit(1), 5_000).unref();
  });
});
