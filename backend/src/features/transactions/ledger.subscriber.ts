import { 
  FinancialEventDispatcher, 
  GoalContributionEvent, 
  GoalWithdrawalEvent,
  GroupExpenseCreatedEvent, 
  GroupSettlementCreatedEvent,
  InvestmentPurchasedEvent, 
  InvestmentRedeemedEvent,
  LoanDisbursedEvent, 
  LoanPaymentCreatedEvent 
} from './dispatcher';
import { FinancialLedgerService } from './ledger.service';
import { SourceModule, LedgerReferenceType } from '../../db/prisma-client';

export function initializeLedgerSubscriptions() {
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
    await FinancialLedgerService.postJournalEntry(
      tx,
      {
        userId: event.userId,
        sourceModule: SourceModule.GROUPS,
        referenceType: LedgerReferenceType.GROUP_EXPENSE,
        referenceId: event.groupExpenseId,
        description: `Group Expense: ${event.name}`,
        ...event.metadata
      },
      [{
        accountId: event.accountId,
        type: 'expense',
        amount: event.amount,
        category: event.category || 'Group Expense',
        description: `Expense: ${event.name}`,
        idempotencyKey: event.idempotencyKey
      }]
    );
  });

  // 4. Group Settlement
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
