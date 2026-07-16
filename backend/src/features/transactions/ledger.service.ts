import { Decimal } from '@prisma/client/runtime/library';
import { PrismaTx, FinancialEventDispatcher, LedgerPostedEvent, LedgerSettledEvent, LedgerReversedEvent, LedgerTransferCompletedEvent } from './dispatcher';
import { AppError } from '../../utils/AppError';
import { LedgerStatus, LedgerReferenceType, SourceModule, LedgerDirection, FinancialEventType } from '../../db/prisma-client';
import { randomUUID } from 'crypto';

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
    // 1. Validation Rules
    if (legs.length === 0) {
      throw new LedgerError('LEDGER_IMBALANCED', 'Journal must have at least one transaction leg.');
    }

    // Validate account existence, non-zero values, and correct directions
    let debitSum = new Decimal(0);
    let creditSum = new Decimal(0);

    // Validate transfers
    const isTransfer = journal.referenceType === LedgerReferenceType.TRANSFER;
    if (isTransfer) {
      if (legs.length !== 2) {
        throw new LedgerError('LEDGER_INVALID_TRANSFER', 'A transfer must have exactly two transaction legs.');
      }
      const leg1 = legs[0];
      const leg2 = legs[1];
      const type1 = leg1.type.toUpperCase();
      const type2 = leg2.type.toUpperCase();

      if (!((type1 === 'TRANSFER_OUT' && type2 === 'TRANSFER_IN') || (type1 === 'TRANSFER_IN' && type2 === 'TRANSFER_OUT'))) {
        throw new LedgerError('LEDGER_INVALID_TRANSFER', 'A transfer must consist of exactly one TRANSFER_OUT leg and one TRANSFER_IN leg.');
      }

      if (leg1.accountId === leg2.accountId) {
        throw new LedgerError('LEDGER_INVALID_TRANSFER', 'Source and destination accounts for a transfer must be different.');
      }
    }

    for (const leg of legs) {
      const amountDec = new Decimal(leg.amount);
      if (amountDec.lessThanOrEqualTo(0)) {
        throw new LedgerError('LEDGER_INVALID_AMOUNT', 'Transaction amount must be a positive non-zero number.');
      }

      // Verify account existence
      const account = await tx.account.findFirst({
        where: { id: leg.accountId, userId: journal.userId, deletedAt: null }
      });
      if (!account) {
        throw new LedgerError('LEDGER_ACCOUNT_NOT_FOUND', `Account ${leg.accountId} not found or unauthorized.`);
      }

      const legTypeLower = leg.type.toLowerCase();
      if (legTypeLower === 'income' || legTypeLower === 'transfer_in') {
        debitSum = debitSum.add(amountDec);
      } else {
        creditSum = creditSum.add(amountDec);
      }
    }

    // If double-entry is active (e.g. transfer between two accounts), assert they balance
    const isDoubleEntry = legs.length > 1;
    if (isDoubleEntry && !debitSum.equals(creditSum)) {
      throw new LedgerError('LEDGER_IMBALANCED', `Double-entry journal must balance. Inflows (${debitSum}) !== Outflows (${creditSum}).`);
    }

    // 2. Idempotency Key Validation (Unique constraint across userId + sourceModule + idempotencyKey)
    const idempotencyKey = legs[0]?.idempotencyKey;
    if (idempotencyKey) {
      const existingTx = await tx.transaction.findFirst({
        where: {
          userId: journal.userId,
          sourceModule: journal.sourceModule,
          idempotencyKey
        },
        include: { journalEntry: true }
      });

      if (existingTx && existingTx.journalEntry) {
        console.log(`[Ledger] Idempotency hit: Returning existing JournalEntry ${existingTx.journalEntryId}`);
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
        const currentAccount = await tx.account.findUnique({ where: { id: leg.accountId } });
        if (!currentAccount) {
          throw new LedgerError('LEDGER_ACCOUNT_NOT_FOUND', `Account ${leg.accountId} was deleted mid-transaction.`);
        }

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

    // Increment Metrics & Defer post-commit events
    FinancialMetrics.increment('ledger_posted_total');

    if (isTransfer) {
      FinancialMetrics.increment('transfer_completed_total');
      const outLeg = createdTransactions.find(t => t.type.toUpperCase() === 'TRANSFER_OUT');
      const inLeg = createdTransactions.find(t => t.type.toUpperCase() === 'TRANSFER_IN');
      if (outLeg && inLeg) {
        FinancialEventDispatcher.defer(new LedgerTransferCompletedEvent(
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

    FinancialEventDispatcher.defer(new LedgerPostedEvent(
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

    if (pendingTx.status !== LedgerStatus.PENDING) {
      // Already settled/posted/reversed — return it (idempotency)
      return pendingTx;
    }

    const pendingAmount = new Decimal(pendingTx.amount);
    const settledAmount = new Decimal(settledAmountVal);

    if (settledAmount.greaterThan(pendingAmount)) {
      throw new LedgerError('LEDGER_INVALID_AMOUNT', `Settlement amount (${settledAmount.toFixed(2)}) cannot exceed pending amount (${pendingAmount.toFixed(2)}).`);
    }

    // 1. Cancel the original pending receivable by setting status = REVERSED
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: LedgerStatus.REVERSED,
        updatedAt: new Date()
      }
    });

    FinancialMetrics.increment('ledger_reversed_total');
    FinancialEventDispatcher.defer(new LedgerReversedEvent(
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

    // 3. Increment Cash Account balance by settledAmount
    const currentAccount = await tx.account.findUnique({ where: { id: accountId } });
    if (!currentAccount) {
      throw new LedgerError('LEDGER_ACCOUNT_NOT_FOUND', `Account ${accountId} not found.`);
    }
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

    FinancialEventDispatcher.defer(new LedgerSettledEvent(
      pendingTx.userId,
      settlementTx.id,
      pendingTx.journalEntryId || '',
      pendingTx.referenceId || '',
      pendingTx.referenceType || '',
      Number(settledAmount),
      Number(remainder)
    ));

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
