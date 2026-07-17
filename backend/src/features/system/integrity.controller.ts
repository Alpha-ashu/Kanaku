/**
 * System Integrity & Operational Health Controller — Phase 9.5 Observability.
 *
 * GET /api/v1/system/integrity
 *   → Financial ledger audits (balance, duplicates, orphans, queues).
 *   → Operational health (worker, DB, cache, build version, uptime, memory).
 *
 * All checks run in parallel and the response always succeeds with a detailed
 * body so monitoring tools can parse individual sub-checks rather than relying
 * on HTTP status codes alone.
 */
import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { getCacheMetricsSnapshot } from '../../cache/redis';
import { getWorkerHealth } from '../../workers/health';
import { registry } from '../../config/metrics';

const PROCESS_START_MS = Date.now();

export const getSystemIntegrity = async (req: Request, res: Response) => {
  try {
    // ── 1. Financial Integrity Checks (all run in parallel) ───────────────────
    const [
      imbalancedEntries,
      duplicateSequences,
      duplicateIdempotency,
      orphanTransactions,
      orphanGroupMembers,
      pendingNotifications,
      failedNotifications,
    ] = await Promise.all([
      // 1a. Double-entry balance audit
      prisma.$queryRaw<any[]>`
        SELECT
          "journalEntryId",
          COUNT(*)::int as legs_count,
          COALESCE(SUM(CASE WHEN UPPER(type) IN ('EXPENSE', 'TRANSFER_OUT') THEN amount ELSE 0 END), 0)::float as credits,
          COALESCE(SUM(CASE WHEN UPPER(type) IN ('INCOME', 'TRANSFER_IN') THEN amount ELSE 0 END), 0)::float as debits
        FROM "Transaction"
        WHERE "deletedAt" IS NULL AND "journalEntryId" IS NOT NULL
        GROUP BY "journalEntryId"
        HAVING COUNT(*) > 1
          AND SUM(CASE WHEN UPPER(type) IN ('EXPENSE', 'TRANSFER_OUT') THEN amount ELSE 0 END)
            != SUM(CASE WHEN UPPER(type) IN ('INCOME', 'TRANSFER_IN') THEN amount ELSE 0 END)
        LIMIT 100
      `,
      // 1b. Duplicate sequence numbers
      prisma.$queryRaw<any[]>`
        SELECT "sequenceNumber", COUNT(*)::int as count
        FROM "Transaction"
        WHERE "sequenceNumber" IS NOT NULL AND "deletedAt" IS NULL
        GROUP BY "sequenceNumber"
        HAVING COUNT(*) > 1
        LIMIT 100
      `,
      // 1c. Duplicate idempotency keys
      prisma.$queryRaw<any[]>`
        SELECT "userId", "sourceModule", "idempotencyKey", COUNT(*)::int as count
        FROM "Transaction"
        WHERE "idempotencyKey" IS NOT NULL AND "deletedAt" IS NULL
        GROUP BY "userId", "sourceModule", "idempotencyKey"
        HAVING COUNT(*) > 1
        LIMIT 100
      `,
      // 1d. Orphan transactions (missing account)
      prisma.$queryRaw<any[]>`
        SELECT t.id, t."accountId", t."userId"
        FROM "Transaction" t
        LEFT JOIN "Account" a ON t."accountId" = a.id
        WHERE a.id IS NULL AND t."deletedAt" IS NULL
        LIMIT 100
      `,
      // 1e. Orphan group expense members
      prisma.$queryRaw<any[]>`
        SELECT gem.id, gem."groupExpenseId"
        FROM "GroupExpenseMember" gem
        LEFT JOIN group_expenses ge ON gem."groupExpenseId" = ge.id
        WHERE ge.id IS NULL AND gem."deletedAt" IS NULL
        LIMIT 100
      `,
      // 1f. Notification queue depth
      prisma.notification.count({ where: { status: 'pending' } }),
      prisma.notification.count({ where: { status: 'failed' } }),
    ]);

    const isLedgerHealthy =
      imbalancedEntries.length === 0 &&
      duplicateSequences.length === 0 &&
      duplicateIdempotency.length === 0 &&
      orphanTransactions.length === 0 &&
      orphanGroupMembers.length === 0;

    // ── 2. Database Connectivity & Lock Monitoring ────────────────────────────
    let dbConnected = false;
    let dbLatencyMs: number | null = null;
    let dbActiveLocksCount = 0;
    let dbWaitingLocksCount = 0;
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
      dbConnected = true;

      const lockStats = await prisma.$queryRaw<any[]>`
        SELECT 
          (SELECT count(*)::int FROM pg_locks) as active_locks,
          (SELECT count(*)::int FROM pg_locks WHERE NOT granted) as waiting_locks
      `;
      if (lockStats && lockStats[0]) {
        dbActiveLocksCount = Number(lockStats[0].active_locks || 0);
        dbWaitingLocksCount = Number(lockStats[0].waiting_locks || 0);
      }
    } catch {
      // If lock queries fail (e.g. SQLite local development), we keep default counts of 0
    }

    // ── 3. Schema / Migration Status ──────────────────────────────────────────
    let migrationCount = 0;
    let latestMigration = 'unknown';
    try {
      const migrations = await prisma.$queryRaw<{ migration_name: string; applied_steps_count: number }[]>`
        SELECT migration_name, applied_steps_count
        FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 5
      `;
      migrationCount = migrations.length;
      latestMigration = migrations[0]?.migration_name ?? 'none';
    } catch {
      // _prisma_migrations may not be accessible in all deployments
    }

    // ── 4. Worker Health ──────────────────────────────────────────────────────
    const workerHealth = getWorkerHealth();

    // ── 5. Cache Health ───────────────────────────────────────────────────────
    const cacheSnapshot = getCacheMetricsSnapshot();
    const totalCacheReads = Object.values(cacheSnapshot).reduce((sum, b) => sum + b.reads, 0);
    const totalCacheHits = Object.values(cacheSnapshot).reduce((sum, b) => sum + b.hit, 0);
    const overallCacheHitRate = totalCacheReads > 0
      ? Number(((totalCacheHits / totalCacheReads) * 100).toFixed(2))
      : 0;

    // ── 6. Process / Memory ───────────────────────────────────────────────────
    const mem = process.memoryUsage();
    const uptimeMs = Date.now() - PROCESS_START_MS;

    // ── 7. Prometheus Metrics Snapshot ────────────────────────────────────────
    // Get a summary of metric names for the health response (not the full exposition)
    const registeredMetrics = (await registry.getMetricsAsJSON()).map((m: any) => m.name);

    const isOverallHealthy = isLedgerHealthy && dbConnected && workerHealth.healthy;

    logger.info('[System] Integrity check completed', {
      isHealthy: isOverallHealthy,
      isLedgerHealthy,
      dbConnected,
      dbLatencyMs,
    });

    res.json({
      success: true,
      data: {
        // Top-level gate
        isHealthy: isOverallHealthy,

        // ── Financial Integrity ────────────────────────────────────────────
        ledger: {
          isHealthy: isLedgerHealthy,
          ledgerBalanced: imbalancedEntries.length === 0,
          imbalancedJournalEntries: imbalancedEntries,
          duplicateSequences,
          duplicateIdempotency,
          orphanTransactionsCount: orphanTransactions.length,
          orphanTransactions,
          orphanGroupMembersCount: orphanGroupMembers.length,
          orphanGroupMembers,
        },

        // ── Queue Health ───────────────────────────────────────────────────
        notificationsQueue: {
          isHealthy: failedNotifications === 0,
          pending: pendingNotifications,
          failed: failedNotifications,
        },

        // ── Database ───────────────────────────────────────────────────────
        database: {
          isHealthy: dbConnected && dbWaitingLocksCount === 0,
          connected: dbConnected,
          latencyMs: dbLatencyMs,
          migrationCount,
          latestMigration,
          activeLocksCount: dbActiveLocksCount,
          waitingLocksCount: dbWaitingLocksCount,
        },

        // ── Worker ─────────────────────────────────────────────────────────
        worker: workerHealth.body,

        // ── Cache ──────────────────────────────────────────────────────────
        cache: {
          isHealthy: true,
          overallHitRate: `${overallCacheHitRate}%`,
          totalReads: totalCacheReads,
          byPrefix: cacheSnapshot,
        },

        // ── Process / Runtime ──────────────────────────────────────────────
        process: {
          uptimeMs,
          uptimeHuman: `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`,
          buildVersion: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
          nodeVersion: process.version,
          environment: process.env.NODE_ENV || 'development',
          memory: {
            heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
            heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
            rssMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
            externalMb: Number((mem.external / 1024 / 1024).toFixed(2)),
          },
        },

        // ── Observability ──────────────────────────────────────────────────
        observability: {
          prometheusMetricsRegistered: registeredMetrics.length,
          sentryEnabled: !!process.env.SENTRY_DSN,
          structuredLoggingEnabled: true,
          correlationIdEnabled: true,
        },
      },
    });
  } catch (error: any) {
    logger.error('System integrity check failed', { error: error?.message });
    res.status(500).json({
      success: false,
      error: error.message || 'System integrity check failed',
    });
  }
};
