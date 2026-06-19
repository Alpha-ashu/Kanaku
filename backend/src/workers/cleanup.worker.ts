/**
 * Database Cleanup Worker
 *
 * Nightly cron job that purges expired/stale records to prevent unbounded table growth.
 * Fix M-5: RefreshToken expiry cleanup + OtpCode cleanup + SyncQueue cleanup.
 */

import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { audit } from '../utils/auditLogger';

let cleanupJob: ScheduledTask | null = null;

/**
 * Phase 2 of the GDPR account-deletion flow.
 *
 * `DELETE /api/v1/settings/account` soft-deletes a user by setting
 * `status = 'pending_deletion'` and stamping
 * `syncToken = 'delete_after:<ISO>'`. This task finds users whose grace
 * window has elapsed and performs the irreversible hard delete.
 *
 * Postgres `ON DELETE CASCADE` (declared on every child relation in
 * schema.prisma) takes care of accounts, transactions, goals, loans,
 * etc. — so deleting the `User` row removes all owned data atomically.
 *
 * Supabase Auth user + Storage objects are NOT removed here (different
 * system); that is left to a follow-up integration. We emit an audit row
 * for each executed deletion so there is a durable compliance record.
 */
export const runAccountDeletionSweep = async (): Promise<void> => {
  const now = new Date();
  const prefix = 'delete_after:';

  try {
    // Find candidates: pending_deletion users with an elapsed timer.
    const candidates = await prisma.user.findMany({
      where: {
        status: 'pending_deletion',
        syncToken: { startsWith: prefix },
      },
      select: { id: true, email: true, syncToken: true, role: true },
      take: 100, // bound the batch
    });

    let deleted = 0;
    for (const user of candidates) {
      const iso = (user.syncToken || '').slice(prefix.length);
      const dueAt = new Date(iso);
      if (Number.isNaN(dueAt.getTime()) || dueAt > now) {
        continue; // not due yet (or malformed marker — skip, don't crash)
      }

      // Never auto-delete an admin via this path — defence in depth.
      if (user.role === 'admin') {
        logger.warn('[deletion-sweep] Skipping admin account flagged for deletion', { userId: user.id });
        continue;
      }

      try {
        await prisma.user.delete({ where: { id: user.id } });
        deleted += 1;
        audit({
          event: 'gdpr.account_delete_executed',
          userId: user.id,
          resource: 'user',
          resourceId: user.id,
          meta: { scheduledFor: iso },
        });
      } catch (err) {
        logger.error('[deletion-sweep] Failed to hard-delete user', {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (deleted > 0) {
      logger.info('[deletion-sweep] Hard-deleted expired accounts', { deleted });
    }
  } catch (error) {
    logger.error('[deletion-sweep] Account deletion sweep failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

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

  // 5. GDPR hard-delete sweep (runs after the generic cleanup).
  await runAccountDeletionSweep();
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

