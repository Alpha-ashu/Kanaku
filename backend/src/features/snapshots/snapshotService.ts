/**
 * Financial Snapshot Service — Phase 10 Production Hardening.
 *
 * Incremental snapshot updater triggered on every LEDGER_POSTED event.
 * Subscribes to the FinancialEventDispatcher and updates DailyAccountBalance,
 * MonthlyCategorySpend, and MonthlyCashflow tables incrementally in the same
 * transaction context.
 *
 * Avoids expensive aggregation scans over millions of Transaction rows at
 * dashboard or reporting runtime.
 */
// Decimal lives at Prisma.Decimal at runtime, not as a top-level export. Both
// bindings needed — `const` for values, `type` for annotations (see
// reconcile.controller.ts for the full explanation).
import { Prisma } from '../../db/prisma-client';
const Decimal = Prisma.Decimal;
type Decimal = InstanceType<typeof Prisma.Decimal>;
import { FinancialEventDispatcher, LedgerPostedEvent, PrismaTx } from '../transactions/dispatcher';
import { logger } from '../../config/logger';

export class FinancialSnapshotService {
  /**
   * Initializes the snapshot service by subscribing to LEDGER_POSTED events.
   */
  static init(): void {
    FinancialEventDispatcher.subscribe<LedgerPostedEvent>('LEDGER_POSTED', async (tx, event) => {
      try {
        await this.handleLedgerPosted(tx, event);
      } catch (error: any) {
        logger.error('[SnapshotService] Failed to update financial snapshots', {
          userId: event.userId,
          journalEntryId: event.journalEntryId,
          error: error.message,
        });
        // We do NOT let snapshot failures roll back the ledger transaction if they
        // fail, to prevent blocking critical business operations. However, within
        // the event bus listener, throwing an error will log it properly.
      }
    });

    // Run safe async backfill check if database is empty of daily balances (bypassed in tests to avoid deadlocks)
    if (process.env.NODE_ENV !== 'test') {
      try {
        // Lazy: snapshotService is imported by worker bootstrap paths that must
        // not open a DB connection just by being loaded.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { prisma } = require('../../db/prisma');
        prisma.dailyAccountBalance.count()
          .then((count: number) => {
            if (count === 0) {
              this.backfillAll(prisma).catch((err: any) => {
                logger.error('[SnapshotService] Retroactive backfill failed', { error: err.message });
              });
            }
          })
          .catch((err: any) => {
            logger.warn('[SnapshotService] Could not query snapshot tables for backfill check', { error: err.message });
          });
      } catch (err: any) {
        logger.warn('[SnapshotService] Failed to bind prisma client for backfill check', { error: err.message });
      }
    }

    logger.info('[SnapshotService] Financial snapshot listener initialized.');
  }

  /**
   * Main incremental snapshot updater. Runs inside the database transaction.
   */
  static async handleLedgerPosted(tx: PrismaTx, event: LedgerPostedEvent): Promise<void> {
    const userId = event.userId;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const today = new Date(todayStr); // YYYY-MM-DD Date representation
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-indexed (Jan = 1, Dec = 12)

    for (const leg of event.legs) {
      if (leg.status !== 'POSTED') continue;

      const legTypeLower = leg.type.toLowerCase();
      const amountDec = new Decimal(leg.amount);

      // ── 1. Daily Account Balance Snapshot ────────────────────────────────
      // Retrieve the current absolute balance of the account
      const account = await tx.account.findUnique({
        where: { id: leg.accountId },
        select: { balance: true }
      });

      if (account) {
        const endingBalance = new Decimal(account.balance);
        await tx.dailyAccountBalance.upsert({
          where: {
            accountId_date: {
              accountId: leg.accountId,
              date: today,
            },
          },
          update: {
            balance: endingBalance,
            updatedAt: new Date(),
          },
          create: {
            accountId: leg.accountId,
            userId,
            date: today,
            balance: endingBalance,
          },
        });
      }

      // ── 2. Monthly Category Spend Snapshot ───────────────────────────────
      // Only track expense legs for monthly category spends
      const isExpense = legTypeLower === 'expense' || legTypeLower === 'transfer_out';
      if (isExpense) {
        await tx.monthlyCategorySpend.upsert({
          where: {
            userId_year_month_category: {
              userId,
              year,
              month,
              category: leg.category || 'Uncategorized',
            },
          },
          update: {
            total: { increment: amountDec },
          },
          create: {
            userId,
            year,
            month,
            category: leg.category || 'Uncategorized',
            total: amountDec,
          },
        });
      }

      // ── 3. Monthly Cashflow Snapshot ──────────────────────────────────────
      const isIncome = legTypeLower === 'income' || legTypeLower === 'transfer_in';
      const inflow = isIncome ? amountDec : new Decimal(0);
      const outflow = isExpense ? amountDec : new Decimal(0);

      await tx.monthlyCashflow.upsert({
        where: {
          userId_year_month: {
            userId,
            year,
            month,
          },
        },
        update: {
          income: { increment: inflow },
          expense: { increment: outflow },
        },
        create: {
          userId,
          year,
          month,
          income: inflow,
          expense: outflow,
        },
      });
    }
  }

  /**
   * One-time retroactive backfill migration for existing transaction history.
   * Ensures that snapshot tables are fully populated for existing users.
   */
  static async backfillAll(tx: PrismaTx): Promise<void> {
    logger.info('[SnapshotService] Running one-time retroactive backfill of snapshot tables...');

    // 1. Daily Account Balances (Current state)
    const accounts = await tx.account.findMany({
      where: { deletedAt: null }
    });
    const today = new Date(new Date().toISOString().split('T')[0]);

    const existingBalances = await tx.dailyAccountBalance.findMany({
      where: { date: today }
    });
    const existingBalancesMap = new Map(existingBalances.map(b => [b.accountId, b.balance]));

    const toCreate: any[] = [];
    const toUpdate: any[] = [];

    for (const acc of accounts) {
      const existingBal = existingBalancesMap.get(acc.id);
      if (existingBal !== undefined) {
        if (!new Decimal(existingBal).equals(new Decimal(acc.balance))) {
          toUpdate.push(acc);
        }
      } else {
        toCreate.push({
          accountId: acc.id,
          userId: acc.userId,
          date: today,
          balance: acc.balance
        });
      }
    }

    if (toCreate.length > 0) {
      await tx.dailyAccountBalance.createMany({
        data: toCreate,
        skipDuplicates: true
      });
    }

    for (const acc of toUpdate) {
      await tx.dailyAccountBalance.update({
        where: { accountId_date: { accountId: acc.id, date: today } },
        data: { balance: acc.balance }
      });
    }

    // 2. Monthly cashflows & category spends from Transactions history
    const transactions = await tx.transaction.findMany({
      where: { deletedAt: null, status: 'POSTED' }
    });

    const cashflows = new Map<string, { userId: string; year: number; month: number; income: Decimal; expense: Decimal }>();
    const categorySpends = new Map<string, { userId: string; year: number; month: number; category: string; total: Decimal }>();

    for (const txn of transactions) {
      const date = new Date(txn.date);
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const amt = new Decimal(txn.amount);
      const dir = txn.direction; // INFLOW or OUTFLOW
      const isIncome = dir === 'INFLOW' || txn.type.toLowerCase() === 'income';

      // Aggregate Cashflow key: userId_year_month
      const cfKey = `${txn.userId}_${y}_${m}`;
      const cf = cashflows.get(cfKey) || { userId: txn.userId, year: y, month: m, income: new Decimal(0), expense: new Decimal(0) };
      if (isIncome) {
        cf.income = cf.income.add(amt);
      } else {
        cf.expense = cf.expense.add(amt);
      }
      cashflows.set(cfKey, cf);

      // Aggregate Category Spend key: userId_year_month_category
      if (!isIncome) {
        const cat = txn.category || 'Uncategorized';
        const csKey = `${txn.userId}_${y}_${m}_${cat}`;
        const cs = categorySpends.get(csKey) || { userId: txn.userId, year: y, month: m, category: cat, total: new Decimal(0) };
        cs.total = cs.total.add(amt);
        categorySpends.set(csKey, cs);
      }
    }

    const existingCf = await tx.monthlyCashflow.findMany();
    const existingCfMap = new Map(existingCf.map(c => [`${c.userId}_${c.year}_${c.month}`, c]));

    const existingCs = await tx.monthlyCategorySpend.findMany();
    const existingCsMap = new Map(existingCs.map(c => [`${c.userId}_${c.year}_${c.month}_${c.category}`, c]));

    for (const cf of cashflows.values()) {
      const key = `${cf.userId}_${cf.year}_${cf.month}`;
      const existing = existingCfMap.get(key);
      if (existing) {
        if (new Decimal(existing.income).equals(cf.income) && new Decimal(existing.expense).equals(cf.expense)) {
          continue; // Skip redundant upsert
        }
      }
      await tx.monthlyCashflow.upsert({
        where: { userId_year_month: { userId: cf.userId, year: cf.year, month: cf.month } },
        update: { income: cf.income, expense: cf.expense },
        create: { userId: cf.userId, year: cf.year, month: cf.month, income: cf.income, expense: cf.expense }
      });
    }

    for (const cs of categorySpends.values()) {
      const key = `${cs.userId}_${cs.year}_${cs.month}_${cs.category}`;
      const existing = existingCsMap.get(key);
      if (existing) {
        if (new Decimal(existing.total).equals(cs.total)) {
          continue; // Skip redundant upsert
        }
      }
      await tx.monthlyCategorySpend.upsert({
        where: { userId_year_month_category: { userId: cs.userId, year: cs.year, month: cs.month, category: cs.category } },
        update: { total: cs.total },
        create: { userId: cs.userId, year: cs.year, month: cs.month, category: cs.category, total: cs.total }
      });
    }

    logger.info('[SnapshotService] One-time backfill migration completed successfully!');
  }
}
