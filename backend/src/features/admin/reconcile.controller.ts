import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getBudgetPeriodBounds } from '../budgets/budget.listener';

export interface ReconciliationReport {
  timestamp: Date;
  status: 'CLEAN' | 'DRIFT_DETECTED';
  summary: {
    totalAccountsAudited: number;
    accountsWithDrift: number;
    duplicateSequenceErrors: number;
    duplicateIdempotencyErrors: number;
    doubleEntryImbalances: number;
    crossUserIsolationViolations: number;
    transferImbalances: number;
    budgetDrifts: number;
    failedRecurringExecutions: number;
  };
  drifts: Array<{
    accountId: string;
    accountName: string;
    userId: string;
    expectedBalance: number;
    actualBalance: number;
    driftAmount: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }>;
  errors: string[];
}

export const reconcileLedger = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    console.log('[DEBUG-RECONCILE] Start');
    const report: ReconciliationReport = {
      timestamp: new Date(),
      status: 'CLEAN',
      summary: {
        totalAccountsAudited: 0,
        accountsWithDrift: 0,
        duplicateSequenceErrors: 0,
        duplicateIdempotencyErrors: 0,
        doubleEntryImbalances: 0,
        crossUserIsolationViolations: 0,
        transferImbalances: 0,
        budgetDrifts: 0,
        failedRecurringExecutions: 0
      },
      drifts: [],
      errors: []
    };

    // 1. Audit Account Balances and calculate drift
    const accounts = await prisma.account.findMany({
      where: { deletedAt: null }
    });
    console.log('[DEBUG-RECONCILE] Accounts loaded:', accounts.length);

    report.summary.totalAccountsAudited = accounts.length;

    // Fetch transaction sums grouped by accountId and type in a single query
    const transactionSums = await prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: {
        status: 'POSTED',
        deletedAt: null
      },
      _sum: { amount: true }
    });
    console.log('[DEBUG-RECONCILE] Group sums loaded:', transactionSums.length);

    // Map the sums for fast O(1) lookup
    const sumMap = new Map();
    for (const group of transactionSums) {
      const key = group.accountId;
      if (!key) continue;
      const current = sumMap.get(key) || { income: new Decimal(0), expense: new Decimal(0) };
      const amountVal = group._sum.amount ? new Decimal(group._sum.amount) : new Decimal(0);
      if (group.type === 'income') {
        current.income = amountVal;
      } else if (group.type === 'expense') {
        current.expense = amountVal;
      }
      sumMap.set(key, current);
    }

    for (const account of accounts) {
      const sums = sumMap.get(account.id) || { income: new Decimal(0), expense: new Decimal(0) };
      const openingBalance = new Decimal(account.openingBalance);

      const expected = openingBalance.plus(sums.income).minus(sums.expense);
      const actual = new Decimal(account.balance);

      if (!expected.equals(actual)) {
        const diff = actual.minus(expected).toNumber();
        const absDiff = Math.abs(diff);

        let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
        if (absDiff > 10000) severity = 'CRITICAL';
        else if (absDiff > 1000) severity = 'HIGH';
        else if (absDiff > 100) severity = 'MEDIUM';

        report.drifts.push({
          accountId: account.id,
          accountName: account.name,
          userId: account.userId,
          expectedBalance: expected.toNumber(),
          actualBalance: actual.toNumber(),
          driftAmount: diff,
          severity
        });
      }
    }
    console.log('[DEBUG-RECONCILE] Balances checked. Drifts found:', report.drifts.length);

    report.summary.accountsWithDrift = report.drifts.length;
    if (report.summary.accountsWithDrift > 0) {
      report.status = 'DRIFT_DETECTED';
    }

    // 2. Duplicate Sequence Errors check
    const duplicateSequences = await prisma.$queryRaw<{ sequenceNumber: string; count: number }[]>`
      SELECT "sequenceNumber", COUNT(*)::int as "count"
      FROM "Transaction"
      WHERE "sequenceNumber" IS NOT NULL AND "deletedAt" IS NULL
      GROUP BY "sequenceNumber"
      HAVING COUNT(*) > 1
    `;
    console.log('[DEBUG-RECONCILE] Duplicate sequences checked:', duplicateSequences.length);
    report.summary.duplicateSequenceErrors = duplicateSequences.length;
    for (const dup of duplicateSequences) {
      report.errors.push(`Duplicate sequence number detected: ${dup.sequenceNumber} (appears ${dup.count} times)`);
    }

    // 3. Duplicate Idempotency Key check
    const duplicateIdempotency = await prisma.$queryRaw<{ userId: string; sourceModule: string; idempotencyKey: string; count: number }[]>`
      SELECT "userId", "sourceModule", "idempotencyKey", COUNT(*)::int as "count"
      FROM "Transaction"
      WHERE "idempotencyKey" IS NOT NULL AND "deletedAt" IS NULL
      GROUP BY "userId", "sourceModule", "idempotencyKey"
      HAVING COUNT(*) > 1
    `;
    console.log('[DEBUG-RECONCILE] Duplicate idempotencies checked:', duplicateIdempotency.length);
    report.summary.duplicateIdempotencyErrors = duplicateIdempotency.length;
    for (const dup of duplicateIdempotency) {
      report.errors.push(`Duplicate idempotency key constraint violation: User ${dup.userId}, Module ${dup.sourceModule}, Key ${dup.idempotencyKey} (appears ${dup.count} times)`);
    }

    // 4. Double-Entry Journal Imbalances check
    const unbalancedJournals = await prisma.$queryRaw<{ journalId: string; debitSum: number; creditSum: number }[]>`
      SELECT t."journalEntryId" as "journalId",
             COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)::float as "debitSum",
             COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)::float as "creditSum"
      FROM "Transaction" t
      WHERE t."journalEntryId" IS NOT NULL AND t."deletedAt" IS NULL
      GROUP BY t."journalEntryId"
      HAVING COUNT(*) > 1 AND ABS(COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)) > 0.009
    `;
    console.log('[DEBUG-RECONCILE] Unbalanced journals checked:', unbalancedJournals.length);
    
    for (const journal of unbalancedJournals) {
      report.errors.push(`Imbalanced double-entry journal detected: Journal ${journal.journalId} has debits ${journal.debitSum} !== credits ${journal.creditSum}`);
    }
    report.summary.doubleEntryImbalances = unbalancedJournals.length;

    // 5. Cross-User Isolation check
    const isolationViolations = await prisma.$queryRaw<{ transactionId: string; journalId: string; txUser: string; jUser: string }[]>`
      SELECT t.id as "transactionId", j.id as "journalId", t."userId" as "txUser", j."userId" as "jUser"
      FROM "Transaction" t
      JOIN "JournalEntry" j ON t."journalEntryId" = j.id
      WHERE t."userId" <> j."userId" AND t."deletedAt" IS NULL
    `;
    console.log('[DEBUG-RECONCILE] Isolation violations checked:', isolationViolations.length);
    report.summary.crossUserIsolationViolations = isolationViolations.length;
    for (const violation of isolationViolations) {
      report.errors.push(`Cross-user isolation violation: Transaction ${violation.transactionId} (User ${violation.txUser}) linked to Journal ${violation.journalId} (User ${violation.jUser})`);
    }

    // 6. Transfer Audit (TRANSFER_OUT count == TRANSFER_IN count)
    const transferOutCount = await prisma.transaction.count({
      where: { type: 'TRANSFER_OUT', status: 'POSTED', deletedAt: null }
    });
    const transferInCount = await prisma.transaction.count({
      where: { type: 'TRANSFER_IN', status: 'POSTED', deletedAt: null }
    });
    if (transferOutCount !== transferInCount) {
      report.summary.transferImbalances = Math.abs(transferOutCount - transferInCount);
      report.errors.push(`Transfer imbalance: TRANSFER_OUT count (${transferOutCount}) does not match TRANSFER_IN count (${transferInCount})`);
    }

    // 7. Budget Audit (Budget spent snapshot == Ledger Aggregation)
    const budgets = await prisma.budget.findMany({
      where: { deletedAt: null }
    });
    let budgetDriftsCount = 0;
    for (const budget of budgets) {
      const bounds = getBudgetPeriodBounds(new Date(), budget.period);
      const aggregateResult = await prisma.transaction.aggregate({
        where: {
          userId: budget.userId,
          category: { equals: budget.category, mode: 'insensitive' },
          type: 'expense',
          status: 'POSTED',
          date: { gte: bounds.startDate, lte: bounds.endDate },
          deletedAt: null
        },
        _sum: { amount: true }
      });
      const ledgerSpent = aggregateResult._sum.amount ? new Decimal(aggregateResult._sum.amount) : new Decimal(0);
      const snapshotSpent = new Decimal(budget.spent);
      if (!ledgerSpent.equals(snapshotSpent)) {
        budgetDriftsCount++;
        report.errors.push(`Budget spent drift: User ${budget.userId}, Category ${budget.category} has snapshot spent ${snapshotSpent.toFixed(2)} !== ledger spent ${ledgerSpent.toFixed(2)}`);
        
        // Auto repair the budget snapshot
        await prisma.budget.update({
          where: { id: budget.id },
          data: { spent: ledgerSpent }
        });
      }
    }
    report.summary.budgetDrifts = budgetDriftsCount;

    // 8. Recurring Execution Audit (Failed and retrying executions)
    const failedExecutionsCount = await prisma.recurringExecution.count({
      where: {
        status: { in: ['FAILED', 'RETRYING'] }
      }
    });
    report.summary.failedRecurringExecutions = failedExecutionsCount;
    if (failedExecutionsCount > 0) {
      report.errors.push(`Failed or retrying recurring executions: ${failedExecutionsCount} items found in recurring_executions`);
    }

    if (report.errors.length > 0) {
      report.status = 'DRIFT_DETECTED';
    }

    console.log('[DEBUG-RECONCILE] Sending response');
    res.json({ success: true, data: report });
  } catch (error) {
    console.log('[DEBUG-RECONCILE] Error:', error);
    next(error);
  }
};
