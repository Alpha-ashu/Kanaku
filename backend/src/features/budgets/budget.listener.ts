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
 * Recalculates spent amount for budgets matching the user and category,
 * and sends warning/critical alerts if spending ratios cross thresholds.
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
            // Check if an alert notification was already dispatched in this cycle
            const existingAlert = await prisma.notification.findFirst({
              where: {
                userId,
                type: 'budget_alert',
                category: budget.category,
                createdAt: { gte: startDate, lte: endDate },
                deletedAt: null,
              },
            });

            let shouldSend = false;
            let level: 'warning' | 'critical' = 'warning';

            if (!existingAlert) {
              shouldSend = true;
              level = isCritical ? 'critical' : 'warning';
            } else {
              // Upgrade to critical if only a warning was previously sent
              const alertMeta = existingAlert.metadata ? (typeof existingAlert.metadata === 'string' ? JSON.parse(existingAlert.metadata) : existingAlert.metadata) : {};
              if (isCritical && alertMeta.level !== 'critical') {
                shouldSend = true;
                level = 'critical';
              }
            }

            if (shouldSend) {
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

              await prisma.notification.create({
                data: {
                  userId,
                  title,
                  message,
                  type: 'budget_alert',
                  category: budget.category,
                  status: 'pending', // for the outbox worker to drain
                  channels: channelsArray,
                  metadata: {
                    budgetId: budget.id,
                    threshold,
                    spent: serializeMoney(spent),
                    limit: serializeMoney(limit),
                    level,
                  },
                },
              });

              logger.info(`[budget-listener] Dispatched ${level} budget alert for user ${userId}, category ${budget.category} (${pct}% spent)`);
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
