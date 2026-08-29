import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { audit } from '../utils/auditLogger';
import { roundMoney, neg } from '../utils/money';
import { eventBus } from '../utils/eventBus';
import { transactionRepository } from '../features/transactions/transaction.repository';
import { Prisma } from '../db/prisma-client';
import {
  recurringExecutionTotal,
  recurringJobsFailedTotal,
} from '../config/metrics';

let recurringJob: ScheduledTask | null = null;

// ── Worker User-Skip Guard ────────────────────────────────────────────────────
// When a factory reset is in progress for a user, the recurring worker (and
// notification drainer in workers/index.ts) skip that user's items to prevent
// a race where a worker commits a new expense AFTER the reset transaction
// committed but BEFORE the controller marks the operation complete.
//
// ⚠️  SCALABILITY NOTE: This Set is process-local. It is correct and sufficient
//     for a single Node.js deployment. If the service is scaled horizontally
//     (multiple processes, Kubernetes pods, PM2 cluster), each process maintains
//     its own copy of the Set, so a reset triggered on Pod A would not pause the
//     worker on Pod B.
//
//     Migration path to multi-process deployments:
//       1. Add `clearingData Boolean @default(false)` to the UserSettings model.
//       2. The factory reset sets it true before the transaction and false after.
//       3. Workers query `UserSettings.clearingData` to decide whether to skip.
//     Until then, the advisory lock (pg_try_advisory_lock) on Postgres guarantees
//     a single concurrent reset per user across the entire DB cluster.
const clearingDataUsers = new Set<string>();

/** Mark a user as having an active factory reset in progress. */
export function markUserClearing(userId: string): void {
  clearingDataUsers.add(userId);
}

/** Unmark a user after their factory reset completes or fails. */
export function unmarkUserClearing(userId: string): void {
  clearingDataUsers.delete(userId);
}

/** Returns true if a factory reset is currently in progress for this user. */
export function isUserClearing(userId: string): boolean {
  return clearingDataUsers.has(userId);
}

export function calculateNextDueDate(currentDate: Date, interval: string): Date {
  const next = new Date(currentDate);
  if (interval === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (interval === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (interval === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    // monthly (default)
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/**
 * Attempt to claim a RecurringExecution slot for the given (ruleId, scheduledDate).
 *
 * Uses the @@unique([ruleId, scheduledDate]) constraint as the idempotency gate.
 * If the slot was already claimed (by a previous run or a concurrent runner), the
 * function returns null — the caller must skip this occurrence.
 *
 * Returns the RecurringExecution row if the slot was freshly claimed (status=RUNNING).
 *
 * The two-step create→update is intentional: Prisma's upsert on a non-@id unique
 * key requires the create and update payloads to be specified separately, and we
 * want RUNNING status only if we were the ones who created the row.
 */
async function claimExecution(
  ruleId: string,
  scheduledDate: Date,
): Promise<{ id: string } | null> {
  try {
    // Use createOrUpdate: if a row already exists (any status) we do NOT
    // overwrite it — we only care that WE created it. The update path sets
    // nothing meaningful, so we just bump updatedAt.
    const execution = await prisma.recurringExecution.upsert({
      where: { ruleId_scheduledDate: { ruleId, scheduledDate } },
      create: {
        ruleId,
        scheduledDate,
        status: 'RUNNING',
        executedDate: new Date(),
      },
      update: {
        // DO NOT change status — the row already existed, another runner
        // owns it. We just touch updatedAt to signal a claim attempt was made.
        updatedAt: new Date(),
      },
      select: { id: true, status: true, createdAt: true, updatedAt: true },
    });

    // Detect whether we were the creator: if createdAt ≈ updatedAt (within 2s)
    // and status is RUNNING, we own the slot. Otherwise it pre-existed.
    const ageMs = execution.updatedAt.getTime() - execution.createdAt.getTime();
    const weCreatedIt = ageMs < 2000 && (execution as any).status === 'RUNNING';

    if (!weCreatedIt) {
      logger.info(
        `[recurring-worker] Execution slot already claimed for rule=${ruleId} date=${scheduledDate.toISOString()} — skipping (idempotent)`,
      );
      return null;
    }

    return { id: execution.id };
  } catch (err: any) {
    // Unique constraint violation: another concurrent worker beat us to it.
    if (err?.code === 'P2002') {
      logger.info(
        `[recurring-worker] Duplicate execution prevented by DB constraint for rule=${ruleId} date=${scheduledDate.toISOString()}`,
      );
      return null;
    }
    throw err;
  }
}

/**
 * Sweeps the database for active recurring transaction templates that are due,
 * posts the transactions, updates account balances, and schedules the next occurrence.
 *
 * Idempotency is guaranteed at two levels:
 *   1. RecurringExecution @@unique([ruleId, scheduledDate]) — prevents the same
 *      occurrence from being processed twice even if the cron fires concurrently
 *      or the process restarts mid-run.
 *   2. Transaction.dedupHash — includes the recurringRuleId so it is namespaced
 *      to the rule and cannot collide with manually-entered transactions.
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
      // Skip users who currently have a factory reset in progress
      if (isUserClearing(item.userId)) {
        logger.debug(`[recurring-worker] Skipping item ${item.id} — factory reset in progress for user ${item.userId}`);
        continue;
      }

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

        // ── PRIMARY IDEMPOTENCY GATE ──────────────────────────────────────────
        // Attempt to claim this (rule, date) occurrence. If another worker/run
        // already claimed it, claimExecution returns null and we skip.
        const execution = await claimExecution(item.id, currentDueDate);
        if (!execution) {
          // Slot already owned — advance the date and continue without creating
          // another transaction. This is the idempotent skip path.
          currentDueDate = calculateNextDueDate(currentDueDate, item.interval);
          continue;
        }

        let createdTransactionId: string | null = null;

        try {
          if (item.autoProcess) {
            // Check for required fields for transaction creation
            if (!item.accountId) {
              throw new Error(`Missing accountId for auto-processed recurring transaction ${item.id}`);
            }

            const type = item.type || 'expense';
            const decimalAmount = roundMoney(item.amount);

            // ── SECONDARY IDEMPOTENCY: dedupHash includes recurringRuleId ────
            // This ensures that a recurring transaction's hash cannot collide
            // with a manually-entered transaction of the same amount/date.
            const dedupHash = transactionRepository.generateDedupHash(
              item.userId,
              Number(item.amount),
              currentDueDate,
              item.notes || item.title,
              item.id, // recurringRuleId — prevents cross-rule hash collisions
            );

            await prisma.$transaction(async (tx) => {
              // Secondary guard: check if this dedupHash already has a transaction
              // (safety net in case the RecurringExecution slot was somehow
              // bypassed — belt-and-suspenders approach).
              const existing = await tx.transaction.findFirst({
                where: { dedupHash, userId: item.userId },
              });

              if (existing) {
                logger.info(
                  `[recurring-worker] Transaction already exists (dedupHash match) for user ${item.userId}, ` +
                  `date ${currentDueDate.toISOString()}, rule ${item.id} — linking to execution record`,
                  { existingTransactionId: existing.id, executionId: execution.id },
                );
                // Link the existing transaction to this execution record
                await tx.recurringExecution.update({
                  where: { id: execution.id },
                  data: {
                    status: 'SUCCESS',
                    transactionId: existing.id,
                    executedDate: new Date(),
                    failureReason: null,
                  },
                });
                createdTransactionId = existing.id;
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

              createdTransactionId = createdTx.id;

              // Apply balance updates to related accounts
              for (const [accountId, delta] of deltas.entries()) {
                await tx.account.update({
                  where: { id: accountId },
                  data: { balance: { increment: delta } },
                });
              }

              // Update the RecurringExecution record to SUCCESS, linking the transaction
              await tx.recurringExecution.update({
                where: { id: execution.id },
                data: {
                  status: 'SUCCESS',
                  transactionId: createdTx.id,
                  executedDate: new Date(),
                  failureReason: null,
                },
              });

              // Audit log the automated execution
              audit({
                event: 'data.create',
                userId: item.userId,
                resource: 'transaction',
                resourceId: createdTx.id,
                meta: {
                  recurringTransactionId: item.id,
                  executionId: execution.id,
                  dueDate: currentDueDate.toISOString(),
                  subType: 'recurring',
                },
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

              logger.info('[recurring-worker] Automatically posted transaction', {
                transactionId: createdTx.id,
                userId: item.userId,
                recurringRuleId: item.id,
                executionId: execution.id,
                dueDate: currentDueDate.toISOString(),
              });
              recurringExecutionTotal.labels({ status: 'success' }).inc();
            });
          } else {
            // Dispatch a reminder notification for non-auto-processed items.
            // Use a dedupKey to prevent duplicate reminder notifications for the
            // same recurring item and due date.
            const reminderDedupKey = `reminder:${item.userId}:${item.id}:${currentDueDate.toISOString().slice(0, 10)}`;

            try {
              await prisma.notification.create({
                data: {
                  userId: item.userId,
                  title: 'Recurring Payment Reminder',
                  message: `Reminder: Your recurring item "${item.title}" of ${roundMoney(item.amount).toFixed(2)} is due on ${currentDueDate.toLocaleDateString()}.`,
                  type: 'loan_reminder', // reusing loan_reminder style for bills
                  status: 'pending', // outbox sweeper will deliver this
                  channels: JSON.stringify(['app', 'email']),
                  dedupKey: reminderDedupKey,
                },
              });

              logger.info(`[recurring-worker] Dispatched due reminder for recurring item ${item.id}`);
            } catch (notifErr: any) {
              // Unique constraint on dedupKey means a duplicate reminder was attempted
              if (notifErr?.code === 'P2002') {
                logger.info(`[recurring-worker] Reminder already dispatched for ${item.id} on ${currentDueDate.toISOString().slice(0, 10)} — skipping duplicate`);
              } else {
                throw notifErr;
              }
            }

            // Mark the execution as SUCCESS (reminder dispatched)
            await prisma.recurringExecution.update({
              where: { id: execution.id },
              data: { status: 'SUCCESS', executedDate: new Date() },
            });
          }
        } catch (err) {
          // Mark this execution as FAILED so it can be retried or investigated
          await prisma.recurringExecution.update({
            where: { id: execution.id },
            data: {
              status: 'FAILED',
              failureReason: err instanceof Error ? err.message.slice(0, 500) : String(err),
            },
          }).catch(() => {/* best-effort — don't mask original error */});

          logger.error('[recurring-worker] Failed to process recurring transaction item', {
            recurringRuleId: item.id,
            executionId: execution.id,
            dueDate: currentDueDate.toISOString(),
            error: err instanceof Error ? err.message : String(err),
          });
          recurringExecutionTotal.labels({ status: 'failed' }).inc();
          recurringJobsFailedTotal.inc();
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
