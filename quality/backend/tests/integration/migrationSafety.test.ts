import jwt from 'jsonwebtoken';
import { prisma } from '../../../../backend/src/db/prisma';
import { Prisma } from '../../../../backend/src/db/prisma-client';
const { Decimal } = Prisma;
import { FinancialSnapshotService } from '../../../../backend/src/features/snapshots/snapshotService';

describe('Phase 5 to Phase 9 Migration Safety & Backfill Verification Tests', () => {
  jest.setTimeout(90000);
  const TEST_USER = 'migration-safety-test-user';
  let accountId: string;

  beforeAll(async () => {
    // Dynamically create the snapshot tables in the test database if they don't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "daily_account_balances" (
        "id" TEXT NOT NULL,
        "accountId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "date" DATE NOT NULL,
        "balance" DECIMAL(12, 2) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "daily_account_balances_pkey" PRIMARY KEY ("id")
      );
    `);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "daily_account_balances_accountId_date_key" ON "daily_account_balances"("accountId", "date");
      `);
    } catch {}

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "monthly_category_spend" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "year" INTEGER NOT NULL,
        "month" INTEGER NOT NULL,
        "category" TEXT NOT NULL,
        "total" DECIMAL(12, 2) NOT NULL,
        CONSTRAINT "monthly_category_spend_pkey" PRIMARY KEY ("id")
      );
    `);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "monthly_category_spend_userId_year_month_category_key" ON "monthly_category_spend"("userId", "year", "month", "category");
      `);
    } catch {}

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "monthly_cashflow" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "year" INTEGER NOT NULL,
        "month" INTEGER NOT NULL,
        "income" DECIMAL(12, 2) NOT NULL,
        "expense" DECIMAL(12, 2) NOT NULL,
        CONSTRAINT "monthly_cashflow_pkey" PRIMARY KEY ("id")
      );
    `);
    try {
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cashflow_userId_year_month_key" ON "monthly_cashflow"("userId", "year", "month");
      `);
    } catch {}

    // Clean up any old test data
    await prisma.dailyAccountBalance.deleteMany({ where: { userId: TEST_USER } });
    await prisma.monthlyCategorySpend.deleteMany({ where: { userId: TEST_USER } });
    await prisma.monthlyCashflow.deleteMany({ where: { userId: TEST_USER } });
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER } });
    await prisma.user.deleteMany({ where: { id: TEST_USER } });

    // Seed test user
    await prisma.user.create({
      data: {
        id: TEST_USER,
        email: 'migration_safety@example.com',
        name: 'Migration Safety User',
        password: 'dummy_password_hash',
        role: 'admin',
        isApproved: true,
      },
    });

    // Seed test account with opening balance
    const acc = await prisma.account.create({
      data: {
        userId: TEST_USER,
        name: 'Checking Account',
        type: 'checking',
        balance: 1000.00,
        openingBalance: 1000.00,
        currency: 'INR',
      },
    });
    accountId = acc.id;

    // Seed "Phase 5" style legacy transactions
    // In Phase 5, transactions had userId, accountId, type, amount, category, date, description.
    // They did not have journalEntryId, sequenceNumber, status (defaults to POSTED), direction, etc.
    // We emulate this by inserting transactions with null journalEntryId and null sequenceNumber.
    await prisma.transaction.create({
      data: {
        userId: TEST_USER,
        accountId: accountId,
        type: 'income',
        amount: 500.00,
        category: 'Salary',
        description: 'Legacy Income',
        date: new Date('2026-06-15'),
        syncStatus: 'synced',
        synced: true,
        journalEntryId: null,
        sequenceNumber: null,
      },
    });

    await prisma.transaction.create({
      data: {
        userId: TEST_USER,
        accountId: accountId,
        type: 'expense',
        amount: 200.00,
        category: 'Food',
        description: 'Legacy Expense',
        date: new Date('2026-06-20'),
        syncStatus: 'synced',
        synced: true,
        journalEntryId: null,
        sequenceNumber: null,
      },
    });

    // Adjust the account's balance to match transactions: 1000 + 500 - 200 = 1300
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: 1300.00 }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.dailyAccountBalance.deleteMany({ where: { userId: TEST_USER } });
    await prisma.monthlyCategorySpend.deleteMany({ where: { userId: TEST_USER } });
    await prisma.monthlyCashflow.deleteMany({ where: { userId: TEST_USER } });
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER } });
    await prisma.user.deleteMany({ where: { id: TEST_USER } });
  });

  it('should pass ledger reconciliation audit for legacy transactions without errors', async () => {
    // We verify database consistency by computing expected vs actual balance using legacy rules
    const acc = await prisma.account.findUnique({ where: { id: accountId } });
    expect(acc).toBeDefined();

    const sumResult = await prisma.transaction.groupBy({
      by: ['type'],
      where: { accountId, status: 'POSTED', deletedAt: null },
      _sum: { amount: true },
    });

    let expectedBalance = new Decimal(acc!.openingBalance);
    for (const group of sumResult) {
      const amt = group._sum.amount ? new Decimal(group._sum.amount) : new Decimal(0);
      if (group.type === 'income') {
        expectedBalance = expectedBalance.plus(amt);
      } else if (group.type === 'expense') {
        expectedBalance = expectedBalance.minus(amt);
      }
    }

    expect(expectedBalance.toNumber()).toBe(1300.00);
    expect(new Decimal(acc!.balance).toNumber()).toBe(1300.00);
  });

  it('should execute backfill migration successfully and populate financial snapshots correctly', async () => {
    // Assert snapshot tables are currently empty for this user
    const dailyCount = await prisma.dailyAccountBalance.count({ where: { userId: TEST_USER } });
    const spendCount = await prisma.monthlyCategorySpend.count({ where: { userId: TEST_USER } });
    const cashflowCount = await prisma.monthlyCashflow.count({ where: { userId: TEST_USER } });

    expect(dailyCount).toBe(0);
    expect(spendCount).toBe(0);
    expect(cashflowCount).toBe(0);

    // Run backfill
    await FinancialSnapshotService.backfillAll(prisma);

    // Assert snapshots are now populated
    const finalDaily = await prisma.dailyAccountBalance.findFirst({
      where: { userId: TEST_USER, accountId }
    });
    expect(finalDaily).not.toBeNull();
    expect(new Decimal(finalDaily!.balance).toNumber()).toBe(1300.00);

    // Assert monthly cashflow totals match legacy transaction sums
    const juneCf = await prisma.monthlyCashflow.findFirst({
      where: { userId: TEST_USER, year: 2026, month: 6 }
    });
    expect(juneCf).not.toBeNull();
    expect(new Decimal(juneCf!.income).toNumber()).toBe(500.00);
    expect(new Decimal(juneCf!.expense).toNumber()).toBe(200.00);

    // Assert category spends are populated
    const foodSpend = await prisma.monthlyCategorySpend.findFirst({
      where: { userId: TEST_USER, year: 2026, month: 6, category: 'Food' }
    });
    expect(foodSpend).not.toBeNull();
    expect(new Decimal(foodSpend!.total).toNumber()).toBe(200.00);
  });
});
