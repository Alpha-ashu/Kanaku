/**
 * Database Cleanup Worker
 *
 * Nightly cron job that purges expired/stale records to prevent unbounded table growth.
 * Fix M-5: RefreshToken expiry cleanup + OtpCode cleanup + SyncQueue cleanup.
 */

import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

let cleanupJob: ScheduledTask | null = null;

/**
 * Run all cleanup tasks and return a summary report.
 */
export const runCleanupTasks = async (): Promise<void> => {
  const now = new Date();
  const summary: Record<string, number> = {};

  try {
    // 1. Delete expired refresh tokens
    const deletedTokens = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    summary.expiredRefreshTokens = deletedTokens.count;

    // 2. Delete used or expired OTP codes older than 24 hours
    const otpCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const deletedOtp = await prisma.otpCode.deleteMany({
      where: {
        OR: [
          { used: true, createdAt: { lt: otpCutoff } },
          { expiresAt: { lt: now } },
        ],
      },
    });
    summary.expiredOtpCodes = deletedOtp.count;

    // 3. Delete failed/synced SyncQueue entries older than 7 days
    const syncCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const deletedSync = await prisma.syncQueue.deleteMany({
      where: {
        status: { in: ['synced', 'failed'] },
        createdAt: { lt: syncCutoff },
      },
    });
    summary.staleSyncQueueEntries = deletedSync.count;

    // 4. Delete soft-deleted notifications older than 30 days
    const notifCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const deletedNotifs = await prisma.notification.deleteMany({
      where: {
        deletedAt: { lt: notifCutoff },
      },
    });
    summary.purgedNotifications = deletedNotifs.count;

    logger.info('Database cleanup completed', { summary });
  } catch (error) {
    logger.error('Database cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Start the nightly cleanup cron (runs at 02:00 every day by default).
 * Schedule is configurable via DB_CLEANUP_CRON env var.
 */
export const startCleanupWorker = (): void => {
  const schedule = process.env.DB_CLEANUP_CRON || '0 2 * * *'; // default: 02:00 daily

  if (!cron.validate(schedule)) {
    logger.error(`Invalid DB_CLEANUP_CRON schedule: "${schedule}". Cleanup worker NOT started.`);
    return;
  }

  cleanupJob = cron.schedule(schedule, () => {
    logger.info('Running scheduled database cleanup...');
    void runCleanupTasks();
  });

  logger.info(`Database cleanup worker started (schedule: ${schedule})`);
};

/**
 * Stop the cleanup cron.
 */
export const stopCleanupWorker = (): void => {
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
    logger.info('Database cleanup worker stopped');
  }
};

