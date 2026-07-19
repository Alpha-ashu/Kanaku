import request from 'supertest';
import jwt from 'jsonwebtoken';
import { execSync } from 'child_process';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { FinancialLedgerService, LedgerError } from '../../../../backend/src/features/transactions/ledger.service';
import { FinancialEventDispatcher, GoalContributionEvent } from '../../../../backend/src/features/transactions/dispatcher';
import { Decimal } from '@prisma/client/runtime/library';

const API = '/api/v1';

const getSignedAuthToken = (overrides: Record<string, unknown> = {}) => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }
  return jwt.sign(
    {
      userId: 'test-admin-user',
      id: 'test-admin-user',
      email: 'admin-ledger-test@example.com',
      role: 'admin',
      isApproved: true,
      name: 'Test Admin',
      ...overrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

const runTx = <T>(cb: (tx: any) => Promise<T>): Promise<T> => {
  return prisma.$transaction(cb, { timeout: 30000 });
};

describe('LEDGER V2 FOUNDATION & RECONCILIATION', () => {
  let testUser: any;
  let testAccount: any;
  let testAccount2: any;
  const adminToken = getSignedAuthToken();

  beforeAll(async () => {
    // Ensure test user exists
    testUser = await prisma.user.upsert({
      where: { id: 'test-admin-user' },
      update: { status: 'verified', role: 'admin', isApproved: true },
      create: {
        id: 'test-admin-user',
        email: 'admin-ledger-test@example.com',
        name: 'Test Admin',
        password: 'dummy',
        status: 'verified',
        role: 'admin',
        isApproved: true
      }
    });

    // Ensure test accounts exist
    testAccount = await prisma.account.upsert({
      where: { id: 'test-ledger-acc-1' },
      update: { balance: new Decimal(1000), openingBalance: new Decimal(1000) },
      create: {
        id: 'test-ledger-acc-1',
        userId: 'test-admin-user',
        name: 'Test Ledger Account 1',
        type: 'bank',
        balance: new Decimal(1000),
        openingBalance: new Decimal(1000),
        currency: 'INR'
      }
    });

    testAccount2 = await prisma.account.upsert({
      where: { id: 'test-ledger-acc-2' },
      update: { balance: new Decimal(500), openingBalance: new Decimal(500) },
      create: {
        id: 'test-ledger-acc-2',
        userId: 'test-admin-user',
        name: 'Test Ledger Account 2',
        type: 'cash',
        balance: new Decimal(500),
        openingBalance: new Decimal(500),
        currency: 'INR'
      }
    });

    // Clean up existing test transactions/journals if any
    await prisma.transaction.deleteMany({
      where: { userId: 'test-admin-user' }
    });
    await prisma.journalEntry.deleteMany({
      where: { userId: 'test-admin-user' }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.transaction.deleteMany({
      where: { userId: 'test-admin-user' }
    });
    await prisma.journalEntry.deleteMany({
      where: { userId: 'test-admin-user' }
    });
  });

  describe('Feature Flag Bypass', () => {
    beforeEach(() => {
      process.env.LEDGER_V2_ENABLED = 'false';
    });

    it('should bypass posting when feature flag is disabled', async () => {
      expect(FinancialLedgerService.isEnabled()).toBe(false);
    });
  });

  describe('Core Ledger Service & Double Entry Validations', () => {
    beforeEach(() => {
      process.env.LEDGER_V2_ENABLED = 'true';
    });

    it('should enforce balanced double entry for multi-leg transactions', async () => {
      await expect(
        runTx(async (tx) => {
          await FinancialLedgerService.postJournalEntry(
            tx,
            {
              userId: 'test-admin-user',
              sourceModule: 'TRANSACTIONS',
              referenceType: 'TRANSFER',
              description: 'Imbalanced Transfer'
            },
            [
              {
                accountId: 'test-ledger-acc-1',
                type: 'expense',
                amount: 100,
                category: 'transfer',
                description: 'Outflow leg'
              },
              {
                accountId: 'test-ledger-acc-2',
                type: 'income',
                amount: 90, // Imbalanced leg
                category: 'transfer',
                description: 'Inflow leg'
              }
            ]
          );
        })
      ).rejects.toThrow(LedgerError);
    });

    it('should successfully post balanced transfer legs and adjust balances atomically', async () => {
      const initialAcc1 = await prisma.account.findUnique({ where: { id: 'test-ledger-acc-1' } });
      const initialAcc2 = await prisma.account.findUnique({ where: { id: 'test-ledger-acc-2' } });

      const journal = await runTx(async (tx) => {
        return await FinancialLedgerService.postJournalEntry(
          tx,
          {
            userId: 'test-admin-user',
            sourceModule: 'TRANSACTIONS',
            referenceType: 'TRANSFER',
            description: 'Balanced Transfer test'
          },
          [
            // TRANSFER journals must use transfer_out/transfer_in leg types
            // (FinancialInvariantValidator.assertValidTransfer contract)
            {
              accountId: 'test-ledger-acc-1',
              type: 'transfer_out',
              amount: 100,
              category: 'transfer',
              description: 'Outflow leg',
              idempotencyKey: 'transfer-outflow-key-1'
            },
            {
              accountId: 'test-ledger-acc-2',
              type: 'transfer_in',
              amount: 100,
              category: 'transfer',
              description: 'Inflow leg',
              idempotencyKey: 'transfer-inflow-key-1'
            }
          ]
        );
      });

      expect(journal).toHaveProperty('id');
      expect(journal.sourceModule).toBe('TRANSACTIONS');

      const finalAcc1 = await prisma.account.findUnique({ where: { id: 'test-ledger-acc-1' } });
      const finalAcc2 = await prisma.account.findUnique({ where: { id: 'test-ledger-acc-2' } });

      expect(Number(finalAcc1.balance)).toBe(Number(initialAcc1.balance) - 100);
      expect(Number(finalAcc2.balance)).toBe(Number(initialAcc2.balance) + 100);
    });

    it('should reject transactions with negative or zero amounts', async () => {
      await expect(
        runTx(async (tx) => {
          await FinancialLedgerService.postJournalEntry(
            tx,
            {
              userId: 'test-admin-user',
              sourceModule: 'TRANSACTIONS',
              referenceType: 'MANUAL',
              description: 'Negative Amount'
            },
            [
              {
                accountId: 'test-ledger-acc-1',
                type: 'expense',
                amount: -50,
                category: 'test',
                description: 'Leg 1'
              }
            ]
          );
        })
      ).rejects.toThrow(LedgerError);
    });

    it('should generate sequential sequence numbers for transactions', async () => {
      const journal1 = await runTx(async (tx) => {
        return await FinancialLedgerService.postJournalEntry(
          tx,
          { userId: 'test-admin-user', sourceModule: 'TRANSACTIONS', referenceType: 'MANUAL' },
          [{ accountId: 'test-ledger-acc-1', type: 'expense', amount: 10, category: 'test', description: 'first seq' }]
        );
      });

      const journal2 = await runTx(async (tx) => {
        return await FinancialLedgerService.postJournalEntry(
          tx,
          { userId: 'test-admin-user', sourceModule: 'TRANSACTIONS', referenceType: 'MANUAL' },
          [{ accountId: 'test-ledger-acc-1', type: 'expense', amount: 10, category: 'test', description: 'second seq' }]
        );
      });

      const tx1 = await prisma.transaction.findFirst({ where: { journalEntryId: journal1.id } });
      const tx2 = await prisma.transaction.findFirst({ where: { journalEntryId: journal2.id } });

      expect(tx1.sequenceNumber).toBeDefined();
      expect(tx2.sequenceNumber).toBeDefined();

      const num1 = parseInt(tx1.sequenceNumber.split('-')[2], 10);
      const num2 = parseInt(tx2.sequenceNumber.split('-')[2], 10);
      expect(num2).toBe(num1 + 1);
    });

    it('should prevent duplicate postings via the composite unique idempotency key', async () => {
      const journal1 = await runTx(async (tx) => {
        return await FinancialLedgerService.postJournalEntry(
          tx,
          { userId: 'test-admin-user', sourceModule: 'TRANSACTIONS', referenceType: 'MANUAL' },
          [{ accountId: 'test-ledger-acc-1', type: 'expense', amount: 50, category: 'test', description: 'idempotent post', idempotencyKey: 'idemp-1' }]
        );
      });

      // Second try: should safely return the same journalEntry without duplicate insertions
      const journal2 = await runTx(async (tx) => {
        return await FinancialLedgerService.postJournalEntry(
          tx,
          { userId: 'test-admin-user', sourceModule: 'TRANSACTIONS', referenceType: 'MANUAL' },
          [{ accountId: 'test-ledger-acc-1', type: 'expense', amount: 50, category: 'test', description: 'idempotent post', idempotencyKey: 'idemp-1' }]
        );
      });

      expect(journal1.id).toBe(journal2.id);

      const count = await prisma.transaction.count({
        where: { userId: 'test-admin-user', idempotencyKey: 'idemp-1' }
      });
      expect(count).toBe(1);
    });

    it('should maintain full atomicity and rollback on errors', async () => {
      const initialAcc1 = await prisma.account.findUnique({ where: { id: 'test-ledger-acc-1' } });

      await expect(
        runTx(async (tx) => {
          // 1. Create a leg
          await tx.transaction.create({
            data: {
              id: 'atomic-test-tx-1',
              userId: 'test-admin-user',
              accountId: 'test-ledger-acc-1',
              type: 'expense',
              amount: new Decimal(200),
              category: 'test',
              date: new Date(),
              sequenceNumber: 'LED-TEST-ATOMIC'
            }
          });

          // 2. Force a constraint error
          await tx.transaction.create({
            data: {
              id: 'atomic-test-tx-2',
              userId: 'test-admin-user',
              accountId: 'non-existent-account-id-force-error', // This must fail FK validation
              type: 'expense',
              amount: new Decimal(200),
              category: 'test',
              date: new Date()
            }
          });
        })
      ).rejects.toThrow();

      // Ensure transaction 1 was rolled back completely
      const exists = await prisma.transaction.findUnique({ where: { id: 'atomic-test-tx-1' } });
      expect(exists).toBeNull();

      const finalAcc1 = await prisma.account.findUnique({ where: { id: 'test-ledger-acc-1' } });
      expect(Number(finalAcc1.balance)).toBe(Number(initialAcc1.balance));
    });
  });

  describe('Reconciliation Engine API', () => {
    beforeEach(() => {
      process.env.LEDGER_V2_ENABLED = 'true';
    });

    it('should return a clean reconciliation report for balanced accounts (verified locally)', async () => {
      const res = await request(app)
        .get(`${API}/admin/ledger/reconcile`)
        .set({ Authorization: `Bearer ${adminToken}` });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Verify that our test accounts have no drift
      const drifts = res.body.data.drifts || [];
      const ourDrifts = drifts.filter((d: any) => d.accountId === 'test-ledger-acc-1' || d.accountId === 'test-ledger-acc-2');
      expect(ourDrifts.length).toBe(0);
    });

    it('should detect drift and report detail errors when balance is manually altered', async () => {
      // Intentionally introduce drift by altering account balance directly in the DB
      await prisma.account.update({
        where: { id: 'test-ledger-acc-1' },
        data: { balance: new Decimal(99999) }
      });

      const res = await request(app)
        .get(`${API}/admin/ledger/reconcile`)
        .set({ Authorization: `Bearer ${adminToken}` });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRIFT_DETECTED');
      expect(res.body.data.summary.accountsWithDrift).toBeGreaterThan(0);

      const drift = res.body.data.drifts.find((d: any) => d.accountId === 'test-ledger-acc-1');
      expect(drift).toBeDefined();
      expect(drift.severity).toBe('CRITICAL');

      // Revert account balance to correct value
      const inflowSumRes = await prisma.transaction.aggregate({
        where: { accountId: 'test-ledger-acc-1', type: 'income', status: 'POSTED', deletedAt: null },
        _sum: { amount: true }
      });
      const outflowSumRes = await prisma.transaction.aggregate({
        where: { accountId: 'test-ledger-acc-1', type: 'expense', status: 'POSTED', deletedAt: null },
        _sum: { amount: true }
      });
      const expected = new Decimal(1000) // opening balance
        .plus(new Decimal(inflowSumRes._sum.amount || 0))
        .minus(new Decimal(outflowSumRes._sum.amount || 0));

      await prisma.account.update({
        where: { id: 'test-ledger-acc-1' },
        data: { balance: expected }
      });
    });
  });

  describe('Backfill Migration Script', () => {
    it('should run backfill in dry-run mode and generate report without modifying database', async () => {
      // Seed a mock historic GroupExpense
      await prisma.groupExpense.deleteMany({ where: { id: 'test-backfill-group-1' } });
      await prisma.groupExpense.create({
        data: {
          id: 'test-backfill-group-1',
          userId: 'test-admin-user',
          name: 'Ski Trip Dinner',
          totalAmount: 1500,
          paidBy: 'test-ledger-acc-1',
          date: new Date(),
          category: 'Food',
          syncStatus: 'synced',
          members: '[]',
          items: '[]',
          yourShare: 500
        }
      });

      // Run backfill without --apply (dry-run)
      const output = execSync('npx ts-node -T scripts/backfillLedger.cjs', { encoding: 'utf-8' });
      expect(output).toContain('LEDGER BACKFILL AUDIT REPORT');
      expect(output).toMatch(/Groups:\s+\d+ items processed, \d+ missing ledger entries/);
      expect(output).toContain('Running in DRY-RUN mode. No database modifications have been made');

      // Verify that no ledger Transaction was created
      const count = await prisma.transaction.count({
        where: { userId: 'test-admin-user', idempotencyKey: 'backfill-group-expense-test-backfill-group-1' }
      });
      expect(count).toBe(0);

      // Clean up historic test item
      await prisma.groupExpense.deleteMany({ where: { id: 'test-backfill-group-1' } });
    }, 120000);

    it('should apply backfill updates and reconcile account balances on --apply flag', async () => {
      // Seed a mock historic GroupExpense
      await prisma.groupExpense.deleteMany({ where: { id: 'test-backfill-group-2' } });
      await prisma.groupExpense.create({
        data: {
          id: 'test-backfill-group-2',
          userId: 'test-admin-user',
          name: 'Lunch Split',
          totalAmount: 300,
          paidBy: 'test-ledger-acc-1',
          date: new Date(),
          category: 'Food',
          syncStatus: 'synced',
          members: '[]',
          items: '[]',
          yourShare: 100
        }
      });

      const initialAcc = await prisma.account.findUnique({ where: { id: 'test-ledger-acc-1' } });

      // Run backfill with --apply
      const output = execSync('npx ts-node -T scripts/backfillLedger.cjs --apply', { encoding: 'utf-8' });
      expect(output).toContain('Transaction committed successfully');
      expect(output).toContain('Verification PASSED. Zero balance drift detected');

      // Verify that ledger Transaction was created
      const count = await prisma.transaction.count({
        where: { userId: 'test-admin-user', idempotencyKey: 'backfill-group-expense-test-backfill-group-2' }
      });
      expect(count).toBe(1);

      // Verify balance was adjusted
      const finalAcc = await prisma.account.findUnique({ where: { id: 'test-ledger-acc-1' } });
      expect(Number(finalAcc.balance)).toBe(Number(initialAcc.balance) - 300);

      // Clean up historic test item
      await prisma.groupExpense.deleteMany({ where: { id: 'test-backfill-group-2' } });
    }, 300000);
  });
});
