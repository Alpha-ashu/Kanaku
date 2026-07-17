import { Decimal } from '@prisma/client/runtime/library';
import { PrismaTx, FinancialEventDispatcher, LedgerPostedEvent, LedgerSettledEvent, LedgerReversedEvent, LedgerTransferCompletedEvent } from './dispatcher';
import { AppError } from '../../utils/AppError';
import { LedgerStatus, LedgerReferenceType, SourceModule, LedgerDirection, FinancialEventType } from '../../db/prisma-client';
import { randomUUID } from 'crypto';
import { cacheDeleteByUserId, cacheInvalidationCount } from '../../cache/redis';
import { logger } from '../../config/logger';
import {
  ledgerPostTotal,
  ledgerPostFailedTotal,
  journalBalanceErrorsTotal,
  groupSettlementTotal,
  databaseTransactionDuration,
} from '../../config/metrics';
import { getRequestActor } from '../../middleware/requestContext';
import { FinancialInvariantValidator } from '../../utils/financialInvariantValidator';

export interface LedgerLeg {
  accountId: string;
  type: 'income' | 'expense' | 'transfer_in' | 'transfer_out' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  amount: number;
  category: string;
  description: string;
  idempotencyKey?: string;
  metadata?: any;
  status?: LedgerStatus;
  skipBalanceUpdate?: boolean;
}

export interface JournalParams {
  userId: string;
  sourceModule: SourceModule;
  referenceType: LedgerReferenceType;
  referenceId?: string;
  description?: string;
  createdBy?: string;
  createdFrom?: string;
  deviceId?: string;
  ipAddress?: string;
  requestId?: string;
  journalEntryId?: string;
  metadata?: any;
}

export class LedgerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

export class FinancialLedgerService {
  /**
   * Helper to check if the new ledger V2 system is active, optionally for a specific feature
   */
  static isEnabled(feature?: string): boolean {
    const isV2 = process.env.LEDGER_V2_ENABLED === 'true';
    if (!isV2) return false;
    if (!feature) return true;

    if (feature === 'groups') return process.env.LEDGER_GROUPS_ENABLED !== 'false';
    if (feature === 'goals') return process.env.LEDGER_GOALS_ENABLED !== 'false';
    if (feature === 'investments') return process.env.LEDGER_INVESTMENTS_ENABLED !== 'false';
    if (feature === 'loans') return process.env.LEDGER_LOANS_ENABLED !== 'false';
    return true;
  }

  /**
   * Generates a sequential transaction sequence number in the format: LED-YYYY-XXXXXXXX
   */
  private static async generateSequenceNumber(tx: PrismaTx): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `LED-${currentYear}-`;

    const lastTx = await tx.transaction.findFirst({
      where: { sequenceNumber: { startsWith: prefix } },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true }
    });

    let nextNum = 1;
    if (lastTx && lastTx.sequenceNumber) {
      const parts = lastTx.sequenceNumber.split('-');
      if (parts.length === 3) {
        nextNum = parseInt(parts[2], 10) + 1;
      }
    }

    return `${prefix}${String(nextNum).padStart(8, '0')}`;
  }

  /**
   * Centralized method to post a Journal Entry and its underlying transaction legs atomically
   */
  static async postJournalEntry(
    tx: PrismaTx,
    journal: JournalParams,
    legs: LedgerLeg[]
  ) {
    const opStart = Date.now();
    const actor = getRequestActor();
    // 1. Invariant Validation Rules (includes leg count, transfers, positive amounts, account ownership)
    const accounts = await FinancialInvariantValidator.validateJournalLegs(tx, journal, legs);
    const isTransfer = journal.referenceType === LedgerReferenceType.TRANSFER;
    const isDoubleEntry = legs.length > 1;

    // 2. Idempotency Key Validation
    const idempotencyKey = legs[0]?.idempotencyKey;
    if (idempotencyKey) {
      const existingTx = await FinancialInvariantValidator.checkIdempotencyKey(
        tx,
        journal.userId,
        journal.sourceModule,
        idempotencyKey
      );

      if (existingTx && existingTx.journalEntry) {
        logger.info('[Ledger] Idempotency hit — returning existing journal entry', {
          journalEntryId: existingTx.journalEntry.id,
          userId: journal.userId,
          idempotencyKey,
          correlationId: actor.correlationId,
        });
        return existingTx.journalEntry;
      }
    }

    // 3. Create or reuse the JournalEntry
    let journalEntry;
    if (journal.journalEntryId) {
      journalEntry = await tx.journalEntry.findUnique({
        where: { id: journal.journalEntryId }
      });
    }

    if (!journalEntry) {
      journalEntry = await tx.journalEntry.create({
        data: {
          userId: journal.userId,
          sourceModule: journal.sourceModule,
          referenceType: journal.referenceType,
          referenceId: journal.referenceId || null,
          status: LedgerStatus.POSTED,
          description: journal.description || null,
          createdBy: journal.createdBy || null,
          createdFrom: journal.createdFrom || null,
          deviceId: journal.deviceId || null,
          ipAddress: journal.ipAddress || null,
          requestId: journal.requestId || null
        }
      });
    }

    const createdTransactions: any[] = [];

    // 4. Create each Transaction leg and update Account balances
    for (const leg of legs) {
      const seqNum = await this.generateSequenceNumber(tx);
      const amountDec = new Decimal(leg.amount);
      const legStatus = leg.status || LedgerStatus.POSTED;
      const legTypeLower = leg.type.toLowerCase();

      // Save Transaction row
      const createdTx = await tx.transaction.create({
        data: {
          userId: journal.userId,
          accountId: leg.accountId,
          type: leg.type,
          amount: amountDec,
          category: leg.category,
          description: leg.description,
          date: new Date(),
          syncStatus: 'synced',
          synced: true,
          referenceType: journal.referenceType,
          referenceId: journal.referenceId || null,
          sourceModule: journal.sourceModule,
          direction: (legTypeLower === 'income' || legTypeLower === 'transfer_in') ? LedgerDirection.INFLOW : LedgerDirection.OUTFLOW,
          eventType: FinancialEventType.CREATE,
          idempotencyKey: leg.idempotencyKey || null,
          journalEntryId: journalEntry.id,
          status: legStatus,
          sequenceNumber: seqNum,
          metadata: leg.metadata ? JSON.parse(JSON.stringify(leg.metadata)) : undefined
        }
      });

      createdTransactions.push(createdTx);

      // Update Account balance atomically (skip if status is PENDING or skipBalanceUpdate = true)
      const shouldUpdateBalance = legStatus === LedgerStatus.POSTED && !leg.skipBalanceUpdate;
      if (shouldUpdateBalance) {
        const currentAccount = accounts.get(leg.accountId);
        FinancialInvariantValidator.assertAccountNotDeleted(currentAccount, leg.accountId);

        const balanceDec = new Decimal(currentAccount.balance);
        const nextBalance = (legTypeLower === 'income' || legTypeLower === 'transfer_in')
          ? balanceDec.plus(amountDec)
          : balanceDec.minus(amountDec);

        await tx.account.update({
          where: { id: leg.accountId },
          data: { balance: nextBalance }
        });
      }
    }

    // Increment Prometheus Metrics & Defer post-commit events
    ledgerPostTotal.inc();
    FinancialMetrics.increment('ledger_posted_total');

    // Structured audit trail for this journal posting
    const opDurationMs = Date.now() - opStart;
    databaseTransactionDuration.observe({ operation: 'postJournalEntry' }, opDurationMs / 1000);
    logger.info('[Ledger] Journal entry posted', {
      module: 'Ledger',
      operation: 'PostJournalEntry',
      journalId: journalEntry.id,
      userId: journal.userId,
      sourceModule: journal.sourceModule,
      referenceType: journal.referenceType,
      referenceId: journal.referenceId,
      transactionIds: createdTransactions.map(t => t.id),
      legCount: legs.length,
      isDoubleEntry,
      isTransfer,
      durationMs: opDurationMs,
      correlationId: actor.correlationId,
      requestId: actor.requestId ?? journal.requestId,
      result: 'SUCCESS',
    });

    if (isTransfer) {
      FinancialMetrics.increment('transfer_completed_total');
      const outLeg = createdTransactions.find(t => t.type.toUpperCase() === 'TRANSFER_OUT');
      const inLeg = createdTransactions.find(t => t.type.toUpperCase() === 'TRANSFER_IN');
      if (outLeg && inLeg) {
        await FinancialEventDispatcher.defer(tx, new LedgerTransferCompletedEvent(
          journal.userId,
          outLeg.accountId,
          inLeg.accountId,
          Number(outLeg.amount),
          journal.description || 'Account Transfer',
          journal.referenceId || randomUUID(),
          journal.metadata
        ));
      }
    }

    await FinancialEventDispatcher.defer(tx, new LedgerPostedEvent(
      journal.userId,
      journalEntry.id,
      journal.referenceId || null,
      journal.referenceType,
      createdTransactions.map(t => ({
        id: t.id,
        accountId: t.accountId,
        type: t.type,
        amount: Number(t.amount),
        category: t.category,
        description: t.description,
        status: t.status,
        idempotencyKey: t.idempotencyKey || ''
      })),
      journal.metadata
    ));

    await cacheDeleteByUserId(journal.userId);

    return journalEntry;
  }

  /**
   * Settle a pending receivable leg of a Journal Entry using an append-only method
   */
  static async settleJournalEntryLeg(
    tx: PrismaTx,
    userId: string,
    transactionId: string,
    accountId: string,
    settledAmountVal: number,
    eventType: FinancialEventType = FinancialEventType.SETTLEMENT
  ) {
    const pendingTx = await tx.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!pendingTx) {
      throw new LedgerError('LEDGER_TRANSACTION_NOT_FOUND', `Transaction ${transactionId} not found.`);
    }

    // Guard 1: Cross-user reference guard
    FinancialInvariantValidator.assertSameUser(pendingTx.userId, userId, 'transaction');

    if (pendingTx.status !== LedgerStatus.PENDING) {
      // Already settled/posted/reversed — return it (idempotency)
      return pendingTx;
    }

    const pendingAmount = new Decimal(pendingTx.amount);
    const settledAmount = new Decimal(settledAmountVal);

    // Guard 2: Settlement amount check (must be positive and cannot exceed pending)
    FinancialInvariantValidator.assertSettlementAmount(settledAmount, pendingAmount, transactionId);

    // 1. Cancel the original pending receivable by setting status = REVERSED
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: LedgerStatus.REVERSED,
        updatedAt: new Date()
      }
    });

    FinancialMetrics.increment('ledger_reversed_total');
    await FinancialEventDispatcher.defer(tx, new LedgerReversedEvent(
      pendingTx.userId,
      pendingTx.id,
      pendingTx.journalEntryId || '',
      'Leg settled'
    ));

    // 2. Append the new actual cash inflow (POSTED)
    const seqNumInflow = await this.generateSequenceNumber(tx);
    const settlementTx = await tx.transaction.create({
      data: {
        id: randomUUID(),
        userId: pendingTx.userId,
        accountId,
        type: 'income',
        amount: settledAmount,
        category: pendingTx.category,
        subcategory: pendingTx.subcategory,
        description: (pendingTx.description || '').replace('Receivable from', 'Settlement Received -').replace('for', 'from'),
        date: new Date(),
        referenceType: LedgerReferenceType.GROUP_SETTLEMENT,
        referenceId: pendingTx.referenceId,
        sourceModule: SourceModule.GROUPS,
        direction: LedgerDirection.INFLOW,
        eventType,
        status: LedgerStatus.POSTED,
        idempotencyKey: `settlement-posted-${pendingTx.id}-${settledAmount.toFixed(2)}`,
        journalEntryId: pendingTx.journalEntryId,
        sequenceNumber: seqNumInflow,
        metadata: pendingTx.metadata ? JSON.parse(JSON.stringify(pendingTx.metadata)) : undefined
      }
    });

    FinancialMetrics.increment('ledger_settled_total');
    groupSettlementTotal.inc();

    // 3. Guard 3 & 4: verify account existence and ownership before incrementing balance
    const currentAccount = await FinancialInvariantValidator.assertAccountOwned(tx, accountId, userId);
    const balanceDec = new Decimal(currentAccount.balance);
    await tx.account.update({
      where: { id: accountId },
      data: { balance: balanceDec.plus(settledAmount) }
    });

    // 4. If partially settled, append a new pending receivable for the remainder!
    const remainder = pendingAmount.minus(settledAmount);
    if (settledAmount.lessThan(pendingAmount)) {
      const seqNumRemainder = await this.generateSequenceNumber(tx);
      await tx.transaction.create({
        data: {
          id: randomUUID(),
          userId: pendingTx.userId,
          accountId,
          type: 'income',
          amount: remainder,
          category: pendingTx.category,
          subcategory: pendingTx.subcategory,
          description: pendingTx.description + ' (Remaining)',
          date: new Date(),
          referenceType: pendingTx.referenceType,
          referenceId: pendingTx.referenceId,
          sourceModule: pendingTx.sourceModule,
          direction: pendingTx.direction,
          eventType: pendingTx.eventType,
          status: LedgerStatus.PENDING,
          idempotencyKey: `settlement-remainder-${pendingTx.id}-${remainder.toFixed(2)}`,
          journalEntryId: pendingTx.journalEntryId,
          sequenceNumber: seqNumRemainder,
          metadata: pendingTx.metadata ? JSON.parse(JSON.stringify(pendingTx.metadata)) : undefined
        }
      });
    }

    await FinancialEventDispatcher.defer(tx, new LedgerSettledEvent(
      pendingTx.userId,
      settlementTx.id,
      pendingTx.journalEntryId || '',
      pendingTx.referenceId || '',
      pendingTx.referenceType || '',
      Number(settledAmount),
      Number(remainder)
    ));

    await cacheDeleteByUserId(userId);

    return settlementTx;
  }
}

export const FinancialMetrics = {
  counters: {
    ledger_posted_total: 0,
    ledger_reversed_total: 0,
    ledger_settled_total: 0,
    recurring_success_total: 0,
    recurring_failed_total: 0,
    transfer_completed_total: 0,
    budget_alert_total: 0
  },
  increment(metricName: keyof typeof FinancialMetrics.counters) {
    if (FinancialMetrics.counters[metricName] !== undefined) {
      FinancialMetrics.counters[metricName]++;
      console.log(`[Metrics] ${String(metricName)} incremented to ${FinancialMetrics.counters[metricName]}`);
    }
  }
};
