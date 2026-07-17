import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';

export const getSystemIntegrity = async (req: Request, res: Response) => {
  try {
    // 1. Ledger Balancing Check (Sum(Debits) == Sum(Credits) for all Journal Entries)
    // In our schema:
    // Credits: type = expense, transfer_out, TRANSFER_OUT
    // Debits: type = income, transfer_in, TRANSFER_IN
    const imbalancedEntries: any[] = await prisma.$queryRaw`
      SELECT 
        "journalEntryId",
        COUNT(*)::int as legs_count,
        COALESCE(SUM(CASE WHEN UPPER(type) IN ('EXPENSE', 'TRANSFER_OUT') THEN amount ELSE 0 END), 0)::float as credits,
        COALESCE(SUM(CASE WHEN UPPER(type) IN ('INCOME', 'TRANSFER_IN') THEN amount ELSE 0 END), 0)::float as debits
      FROM "Transaction"
      WHERE "deletedAt" IS NULL AND "journalEntryId" IS NOT NULL
      GROUP BY "journalEntryId"
      HAVING COUNT(*) > 1 AND SUM(CASE WHEN UPPER(type) IN ('EXPENSE', 'TRANSFER_OUT') THEN amount ELSE 0 END) != SUM(CASE WHEN UPPER(type) IN ('INCOME', 'TRANSFER_IN') THEN amount ELSE 0 END)
      LIMIT 100
    `;

    // 2. Duplicate Sequence Numbers check
    const duplicateSequences: any[] = await prisma.$queryRaw`
      SELECT "sequenceNumber", COUNT(*)::int as count
      FROM "Transaction"
      WHERE "sequenceNumber" IS NOT NULL AND "deletedAt" IS NULL
      GROUP BY "sequenceNumber"
      HAVING COUNT(*) > 1
      LIMIT 100
    `;

    // 3. Duplicate Idempotency Keys check
    const duplicateIdempotency: any[] = await prisma.$queryRaw`
      SELECT "userId", "sourceModule", "idempotencyKey", COUNT(*)::int as count
      FROM "Transaction"
      WHERE "idempotencyKey" IS NOT NULL AND "deletedAt" IS NULL
      GROUP BY "userId", "sourceModule", "idempotencyKey"
      HAVING COUNT(*) > 1
      LIMIT 100
    `;

    // 4. Orphan Transactions check (referencing non-existent accounts)
    const orphanTransactions: any[] = await prisma.$queryRaw`
      SELECT t.id, t."accountId", t."userId"
      FROM "Transaction" t
      LEFT JOIN "Account" a ON t."accountId" = a.id
      WHERE a.id IS NULL AND t."deletedAt" IS NULL
      LIMIT 100
    `;

    // 5. Orphan Group Expense Members check (referencing non-existent group expenses)
    const orphanGroupMembers: any[] = await prisma.$queryRaw`
      SELECT gem.id, gem."groupExpenseId"
      FROM "GroupExpenseMember" gem
      LEFT JOIN group_expenses ge ON gem."groupExpenseId" = ge.id
      WHERE ge.id IS NULL AND gem."deletedAt" IS NULL
      LIMIT 100
    `;

    // 6. Notification queue stats
    const [pendingNotifications, failedNotifications] = await Promise.all([
      prisma.notification.count({ where: { status: 'pending' } }),
      prisma.notification.count({ where: { status: 'failed' } })
    ]);

    const isHealthy = 
      imbalancedEntries.length === 0 && 
      duplicateSequences.length === 0 &&
      duplicateIdempotency.length === 0 &&
      orphanTransactions.length === 0 &&
      orphanGroupMembers.length === 0;

    res.json({
      success: true,
      data: {
        isHealthy,
        ledgerBalanced: imbalancedEntries.length === 0,
        imbalancedJournalEntries: imbalancedEntries,
        duplicateSequences,
        duplicateIdempotency,
        orphanTransactionsCount: orphanTransactions.length,
        orphanTransactions,
        orphanGroupMembersCount: orphanGroupMembers.length,
        orphanGroupMembers,
        notificationsQueue: {
          pending: pendingNotifications,
          failed: failedNotifications
        }
      }
    });
  } catch (error: any) {
    console.error('System integrity check failed:', error);
    res.status(500).json({ success: false, error: error.message || 'System integrity check failed' });
  }
};
