import { PrismaClient } from '../../db/prisma-client';

export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export abstract class BaseFinancialEvent {
  abstract readonly eventType: string;
  abstract readonly sourceModule: 'TRANSACTIONS' | 'GROUPS' | 'GOALS' | 'INVESTMENTS' | 'LOANS' | 'SAVINGS' | 'OFFLINE_SYNC';
  readonly timestamp: Date = new Date();
  readonly eventVersion: number = 1;

  constructor(
    readonly userId: string,
    readonly metadata?: {
      createdBy?: string;
      createdFrom?: string;
      deviceId?: string;
      ipAddress?: string;
      requestId?: string;
      [key: string]: any;
    }
  ) {}
}

export class GoalContributionEvent extends BaseFinancialEvent {
  readonly eventType = 'GOAL_CONTRIBUTION';
  readonly sourceModule = 'GOALS';
  constructor(
    userId: string,
    readonly goalId: string,
    readonly accountId: string,
    readonly amount: number,
    readonly goalName: string,
    readonly isGroupGoal: boolean,
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class GoalWithdrawalEvent extends BaseFinancialEvent {
  readonly eventType = 'GOAL_WITHDRAWAL';
  readonly sourceModule = 'GOALS';
  constructor(
    userId: string,
    readonly goalId: string,
    readonly accountId: string,
    readonly amount: number,
    readonly goalName: string,
    readonly isGroupGoal: boolean,
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class GroupExpenseCreatedEvent extends BaseFinancialEvent {
  readonly eventType = 'GROUP_EXPENSE_CREATED';
  readonly sourceModule = 'GROUPS';
  constructor(
    userId: string,
    readonly groupExpenseId: string,
    readonly accountId: string,
    readonly amount: number,
    readonly name: string,
    readonly category: string,
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class GroupSettlementCreatedEvent extends BaseFinancialEvent {
  readonly eventType = 'GROUP_SETTLEMENT_CREATED';
  readonly sourceModule = 'GROUPS';
  constructor(
    userId: string,
    readonly groupExpenseId: string,
    readonly accountId: string,
    readonly amount: number,
    readonly memberName: string,
    readonly name: string,
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class GroupSettlementCompletedEvent extends BaseFinancialEvent {
  readonly eventType = 'GROUP_SETTLEMENT_COMPLETED';
  readonly sourceModule = 'GROUPS';
  constructor(
    userId: string,
    readonly groupExpenseId: string,
    readonly settlementId: string,
    readonly payerUserId: string | null,
    readonly receiverUserId: string,
    readonly amount: number,
    readonly accountId: string,
    readonly category: string,
    readonly description: string,
    readonly settledAt: Date,
    readonly idempotencyKey: string,
    readonly oldMemberId?: string | null,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class LedgerPostedEvent extends BaseFinancialEvent {
  readonly eventType = 'LEDGER_POSTED';
  readonly sourceModule = 'TRANSACTIONS';
  constructor(
    userId: string,
    readonly journalEntryId: string,
    readonly referenceId: string | null,
    readonly referenceType: string,
    readonly legs: {
      id: string;
      accountId: string;
      type: string;
      amount: number;
      category: string;
      description: string | null;
      status: string;
      idempotencyKey: string;
    }[],
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class LedgerSettledEvent extends BaseFinancialEvent {
  readonly eventType = 'LEDGER_SETTLED';
  readonly sourceModule = 'TRANSACTIONS';
  constructor(
    userId: string,
    readonly transactionId: string,
    readonly journalEntryId: string,
    readonly referenceId: string | null,
    readonly referenceType: string,
    readonly settledAmount: number,
    readonly remainingAmount: number,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class LedgerReversedEvent extends BaseFinancialEvent {
  readonly eventType = 'LEDGER_REVERSED';
  readonly sourceModule = 'TRANSACTIONS';
  constructor(
    userId: string,
    readonly transactionId: string,
    readonly journalEntryId: string,
    readonly reason?: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class LedgerTransferCompletedEvent extends BaseFinancialEvent {
  readonly eventType = 'LEDGER_TRANSFER_COMPLETED';
  readonly sourceModule = 'TRANSACTIONS';
  constructor(
    userId: string,
    readonly sourceAccountId: string,
    readonly destinationAccountId: string,
    readonly amount: number,
    readonly title: string,
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class InvestmentPurchasedEvent extends BaseFinancialEvent {
  readonly eventType = 'INVESTMENT_PURCHASED';
  readonly sourceModule = 'INVESTMENTS';
  constructor(
    userId: string,
    readonly investmentId: string,
    readonly accountId: string,
    readonly amount: number,
    readonly assetName: string,
    readonly assetType: string,
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class InvestmentRedeemedEvent extends BaseFinancialEvent {
  readonly eventType = 'INVESTMENT_REDEEMED';
  readonly sourceModule = 'INVESTMENTS';
  constructor(
    userId: string,
    readonly investmentId: string,
    readonly accountId: string,
    readonly amount: number,
    readonly assetName: string,
    readonly assetType: string,
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class LoanDisbursedEvent extends BaseFinancialEvent {
  readonly eventType = 'LOAN_DISBURSED';
  readonly sourceModule = 'LOANS';
  constructor(
    userId: string,
    readonly loanId: string,
    readonly accountId: string,
    readonly amount: number,
    readonly name: string,
    readonly type: 'borrowed' | 'lent',
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

export class LoanPaymentCreatedEvent extends BaseFinancialEvent {
  readonly eventType = 'LOAN_PAYMENT_CREATED';
  readonly sourceModule = 'LOANS';
  constructor(
    userId: string,
    readonly loanPaymentId: string,
    readonly loanId: string,
    readonly accountId: string,
    readonly amount: number,
    readonly name: string,
    readonly type: 'borrowed' | 'lent',
    readonly idempotencyKey: string,
    metadata?: BaseFinancialEvent['metadata']
  ) {
    super(userId, metadata);
  }
}

import { FinancialEventStore } from '../events/eventStore';

type Listener<T extends BaseFinancialEvent = any> = (tx: PrismaTx, event: T) => Promise<void>;

class EventDispatcher {
  private listeners: Map<string, Listener[]> = new Map();
  private deferredEvents: any[] = [];

  subscribe<T extends BaseFinancialEvent>(eventType: string, listener: Listener<T>) {
    const list = this.listeners.get(eventType) ?? [];
    list.push(listener);
    this.listeners.set(eventType, list);
  }

  async publish(tx: PrismaTx, event: BaseFinancialEvent): Promise<void> {
    // Record to Event Store inside the active transaction
    await FinancialEventStore.record(tx, event);

    const list = this.listeners.get(event.eventType);
    if (!list || list.length === 0) return;
    for (const listener of list) {
      await listener(tx, event);
    }
  }

  async defer(tx: PrismaTx, event: BaseFinancialEvent): Promise<void> {
    // Record to Event Store inside the active transaction
    await FinancialEventStore.record(tx, event);

    this.deferredEvents.push(event);
  }

  async flushDeferred(): Promise<void> {
    const events = [...this.deferredEvents];
    this.deferredEvents = [];
    if (events.length === 0) return;
    
    // We defer the loading of prisma client to avoid circular imports.
    const { prisma } = require('../../db/prisma');
    for (const event of events) {
      const list = this.listeners.get(event.eventType);
      if (!list || list.length === 0) continue;
      for (const listener of list) {
        try {
          await listener(prisma, event);
        } catch (error) {
          console.error(`[EventDispatcher] Failed to execute listener for event ${event.eventType}:`, error);
        }
      }
    }
  }
}

export const FinancialEventDispatcher = new EventDispatcher();
