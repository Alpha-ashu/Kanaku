import { prisma } from '../src/db/prisma';
import { logger } from '../src/config/logger';
import dotenv from 'dotenv';

dotenv.config();

export interface DuplicateReport {
  timestamp: string;
  transactions: {
    totalScanned: number;
    duplicateGroupsFound: number;
    duplicateRowsCount: number;
    details: Array<{
      userId: string;
      category: string;
      amount: string;
      date: string;
      count: number;
      ids: string[];
    }>;
  };
  budgetAlerts: {
    totalScanned: number;
    duplicateGroupsFound: number;
    duplicateRowsCount: number;
    details: Array<{
      userId: string;
      category: string | null;
      period: string | null;
      count: number;
      ids: string[];
    }>;
  };
  recurringExecutions: {
    totalScanned: number;
    duplicateGroupsFound: number;
    duplicateRowsCount: number;
    details: Array<{
      ruleId: string;
      scheduledDate: string;
      count: number;
      ids: string[];
    }>;
  };
}

/**
 * Scans the database for duplicate transactions, duplicate budget alerts,
 * and duplicate recurring rule executions.
 *
 * Safe & read-only by default.
 */
export async function detectDuplicates(): Promise<DuplicateReport> {
  console.log('=== KANAKU DATA INTEGRITY AUDIT: DUPLICATE DETECTION ===\n');

  // 1. Audit Transactions
  console.log('1. Auditing Transactions for duplicates...');
  const allTx = await prisma.transaction.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      userId: true,
      amount: true,
      category: true,
      description: true,
      date: true,
      dedupHash: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const txGroups = new Map<string, typeof allTx>();
  for (const tx of allTx) {
    // Fingerprint by userId + amount + date(YYYY-MM-DD) + category + description
    const dateStr = tx.date.toISOString().slice(0, 10);
    const key = `${tx.userId}:${tx.amount}:${dateStr}:${tx.category}:${tx.description || ''}`;
    const existing = txGroups.get(key) || [];
    existing.push(tx);
    txGroups.set(key, existing);
  }

  const duplicateTxGroups: DuplicateReport['transactions']['details'] = [];
  let duplicateTxRowCount = 0;

  for (const [key, rows] of txGroups.entries()) {
    if (rows.length > 1) {
      duplicateTxRowCount += (rows.length - 1);
      duplicateTxGroups.push({
        userId: rows[0].userId,
        category: rows[0].category,
        amount: rows[0].amount.toString(),
        date: rows[0].date.toISOString().slice(0, 10),
        count: rows.length,
        ids: rows.map(r => r.id),
      });
    }
  }

  console.log(`   Scanned ${allTx.length} transactions. Found ${duplicateTxGroups.length} duplicate groups (${duplicateTxRowCount} excess rows).\n`);

  // 2. Audit Budget Alerts
  console.log('2. Auditing Budget Alerts for duplicates...');
  const allAlerts = await prisma.notification.findMany({
    where: {
      type: 'budget_alert',
      deletedAt: null,
    },
    select: {
      id: true,
      userId: true,
      category: true,
      title: true,
      message: true,
      createdAt: true,
      dedupKey: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const alertGroups = new Map<string, typeof allAlerts>();
  for (const alert of allAlerts) {
    const monthKey = alert.createdAt.toISOString().slice(0, 7); // YYYY-MM
    const key = `${alert.userId}:${alert.category || 'all'}:${monthKey}`;
    const existing = alertGroups.get(key) || [];
    existing.push(alert);
    alertGroups.set(key, existing);
  }

  const duplicateAlertGroups: DuplicateReport['budgetAlerts']['details'] = [];
  let duplicateAlertRowCount = 0;

  for (const [key, rows] of alertGroups.entries()) {
    if (rows.length > 1) {
      duplicateAlertRowCount += (rows.length - 1);
      const parts = key.split(':');
      duplicateAlertGroups.push({
        userId: parts[0],
        category: parts[1],
        period: parts[2],
        count: rows.length,
        ids: rows.map(r => r.id),
      });
    }
  }

  console.log(`   Scanned ${allAlerts.length} budget alerts. Found ${duplicateAlertGroups.length} duplicate groups (${duplicateAlertRowCount} excess rows).\n`);

  // 3. Audit Recurring Executions
  console.log('3. Auditing Recurring Executions for duplicates...');
  const allExecutions = await prisma.recurringExecution.findMany({
    select: {
      id: true,
      ruleId: true,
      scheduledDate: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const execGroups = new Map<string, typeof allExecutions>();
  for (const exec of allExecutions) {
    const dateStr = exec.scheduledDate.toISOString().slice(0, 10);
    const key = `${exec.ruleId}:${dateStr}`;
    const existing = execGroups.get(key) || [];
    existing.push(exec);
    execGroups.set(key, existing);
  }

  const duplicateExecGroups: DuplicateReport['recurringExecutions']['details'] = [];
  let duplicateExecRowCount = 0;

  for (const [key, rows] of execGroups.entries()) {
    if (rows.length > 1) {
      duplicateExecRowCount += (rows.length - 1);
      duplicateExecGroups.push({
        ruleId: rows[0].ruleId,
        scheduledDate: rows[0].scheduledDate.toISOString().slice(0, 10),
        count: rows.length,
        ids: rows.map(r => r.id),
      });
    }
  }

  console.log(`   Scanned ${allExecutions.length} recurring executions. Found ${duplicateExecGroups.length} duplicate groups (${duplicateExecRowCount} excess rows).\n`);

  const report: DuplicateReport = {
    timestamp: new Date().toISOString(),
    transactions: {
      totalScanned: allTx.length,
      duplicateGroupsFound: duplicateTxGroups.length,
      duplicateRowsCount: duplicateTxRowCount,
      details: duplicateTxGroups,
    },
    budgetAlerts: {
      totalScanned: allAlerts.length,
      duplicateGroupsFound: duplicateAlertGroups.length,
      duplicateRowsCount: duplicateAlertRowCount,
      details: duplicateAlertGroups,
    },
    recurringExecutions: {
      totalScanned: allExecutions.length,
      duplicateGroupsFound: duplicateExecGroups.length,
      duplicateRowsCount: duplicateExecRowCount,
      details: duplicateExecGroups,
    },
  };

  return report;
}

// Direct runner
if (require.main === module) {
  detectDuplicates()
    .then((report) => {
      console.log('=== SUMMARY REPORT ===');
      console.log(JSON.stringify({
        timestamp: report.timestamp,
        transactions: {
          scanned: report.transactions.totalScanned,
          duplicates: report.transactions.duplicateRowsCount,
        },
        budgetAlerts: {
          scanned: report.budgetAlerts.totalScanned,
          duplicates: report.budgetAlerts.duplicateRowsCount,
        },
        recurringExecutions: {
          scanned: report.recurringExecutions.totalScanned,
          duplicates: report.recurringExecutions.duplicateRowsCount,
        },
      }, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Audit failed:', err);
      process.exit(1);
    });
}
