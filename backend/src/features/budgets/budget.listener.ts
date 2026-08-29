import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { eventBus } from '../../utils/eventBus';
import { roundMoney, serializeMoney } from '../../utils/money';
import { Prisma } from '../../db/prisma-client';

const { Decimal } = Prisma;

/**
 * Calculates start and end bounds of a budget period relative to a given transaction date.
 */
export function getBudgetPeriodBounds(date: Date, period: string): { startDate: Date; endDate: Date } {
  const startDate = new Date(date);
  const endDate = new Date(date);
  if (period === 'weekly') {
    const day = startDate.getDay();
    const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
    startDate.setDate(diff);
    startDate.setHours(0, 0, 0, 0);

    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else if (period === 'yearly') {
    startDate.setMonth(0, 1);
    startDate.setHours(0, 0, 0, 0);

    endDate.setMonth(11, 31);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // monthly
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0); // last day of month
    endDate.setHours(23, 59, 59, 999);
  }
  return { startDate, endDate };
}

/**
 * Builds the period key used in the budget alert dedupKey.
 * Format: "YYYY-MM_<period>" e.g. "2026-08_monthly", "2026-W35_weekly", "2026_yearly"
 */
function buildPeriodKey(date: Date, period: string): string {
  const year = date.getFullYear();
  if (period === 'yearly') return `${year}_yearly`;
  if (period === 'weekly') {
    // ISO week number
    const jan1 = new Date(year, 0, 1);
    const weekNum = Math.ceil((((date.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}_weekly`;
  }
  // monthly (default)
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}_monthly`;
}

/**
 * Recalculates spent amount for budgets matching the user and category,
 * and sends warning/critical alerts if spending ratios cross thresholds.
 *
 * Budget alert deduplication is enforced at the DB level via
 * Notification.dedupKey @unique. This prevents the race condition where two
 * concurrent TRANSACTION_CREATED events (e.g., two expenses logged within
 * milliseconds of each other) both read "no existing alert" and both attempt
 * to write one. The first write succeeds; the second receives a P2002 unique
 * constraint violation and is silently skipped.
 */
export const recalculateBudgetsForTransaction = async (userId: string, category: string, date: Date): Promise<void> => {
  try {
    // Find active budgets matching user and category (case-insensitive)
    const budgets = await prisma.budget.findMany({
      where: {
        userId,
        category: { equals: category, mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (budgets.length === 0) {
      return;
    }

    for (const budget of budgets) {
      const { startDate, endDate } = getBudgetPeriodBounds(date, budget.period);

      // Aggregate all active expense transactions in this category and date range
      const aggregateResult = await prisma.transaction.aggregate({
        where: {
          userId,
          category: { equals: budget.category, mode: 'insensitive' },
          type: 'expense',
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { amount: true },
      });

      const spent = aggregateResult._sum.amount ? roundMoney(aggregateResult._sum.amount) : new Decimal(0);

      // Update the budget spent column in DB
      const updatedBudget = await prisma.budget.update({
        where: { id: budget.id },
        data: { spent },
      });

      // Dispatch alert notifications if enabled
      if (updatedBudget.alertEnabled) {
        const limit = roundMoney(updatedBudget.amount);
        if (limit.isPositive()) {
          const ratio = spent.div(limit).mul(100);
          const pct = Number(ratio.toFixed(2));
          const threshold = updatedBudget.threshold;

          const isCritical = pct >= 100;
          const isWarning = pct >= threshold;

          if (isWarning) {
            const level: 'warning' | 'critical' = isCritical ? 'critical' : 'warning';
            const periodKey = buildPeriodKey(date, budget.period);

            // ── DB-level dedup: unique key prevents duplicate alert notifications ──
            //
            // Key format: "<userId>:budget_alert:<category>:<periodKey>:<level>"
            // e.g. "abc123:budget_alert:Groceries:2026-08_monthly:warning"
            //
            // A 'warning' alert and a 'critical' alert in the same period are
            // distinct keys — so an upgrade from warning → critical is allowed.
            //
            // The @unique index on Notification.dedupKey means that if two concurrent
            // budget recalculation handlers try to write the same alert, the second
            // will receive a P2002 (unique constraint violation) and be silently
            // skipped, guaranteeing exactly one alert per (user, category, period, level).
            const dedupKey = `${userId}:budget_alert:${budget.category}:${periodKey}:${level}`;

            const title = level === 'critical' ? 'Budget Limit Breached' : 'Budget Warning Threshold Reached';
            const message = level === 'critical'
              ? `CRITICAL: Your spending in category "${budget.category}" has reached ${serializeMoney(spent)}, breaching your limit of ${serializeMoney(limit)}!`
              : `WARNING: Your spending in category "${budget.category}" is at ${pct.toFixed(0)}% of your ${serializeMoney(limit)} budget.`;

            // Coerce alert channels
            let channelsArray = ['app'];
            if (budget.alertChannels) {
              if (Array.isArray(budget.alertChannels)) {
                channelsArray = budget.alertChannels.map(String);
              } else if (typeof budget.alertChannels === 'string') {
                try {
                  const parsed = JSON.parse(budget.alertChannels);
                  if (Array.isArray(parsed)) channelsArray = parsed.map(String);
                } catch {
                  /* fallback */
                }
              }
            }

            try {
              await prisma.notification.create({
                data: {
                  userId,
                  title,
                  message,
                  type: 'budget_alert',
                  category: budget.category,
                  status: 'pending', // for the outbox worker to drain
                  channels: channelsArray,
                  dedupKey,
                  metadata: {
                    budgetId: budget.id,
                    threshold,
                    spent: serializeMoney(spent),
                    limit: serializeMoney(limit),
                    level,
                    periodKey,
                  },
                },
              });

              logger.info(
                `[budget-listener] Dispatched ${level} budget alert for user ${userId}, ` +
                `category ${budget.category} (${pct}% spent), dedupKey=${dedupKey}`,
              );
            } catch (createErr: any) {
              if (createErr?.code === 'P2002') {
                // A duplicate alert was prevented by the unique DB constraint.
                // This is the expected path when two concurrent events trigger the
                // same threshold crossing — log at debug to avoid noise in alerting.
                logger.debug(
                  `[budget-listener] Budget alert already exists (DB dedup) for dedupKey=${dedupKey} — skipping`,
                );
              } else {
                // Unexpected error — re-throw so the outer catch can handle it
                throw createErr;
              }
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error(`[budget-listener] Recalculation failed for user ${userId}, category ${category}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Generic handler to resolve transaction details from DB and process budget recalculation.
 */
async function handleTransactionEvent(transactionId: string) {
  try {
    const tx = await prisma.transaction.findFirst({
      where: { id: transactionId },
    });
    if (tx) {
      await recalculateBudgetsForTransaction(tx.userId, tx.category, tx.date);
    }
  } catch (error) {
    logger.error(`[budget-listener] Event processing failed for transactionId ${transactionId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Register listeners
eventBus.on('TRANSACTION_CREATED', async (payload) => {
  logger.info('[budget-listener] TRANSACTION_CREATED event received', payload);
  await handleTransactionEvent(payload.transactionId);
});

eventBus.on('TRANSACTION_UPDATED', async (payload) => {
  logger.info('[budget-listener] TRANSACTION_UPDATED event received', payload);
  await handleTransactionEvent(payload.transactionId);
});

eventBus.on('TRANSACTION_DELETED', async (payload) => {
  logger.info('[budget-listener] TRANSACTION_DELETED event received', payload);
  await handleTransactionEvent(payload.transactionId);
});
