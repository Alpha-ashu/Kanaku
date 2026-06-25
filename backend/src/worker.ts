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
import { logger } from './config/logger';
import { closeRedis, initRedis } from './cache/redis';
import { closePurposeClients } from './config/redis-connections';
import { startAIBackgroundJobs, stopAIBackgroundJobs } from './features/ai/ai.engine';
import { startNotificationOutbox, stopNotificationOutbox } from './workers/index';
import { startCleanupWorker, stopCleanupWorker } from './workers/cleanup.worker';

logger.info('Worker starting', { service: 'worker' });

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

logger.info('Worker ready — background jobs running', { service: 'worker' });

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down worker...`, { service: 'worker' });

  stopAIBackgroundJobs();
  stopCleanupWorker();
  await stopNotificationOutbox();
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
    service: 'worker',
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception — shutting down worker', {
    service: 'worker',
    message: error.message,
    stack: error.stack,
  });
  void stopNotificationOutbox().finally(() => {
    setTimeout(() => process.exit(1), 5_000).unref();
  });
});
