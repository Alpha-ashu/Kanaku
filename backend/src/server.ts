import 'dotenv/config';
// `./config/env` is imported BEFORE `./app` and self-validates on import, so a
// misconfigured production process fails fast — refusing to boot before any port
// binds. `validateConfig('api')` below is the explicit, logged startup gate.
import { validateConfig } from './config/env';
import { initTracing } from './config/tracing';
import http from 'http';
import app from './app';
import { logger } from './config/logger';
import { renderMetrics, metricsContentType } from './config/metrics';
import { initializeSocket } from './sockets/index';
import { closeRedis, initRedis } from './cache/redis';
import { closePurposeClients } from './config/redis-connections';
import { startAIBackgroundJobs, stopAIBackgroundJobs } from './features/ai/ai.engine';
import { startNotificationOutbox, stopNotificationOutbox } from './workers/index';
import { startCleanupWorker, stopCleanupWorker } from './workers/cleanup.worker';
import { runWorkersInApiProcess } from './config/serviceRole';

// Explicit startup gate (config/env already validated on import above) +
// distributed-tracing hook (a no-op until OpenTelemetry is adopted — see
// docs/04_App_Flow/OPENTELEMETRY_READINESS.md).
validateConfig('api');
initTracing();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Initialize WebSocket
initializeSocket(server);

// Prometheus metrics on the Fly [[metrics]] port (9091), separate from the public
// API port. Private 6PN network only (not declared as a public service) so Fly
// can scrape it without exposing it.
const METRICS_PORT = Number(process.env.METRICS_PORT || 9091);
const metricsServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/metrics') {
    renderMetrics()
      .then((text) => { res.writeHead(200, { 'content-type': metricsContentType }); res.end(text); })
      .catch(() => { res.writeHead(500); res.end(); });
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});
metricsServer.on('error', (err) => logger.error('Metrics server error', err));
metricsServer.listen(METRICS_PORT, () => {
  logger.info(`Metrics server listening on :${METRICS_PORT}`);
});

void initRedis();

// Background jobs (notification outbox, AI tasks, cleanup) run in THIS API
// process only in single-machine / local mode. In the split Fly topology they
// run exclusively on the dedicated worker machine (dist/worker.js) and the API
// sets RUN_WORKERS_IN_API=false so a slow/failing job can never affect API
// responsiveness. Default (flag unset) preserves the original single-process
// behaviour exactly.
if (runWorkersInApiProcess()) {
  logger.info('[api] running background jobs in-process (combined mode)');

  // Start the notification outbox drainer (email/push delivery via PostgreSQL —
  // no Redis/queue broker). It polls for notification rows at status='pending'.
  try {
    startNotificationOutbox();
  } catch (error) {
    logger.error('Failed to start notification outbox drainer:', error);
  }

  startAIBackgroundJobs();
  startCleanupWorker();
} else {
  logger.info('[api] background jobs delegated to worker machine (RUN_WORKERS_IN_API=false)');
}

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down server...`);
  metricsServer.close();
  server.close(async () => {
    if (runWorkersInApiProcess()) {
      stopAIBackgroundJobs();
      stopCleanupWorker();
      await stopNotificationOutbox();
    }
    await closePurposeClients();
    await closeRedis();
    process.exit(0);
  });
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

// Last-resort safety nets: never let an unhandled rejection or exception crash
// the process silently. Log with full context; for uncaught exceptions (which
// leave the process in an undefined state) exit so the orchestrator restarts a
// clean instance.
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception â€” shutting down', {
    message: error.message,
    stack: error.stack,
  });
  // Attempt a graceful shutdown, then force-exit so a fresh instance starts.
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 10_000).unref();
});

export default server;
