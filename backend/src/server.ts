import 'dotenv/config';
import app from './app';
import { logger } from './config/logger';
import { initializeSocket } from './sockets/index';
import { closeRedis, initRedis } from './cache/redis';
import { startAIBackgroundJobs, stopAIBackgroundJobs } from './modules/ai/ai.engine';
import { initializeNotificationWorkers } from './workers/index';
import { startCleanupWorker, stopCleanupWorker } from './workers/cleanup.worker';
import { getQueues } from './config/queue';

const PORT = process.env.PORT || 3000;

// API Keys and Credentials
const getApiKey = (key: string): string | undefined => {
  return process.env[key as keyof NodeJS.ProcessEnv] as string | undefined;
};

const getStripeApiKey = (): string | undefined => {
  return getApiKey('STRIPE_API_KEY');
};

const getOpenAIApiKey = (): string | undefined => {
  return getApiKey('OPENAI_API_KEY');
};

const getGoogleApiKey = (): string | undefined => {
  return getApiKey('GOOGLE_API_KEY');
};

const getFirebaseSecret = (): string | undefined => {
  return getApiKey('FIREBASE_SECRET');
};

const getAwsSecretAccessKey = (): string | undefined => {
  return getApiKey('AWS_SECRET_ACCESS_KEY');
};

const getSendGridApiKey = (): string | undefined => {
  return getApiKey('SENDGRID_API_KEY');
};

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Initialize WebSocket
initializeSocket(server);

void initRedis();

// Initialize notification workers
try {
  const { pushQueue, emailQueue } = getQueues();
  const workers = initializeNotificationWorkers(pushQueue, emailQueue);
  logger.info('Notification workers initialized', {
    pushWorker: !!workers.pushWorker,
    emailWorker: !!workers.emailWorker,
  });
} catch (error) {
  logger.error('Failed to initialize notification workers:', error);
}

startAIBackgroundJobs();
startCleanupWorker();

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down server...`);
  server.close(async () => {
    stopAIBackgroundJobs();
    stopCleanupWorker();
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
  logger.error('Uncaught exception — shutting down', {
    message: error.message,
    stack: error.stack,
  });
  // Attempt a graceful shutdown, then force-exit so a fresh instance starts.
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 10_000).unref();
});

export default server;
