import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { audit } from '../utils/auditLogger';
import { roundMoney, neg } from '../utils/money';
import { eventBus } from '../utils/eventBus';
import { transactionRepository } from '../features/transactions/transaction.repository';
import { Prisma } from '../db/prisma-client';

let recurringJob: ScheduledTask | null = null;

export function calculateNextDueDate(currentDate: Date, interval: string): Date {
  const next = new Date(currentDate);
  if (interval === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (interval === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    // monthly (default)
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/**
 * Sweeps the database for active recurring transaction templates that are due,
 * posts the transactions, updates account balances, and schedules the next occurrence.
 */
export const processDueRecurringTransactions = async (): Promise<void> => {
  const now = new Date();
  try {
    // Find active recurring transactions where nextDueDate is in the past or present
    const dueItems = await prisma.recurringTransaction.findMany({
      where: {
        status: 'active',
        nextDueDate: { lte: now },
        deletedAt: null,
      },
      take: 100, // Batch size boundary
    });

    if (dueItems.length === 0) {
      return;
    }

    logger.info(`[recurring-worker] Processing ${dueItems.length} due recurring transactions`);

    for (const item of dueItems) {
      // Check optional start and end dates
      if (item.startDate && new Date(item.startDate) > now) {
        continue; // Not started yet
      }

      if (item.endDate && new Date(item.endDate) < now) {
        // Exceeded active lifecycle, pause the item
        await prisma.recurringTransaction.update({
          where: { id: item.id },
          data: { status: 'paused' },
        });
        logger.info(`[recurring-worker] Auto-paused recurring rule ${item.id} because it passed its end date.`);
        continue;
      }

      let currentDueDate = new Date(item.nextDueDate);
      let iterations = 0;
      const maxIterations = 24; // Boundary check to prevent infinite loops

      while (currentDueDate <= now && iterations < maxIterations) {
        iterations++;

        // Stop processing if we exceed the end date during iteration catchups
        if (item.endDate && currentDueDate > new Date(item.endDate)) {
          break;
        }

        try {
          if (item.autoProcess) {
            // Check for required fields for transaction creation
            if (!item.accountId) {
              throw new Error(`Missing accountId for auto-processed recurring transaction ${item.id}`);
            }

            const type = item.type || 'expense';
            const decimalAmount = roundMoney(item.amount);

            // Resolve unique dedupHash for this occurrence
            const dedupHash = transactionRepository.generateDedupHash(
              item.userId,
              Number(item.amount),
              currentDueDate,
              item.notes || item.title
            );

            await prisma.$transaction(async (tx) => {
              // Idempotency check
              const existing = await tx.transaction.findFirst({
                where: { dedupHash, userId: item.userId },
              });

              if (existing) {
                logger.info(`[recurring-worker] Transaction already exists (dedupHash match) for user ${item.userId}, date ${currentDueDate.toISOString()}`);
                return;
              }

              // Determine account balance delta impact
              const deltas = new Map<string, Prisma.Decimal>();
              if (type === 'transfer' && item.transferToAccountId) {
                deltas.set(item.accountId!, neg(decimalAmount));
                deltas.set(item.transferToAccountId, decimalAmount);
              } else if (type === 'income') {
                deltas.set(item.accountId!, decimalAmount);
              } else if (type === 'expense') {
                deltas.set(item.accountId!, neg(decimalAmount));
              }

              // Create transaction record
              const createdTx = await tx.transaction.create({
                data: {
                  userId: item.userId,
                  accountId: item.accountId!,
                  type,
                  amount: decimalAmount,
                  category: item.category,
                  subcategory: item.subcategory || null,
                  description: item.description || null,
                  merchant: item.merchant || null,
                  date: currentDueDate,
                  transferToAccountId: type === 'transfer' ? item.transferToAccountId : null,
                  dedupHash,
                  synced: true,
                  syncStatus: 'synced',
                },
              });

              // Apply balance updates to related accounts
              for (const [accountId, delta] of deltas.entries()) {
                await tx.account.update({
                  where: { id: accountId },
                  data: { balance: { increment: delta } },
                });
              }

              // Audit log the automated execution
              audit({
                event: 'data.create',
                userId: item.userId,
                resource: 'transaction',
                resourceId: createdTx.id,
                meta: { recurringTransactionId: item.id, dueDate: currentDueDate.toISOString(), subType: 'recurring' },
              });

              // Emit event to notify other sub-systems (e.g. budgets recalculation)
              eventBus.emit({
                type: 'TRANSACTION_CREATED',
                payload: {
                  userId: item.userId,
                  transactionId: createdTx.id,
                  accountId: createdTx.accountId,
                  amount: Number(createdTx.amount),
                  category: createdTx.category,
                },
              });

              logger.info(`[recurring-worker] Automatically posted transaction ${createdTx.id} for user ${item.userId}`);
            });
          } else {
            // Dispatch a reminder notification for non-auto-processed items
            await prisma.notification.create({
              data: {
                userId: item.userId,
                title: 'Recurring Payment Reminder',
                message: `Reminder: Your recurring item "${item.title}" of ${roundMoney(item.amount).toFixed(2)} is due on ${currentDueDate.toLocaleDateString()}.`,
                type: 'loan_reminder', // reusing loan_reminder style for bills
                status: 'pending', // outbox sweeper will deliver this
                channels: JSON.stringify(['app', 'email']),
              },
            });

            logger.info(`[recurring-worker] Dispatched due reminder for recurring item ${item.id}`);
          }
        } catch (err) {
          logger.error(`[recurring-worker] Failed to process recurring transaction item ${item.id} for date ${currentDueDate.toISOString()}`, {
            error: err instanceof Error ? err.message : String(err),
          });
          break; // Stop catching up this specific item on failure to prevent stuck state
        }

        // Advance to next period date
        currentDueDate = calculateNextDueDate(currentDueDate, item.interval);
      }

      // Save advanced due dates back to DB
      await prisma.recurringTransaction.update({
        where: { id: item.id },
        data: {
          nextDueDate: currentDueDate,
          lastProcessedAt: now,
        },
      });
    }
  } catch (error) {
    logger.error('[recurring-worker] Background processing sweep failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Starts the recurring transaction background worker on a cron schedule.
 * Defaults to running once every hour.
 */
export const startRecurringWorker = (): void => {
  const schedule = process.env.RECURRING_TRANSACTION_CRON || '0 * * * *'; // default: hourly

  if (!cron.validate(schedule)) {
    logger.error(`Invalid RECURRING_TRANSACTION_CRON schedule: "${schedule}". Recurring worker NOT started.`);
    return;
  }

  recurringJob = cron.schedule(schedule, () => {
    logger.info('[recurring-worker] Running recurring transactions sweep...');
    void processDueRecurringTransactions();
  });

  logger.info(`Recurring transactions worker started (schedule: ${schedule})`);
};

/**
 * Stops the recurring transaction cron runner.
 */
export const stopRecurringWorker = (): void => {
  if (recurringJob) {
    recurringJob.stop();
    recurringJob = null;
    logger.info('Recurring transactions worker stopped');
  }
};
