/**
 * Financial Event Store — Phase 10.5 Production Hardening.
 *
 * Implements a persistent, append-only Event Store for auditing, tracing, and replayability.
 */
import { PrismaTx, BaseFinancialEvent } from '../transactions/dispatcher';
import { getRequestActor } from '../../middleware/requestContext';
import { logger } from '../../config/logger';
import { FinancialEventLogType, SourceModule } from '../../db/prisma-client';

const EventTypeMap: Record<string, FinancialEventLogType> = {
  'GOAL_CONTRIBUTION': 'GOAL_CONTRIBUTED',
  'GOAL_WITHDRAWAL': 'GOAL_WITHDRAWN',
  'GROUP_EXPENSE_CREATED': 'GROUP_EXPENSE_CREATED',
  'GROUP_SETTLEMENT_CREATED': 'GROUP_SETTLEMENT_COMPLETED',
  'GROUP_SETTLEMENT_COMPLETED': 'GROUP_SETTLEMENT_COMPLETED',
  'LEDGER_POSTED': 'LEDGER_POSTED',
  'LEDGER_SETTLED': 'LEDGER_SETTLED',
  'LEDGER_REVERSED': 'LEDGER_REVERSED',
  'LEDGER_TRANSFER_COMPLETED': 'TRANSFER_COMPLETED',
  'LOAN_DISBURSED': 'LOAN_DISBURSED',
  'LOAN_PAYMENT_CREATED': 'LOAN_PAYMENT',
  'RECURRING_EXECUTED': 'RECURRING_EXECUTED',
  'SNAPSHOT_UPDATED': 'SNAPSHOT_UPDATED',
  'FACTORY_RESET_STARTED': 'FACTORY_RESET_STARTED',
  'FACTORY_RESET_COMPLETED': 'FACTORY_RESET_COMPLETED',
  'FACTORY_RESET_FAILED': 'FACTORY_RESET_FAILED',
};

export class FinancialEventStore {
  /**
   * Appends an event to the Event Store in the database.
   * Staps correlation metadata (requestId, correlationId, sessionId) automatically.
   */
  static async record(tx: PrismaTx, event: BaseFinancialEvent): Promise<void> {
    try {
      const dbType = EventTypeMap[event.eventType];
      if (!dbType) {
        logger.warn(`[EventStore] Unknown event type not mapped: ${event.eventType}`);
        return;
      }

      // Gather correlation info from context or event metadata
      const actor = getRequestActor();
      const correlationId = actor.correlationId || event.metadata?.requestId || null;
      let requestId = actor.requestId || event.metadata?.requestId || null;
      const sessionId = actor.sessionId || null;

      // Extract aggregate fields
      let aggregateType = 'System';
      let aggregateId = event.userId;
      let journalEntryId: string | null = null;
      let transactionId: string | null = null;

      const ev = event as any;

      if (ev.journalEntryId) {
        aggregateType = 'JournalEntry';
        aggregateId = ev.journalEntryId;
        journalEntryId = ev.journalEntryId;

        // Fallback: if requestId is null, query it from the JournalEntry record in database
        if (!requestId) {
          try {
            const je = await tx.journalEntry.findUnique({
              where: { id: journalEntryId as string },
              select: { requestId: true }
            });
            if (je?.requestId) requestId = je.requestId;
          } catch (err) {
            // Ignore query errors in fallback
          }
        }
      } else if (ev.transactionId) {
        aggregateType = 'Transaction';
        aggregateId = ev.transactionId;
        transactionId = ev.transactionId;
      } else if (ev.goalId) {
        aggregateType = 'Goal';
        aggregateId = ev.goalId;
      } else if (ev.loanId) {
        aggregateType = 'Loan';
        aggregateId = ev.loanId;
      } else if (ev.investmentId) {
        aggregateType = 'Investment';
        aggregateId = ev.investmentId;
      } else if (ev.groupExpenseId) {
        aggregateType = 'GroupExpense';
        aggregateId = ev.groupExpenseId;
      }

      // Prepare payload (strip metadata to avoid duplication)
      const { metadata, ...payload } = ev;

      await tx.financialEvent.create({
        data: {
          eventType: dbType,
          aggregateType,
          aggregateId,
          userId: event.userId,
          journalEntryId,
          transactionId,
          eventVersion: event.eventVersion || 1,
          correlationId,
          requestId,
          sessionId,
          sourceModule: event.sourceModule as SourceModule,
          payload: JSON.parse(JSON.stringify(payload)),
          metadata: event.metadata ? JSON.parse(JSON.stringify(event.metadata)) : undefined,
          createdAt: event.timestamp || new Date()
        }
      });

      logger.debug(`[EventStore] Event recorded: ${dbType} (ID: ${aggregateId})`);
    } catch (error: any) {
      logger.error(`[EventStore] Failed to record event ${event.eventType}`, {
        userId: event.userId,
        error: error.message
      });
      // Do not crash the parent transaction if logging fails
    }
  }

  /**
   * Records a FACTORY_RESET_STARTED, FACTORY_RESET_COMPLETED, or
   * FACTORY_RESET_FAILED lifecycle event directly into the FinancialEvent
   * table (outside a transaction — these are operational events, not financial
   * journal entries, and must survive even if the reset transaction rolled back).
   *
   * @param userId  The user whose data is being reset
   * @param phase   'STARTED' | 'COMPLETED' | 'FAILED'
   * @param payload Optional metadata (e.g. failure reason, counts)
   */
  static async recordFactoryReset(
    userId: string,
    phase: 'STARTED' | 'COMPLETED' | 'FAILED',
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const { prisma } = await import('../../db/prisma');
    const eventType: FinancialEventLogType = `FACTORY_RESET_${phase}` as FinancialEventLogType;
    try {
      await prisma.financialEvent.create({
        data: {
          eventType,
          aggregateType: 'User',
          aggregateId:   userId,
          userId,
          eventVersion:  1,
          sourceModule:  undefined,
          payload:       payload ? JSON.parse(JSON.stringify(payload)) : {},
          createdAt:     new Date(),
        },
      });
      logger.debug(`[EventStore] Factory reset event recorded: FACTORY_RESET_${phase} for user ${userId}`);
    } catch (err: any) {
      // Non-fatal — we never let audit logging crash the reset operation
      logger.error(`[EventStore] Failed to record FACTORY_RESET_${phase}`, { userId, error: err.message });
    }
  }
}
