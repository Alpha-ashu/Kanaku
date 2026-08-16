import { 
  FinancialEventDispatcher, 
  GoalContributionEvent, 
  GoalWithdrawalEvent,
  GroupExpenseCreatedEvent, 
  GroupSettlementCreatedEvent,
  GroupSettlementCompletedEvent,
  InvestmentPurchasedEvent, 
  InvestmentRedeemedEvent,
  LoanDisbursedEvent, 
  LoanPaymentCreatedEvent 
} from './dispatcher';
import { FinancialLedgerService } from './ledger.service';
// Decimal lives at Prisma.Decimal at runtime, not as a top-level export.
import { Prisma, SourceModule, LedgerReferenceType, LedgerStatus, FinancialEventType } from '../../db/prisma-client';
const { Decimal } = Prisma;
import { dispatchNotification } from '../notifications/notification.dispatcher';
import { FinancialSnapshotService } from '../snapshots/snapshotService';


export function initializeLedgerSubscriptions() {
  // Initialize Snapshot Service listener
  FinancialSnapshotService.init();

  // 1. Goal Contribution
  FinancialEventDispatcher.subscribe<GoalContributionEvent>('GOAL_CONTRIBUTION', async (tx, event) => {
    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.GOALS,
        referenceType: event.isGroupGoal ? LedgerReferenceType.GROUP_GOAL : LedgerReferenceType.GOAL,
        referenceId: event.goalId,
        description: `Goal contribution: ${event.goalName}`,
        ...event.metadata
      },
      [{
        accountId: event.accountId,
        type: 'expense',
        amount: event.amount,
        category: 'Savings Goal',
        description: `Contribution to ${event.goalName}`,
        idempotencyKey: event.idempotencyKey
      }]
    );
  });

  // 2. Goal Withdrawal
  FinancialEventDispatcher.subscribe<GoalWithdrawalEvent>('GOAL_WITHDRAWAL', async (tx, event) => {
    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.GOALS,
        referenceType: event.isGroupGoal ? LedgerReferenceType.GROUP_GOAL : LedgerReferenceType.GOAL,
        referenceId: event.goalId,
        description: `Goal withdrawal: ${event.goalName}`,
        ...event.metadata
      },
      [{
        accountId: event.accountId,
        type: 'income',
        amount: event.amount,
        category: 'Goal Withdrawal',
        description: `Withdrawal from ${event.goalName}`,
        idempotencyKey: event.idempotencyKey
      }]
    );
  });

  // 3. Group Expense
  FinancialEventDispatcher.subscribe<GroupExpenseCreatedEvent>('GROUP_EXPENSE_CREATED', async (tx, event) => {
    // 1. Fetch group members to build legs
    const members = await tx.groupExpenseMember.findMany({
      where: { groupExpenseId: event.groupExpenseId, deletedAt: null }
    });

    let participantsShareSum = new Decimal(0);
    const legs: import('./ledger.service').LedgerLeg[] = [];

    // Outflow leg (totalAmount, POSTED)
    legs.push({
      accountId: event.accountId,
      type: 'expense' as const,
      amount: event.amount,
      category: event.category || 'Group Expense',
      description: `${event.name} (Group Expense)`,
      idempotencyKey: event.idempotencyKey,
      status: LedgerStatus.POSTED
    });

    // Inflow legs for friends (PENDING)
    for (const m of members) {
      if (m.userId === event.userId || m.name.toLowerCase() === 'you' || m.name.toLowerCase() === 'creator') {
        continue;
      }
      const shareDec = new Decimal(m.shareAmount);
      participantsShareSum = participantsShareSum.add(shareDec);

      legs.push({
        accountId: event.accountId,
        type: 'income' as const,
        amount: Number(m.shareAmount),
        category: event.category || 'Group Expense',
        description: `Receivable from ${m.name} for ${event.name}`,
        idempotencyKey: `group-receivable-${event.groupExpenseId}-${m.id}`,
        status: LedgerStatus.PENDING,
        metadata: { memberId: m.id }
      });
    }

    // Payer's own share offset leg (POSTED, skipBalanceUpdate = true, category = 'Personal Share Offset')
    const creatorShare = new Decimal(event.amount).minus(participantsShareSum);
    if (creatorShare.greaterThan(0)) {
      legs.push({
        accountId: event.accountId,
        type: 'income' as const,
        amount: creatorShare.toNumber(),
        category: 'Personal Share Offset',
        description: `${event.name} (Own Share Offset)`,
        idempotencyKey: `group-creator-offset-${event.groupExpenseId}`,
        status: LedgerStatus.POSTED,
        skipBalanceUpdate: true
      });
    }

    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.GROUPS,
        referenceType: LedgerReferenceType.GROUP_EXPENSE,
        referenceId: event.groupExpenseId,
        description: `${event.name} (Group Expense Creation)`,
        ...event.metadata
      },
      legs
    );
  });

  // 4. Group Settlement Completed
  FinancialEventDispatcher.subscribe<GroupSettlementCompletedEvent>('GROUP_SETTLEMENT_COMPLETED', async (tx, event) => {
    // Find the original pending receivable leg matching group-receivable-${groupExpenseId}-${settlementId}
    const searchMemberId = event.oldMemberId || event.settlementId;
    const originalLeg = await tx.transaction.findFirst({
      where: {
        userId: event.receiverUserId,
        idempotencyKey: `group-receivable-${event.groupExpenseId}-${searchMemberId}`
      }
    });

    if (originalLeg) {
      let pendingTx: any = null;
      if (originalLeg.status === LedgerStatus.PENDING) {
        pendingTx = originalLeg;
      } else {
        // Find the active pending remainder leg
        pendingTx = await tx.transaction.findFirst({
          where: {
            userId: event.receiverUserId,
            journalEntryId: originalLeg.journalEntryId,
            status: LedgerStatus.PENDING,
            type: originalLeg.type,
            accountId: originalLeg.accountId
          }
        });
      }

      if (pendingTx) {
        const amountToSettle = Math.min(event.amount, Number(pendingTx.amount));
        await FinancialLedgerService.settleJournalEntryLeg(
          tx,
          event.receiverUserId,
          pendingTx.id,
          event.accountId,
          amountToSettle,
          FinancialEventType.SETTLEMENT
        );
      }
    }

    // Trigger structured notifications atomically
    const amountStr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(event.amount).replace('INR', '₹').trim();
    const dateStr = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(event.settledAt);

    // Calculate outstanding receivable
    const pendingMembers = await tx.groupExpenseMember.findMany({
      where: { groupExpenseId: event.groupExpenseId, hasPaid: false, deletedAt: null }
    });
    const outstandingVal = pendingMembers.reduce((sum, m) => sum + Number(m.shareAmount), 0);
    const outstandingStr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(outstandingVal).replace('INR', '₹').trim();

    // 1. Notify the payer
    if (event.payerUserId) {
      const payer = await tx.user.findUnique({ where: { id: event.payerUserId } });
      const receiver = await tx.user.findUnique({ where: { id: event.receiverUserId } });
      if (payer && receiver) {
        const payerRequestKey = `GROUP_SETTLEMENT:${event.groupExpenseId}:${event.settlementId}:PAYER`;
        const emailMsg = `Hi ${payer.name},\n\nYour payment of ${amountStr} for ${event.description.replace('Settlement Received - ', '')} has been successfully recorded.\n\nPaid To:\n${receiver.name}\n\nAmount\n${amountStr}\n\nDate\n${dateStr}\n\nStatus\nPaid`;

        await dispatchNotification({
          userId: event.payerUserId,
          sourceUserId: event.receiverUserId,
          title: 'Payment Recorded',
          message: `You paid ${amountStr} for ${event.description.replace('Settlement Received - ', '')} to ${receiver.name}.`,
          type: 'group_expense',
          category: 'group_expense',
          deepLink: '/groups',
          priority: 'normal',
          channels: ['app', 'email', 'push'],
          requestId: payerRequestKey,
          metadata: {
            pushTitle: 'Payment recorded',
            pushBody: `You paid ${amountStr} for ${event.description.replace('Settlement Received - ', '')} to ${receiver.name}.`,
            emailTitle: 'Group Expense Settled',
            emailBody: emailMsg
          }
        }, tx);
      }
    }

    // 2. Notify the creator (receiver)
    const payerName = event.payerUserId 
      ? (await tx.user.findUnique({ where: { id: event.payerUserId } }))?.name 
      : (await tx.groupExpenseMember.findUnique({ where: { id: event.settlementId } }))?.name;
      
    if (payerName) {
      const creatorRequestKey = `GROUP_SETTLEMENT:${event.groupExpenseId}:${event.settlementId}:CREATOR`;
      await dispatchNotification({
        userId: event.receiverUserId,
        sourceUserId: event.payerUserId || undefined,
        title: 'Settlement Received',
        message: `${payerName} paid ${amountStr} for ${event.description.replace('Settlement Received - ', '')}. Outstanding: ${outstandingStr}.`,
        type: 'group_expense',
        category: 'group_expense',
        deepLink: '/groups',
        priority: 'normal',
        channels: ['app', 'push'],
        requestId: creatorRequestKey,
        metadata: {
          pushTitle: 'Settlement Received',
          pushBody: `${payerName} paid ${amountStr} for ${event.description.replace('Settlement Received - ', '')}.`
        }
      }, tx);
    }
  });

  // 4. Old Group Settlement (retained for backward compatibility)
  FinancialEventDispatcher.subscribe<GroupSettlementCreatedEvent>('GROUP_SETTLEMENT_CREATED', async (tx, event) => {
    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.GROUPS,
        referenceType: LedgerReferenceType.GROUP_SETTLEMENT,
        referenceId: event.groupExpenseId,
        description: `Settlement from ${event.memberName} for ${event.name}`,
        ...event.metadata
      },
      [{
        accountId: event.accountId,
        type: 'income',
        amount: event.amount,
        category: 'Group Settlement',
        description: `Settlement from ${event.memberName}`,
        idempotencyKey: event.idempotencyKey
      }]
    );
  });


  // 5. Investment Purchase
  FinancialEventDispatcher.subscribe<InvestmentPurchasedEvent>('INVESTMENT_PURCHASED', async (tx, event) => {
    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.INVESTMENTS,
        referenceType: LedgerReferenceType.INVESTMENT,
        referenceId: event.investmentId,
        description: `Investment purchase: ${event.assetName} (${event.assetType})`,
        ...event.metadata
      },
      [{
        accountId: event.accountId,
        type: 'expense',
        amount: event.amount,
        category: 'Investment',
        description: `Purchased ${event.assetName}`,
        idempotencyKey: event.idempotencyKey
      }]
    );
  });

  // 6. Investment Redemption
  FinancialEventDispatcher.subscribe<InvestmentRedeemedEvent>('INVESTMENT_REDEEMED', async (tx, event) => {
    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.INVESTMENTS,
        referenceType: LedgerReferenceType.INVESTMENT,
        referenceId: event.investmentId,
        description: `Investment redemption: ${event.assetName}`,
        ...event.metadata
      },
      [{
        accountId: event.accountId,
        type: 'income',
        amount: event.amount,
        category: 'Investment Redemption',
        description: `Redeemed ${event.assetName}`,
        idempotencyKey: event.idempotencyKey
      }]
    );
  });

  // 7. Loan Disbursed
  FinancialEventDispatcher.subscribe<LoanDisbursedEvent>('LOAN_DISBURSED', async (tx, event) => {
    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.LOANS,
        referenceType: LedgerReferenceType.LOAN,
        referenceId: event.loanId,
        description: `Loan disbursement: ${event.name}`,
        ...event.metadata
      },
      [{
        accountId: event.accountId,
        type: event.type === 'borrowed' ? 'income' : 'expense',
        amount: event.amount,
        category: 'Loan',
        description: `Disbursement for ${event.name}`,
        idempotencyKey: event.idempotencyKey
      }]
    );
  });

  // 8. Loan Payment EMI
  FinancialEventDispatcher.subscribe<LoanPaymentCreatedEvent>('LOAN_PAYMENT_CREATED', async (tx, event) => {
    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.LOANS,
        referenceType: LedgerReferenceType.LOAN_PAYMENT,
        referenceId: event.loanPaymentId,
        description: `Loan payment: ${event.name}`,
        ...event.metadata
      },
      [{
        accountId: event.accountId,
        type: event.type === 'borrowed' ? 'expense' : 'income',
        amount: event.amount,
        category: 'Loan EMI',
        description: `Payment for ${event.name}`,
        idempotencyKey: event.idempotencyKey
      }]
    );
  });
}
