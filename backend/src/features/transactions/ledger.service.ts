import { Decimal } from '@prisma/client/runtime/library';
import { PrismaTx } from './dispatcher';
import { AppError } from '../../utils/AppError';
import { LedgerStatus, LedgerReferenceType, SourceModule, LedgerDirection, FinancialEventType } from '../../db/prisma-client';

export interface LedgerLeg {
  accountId: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  idempotencyKey?: string;
  metadata?: any;
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
}

export class LedgerError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

export class FinancialLedgerService {
  /**
   * Helper to check if the new ledger V2 system is active
   */
  static isEnabled(): boolean {
    return process.env.LEDGER_V2_ENABLED === 'true';
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

      if (leg.type === 'income') {
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

    // 3. Create the JournalEntry
    const journalEntry = await tx.journalEntry.create({
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

    // 4. Create each Transaction leg and update Account balances
    for (const leg of legs) {
      const seqNum = await this.generateSequenceNumber(tx);
      const amountDec = new Decimal(leg.amount);

      // Save Transaction row
      await tx.transaction.create({
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
          direction: leg.type === 'income' ? LedgerDirection.INFLOW : LedgerDirection.OUTFLOW,
          eventType: FinancialEventType.CREATE,
          idempotencyKey: leg.idempotencyKey || null,
          journalEntryId: journalEntry.id,
          status: LedgerStatus.POSTED,
          sequenceNumber: seqNum,
          metadata: leg.metadata || undefined
        }
      });

      // Update Account balance atomically
      const currentAccount = await tx.account.findUnique({ where: { id: leg.accountId } });
      if (!currentAccount) {
        throw new LedgerError('LEDGER_ACCOUNT_NOT_FOUND', `Account ${leg.accountId} was deleted mid-transaction.`);
      }

      const balanceDec = new Decimal(currentAccount.balance);
      const nextBalance = leg.type === 'income' 
        ? balanceDec.plus(amountDec) 
        : balanceDec.minus(amountDec);

      await tx.account.update({
        where: { id: leg.accountId },
        data: { balance: nextBalance }
      });
    }

    return journalEntry;
  }
}
