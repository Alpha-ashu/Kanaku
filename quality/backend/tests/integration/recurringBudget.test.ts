import { prisma } from '../../../../backend/src/db/prisma';
import { LedgerStatus, LedgerReferenceType, SourceModule } from '../../../../backend/src/db/prisma-client';
import { FinancialLedgerService } from '../../../../backend/src/features/transactions/ledger.service';
import { FinancialEventDispatcher, LedgerPostedEvent } from '../../../../backend/src/features/transactions/dispatcher';
import { randomUUID } from 'crypto';

describe('Phase 8A — Financial Infrastructure Integration Tests', () => {
  const TEST_USER_ID = 'b737198d-e591-4ad9-a787-c15c8df567fa';
  let account1Id: string;
  let account2Id: string;

  beforeAll(async () => {
    // Ensure test user exists
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'infra_test@example.com',
        name: 'Infra Test User',
        password: 'dummy',
        status: 'verified',
        role: 'user',
        isApproved: true
      }
    });

    // Create two test accounts
    const acc1 = await prisma.account.create({
      data: {
        userId: TEST_USER_ID,
        name: 'Infra Account 1',
        type: 'cash',
        balance: 10000,
        openingBalance: 10000
      }
    });
    account1Id = acc1.id;

    const acc2 = await prisma.account.create({
      data: {
        userId: TEST_USER_ID,
        name: 'Infra Account 2',
        type: 'bank',
        balance: 5000,
        openingBalance: 5000
      }
    });
    account2Id = acc2.id;
  });

  afterAll(async () => {
    // Cleanup created accounts and transactions to keep database clean
    await prisma.transaction.deleteMany({
      where: { userId: TEST_USER_ID }
    });
    await prisma.journalEntry.deleteMany({
      where: { userId: TEST_USER_ID }
    });
    await prisma.account.deleteMany({
      where: { userId: TEST_USER_ID }
    });
    await prisma.user.delete({
      where: { id: TEST_USER_ID }
    });
  });

  describe('1. Post-Commit Event Emission Invariant', () => {
    it('should only execute event listeners after commit, and skip them on rollback', async () => {
      let listenerCalled = false;
      let postCommitPhase = false;

      FinancialEventDispatcher.subscribe<LedgerPostedEvent>('LEDGER_POSTED', async (tx, event) => {
        if (event.metadata?.testScope === 'commit-verify') {
          listenerCalled = true;
          // Verify that this runs outside/after the transaction block execution finishes
          expect(postCommitPhase).toBe(true);
        }
      });

      // Scenario A: Successful Commit
      await prisma.$transaction(async (tx) => {
        await FinancialLedgerService.postJournalEntry(
          tx,
          {
            userId: TEST_USER_ID,
            sourceModule: SourceModule.TRANSACTIONS,
            referenceType: LedgerReferenceType.MANUAL,
            referenceId: randomUUID(),
            metadata: { testScope: 'commit-verify' }
          },
          [{
            accountId: account1Id,
            type: 'expense',
            amount: 100,
            category: 'Testing',
            description: 'Test post-commit event success'
          }]
        );
        // The event is deferred but not flushed yet
        expect(listenerCalled).toBe(false);
      }, { timeout: 30000 });

      postCommitPhase = true;
      await FinancialEventDispatcher.flushDeferred();
      expect(listenerCalled).toBe(true);

      // Scenario B: Rolled-back Transaction
      let rollbackListenerCalled = false;
      FinancialEventDispatcher.subscribe<LedgerPostedEvent>('LEDGER_POSTED', async (tx, event) => {
        if (event.metadata?.testScope === 'rollback-verify') {
          rollbackListenerCalled = true;
        }
      });

      try {
        await prisma.$transaction(async (tx) => {
          await FinancialLedgerService.postJournalEntry(
            tx,
            {
              userId: TEST_USER_ID,
              sourceModule: SourceModule.TRANSACTIONS,
              referenceType: LedgerReferenceType.MANUAL,
              referenceId: randomUUID(),
              metadata: { testScope: 'rollback-verify' }
            },
            [{
              accountId: account1Id,
              type: 'expense',
              amount: 100,
              category: 'Testing',
              description: 'Test post-commit event rollback'
            }]
          );
          throw new Error('Forced Rollback');
        }, { timeout: 30000 });
      } catch (err) {
        expect(err.message).toBe('Forced Rollback');
      }

      // If the transaction rolls back, we do not call flushDeferred(). The queue is emptied on flush anyway.
      // But let's verify rollbackListenerCalled remains false!
      expect(rollbackListenerCalled).toBe(false);
    });
  });

  describe('2. Transfer Invariant Validations', () => {
    it('should reject transfers with mismatched debit/credit balances', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await FinancialLedgerService.postJournalEntry(
            tx,
            {
              userId: TEST_USER_ID,
              sourceModule: SourceModule.TRANSACTIONS,
              referenceType: LedgerReferenceType.TRANSFER,
              referenceId: randomUUID(),
            },
            [
              {
                accountId: account1Id,
                type: 'TRANSFER_OUT',
                amount: 500,
                category: 'Transfer',
                description: 'Outflow'
              },
              {
                accountId: account2Id,
                type: 'TRANSFER_IN',
                amount: 600, // Imbalanced debit/credit!
                category: 'Transfer',
                description: 'Inflow'
              }
            ]
          );
        }, { timeout: 30000 })
      ).rejects.toThrow('Double-entry journal must balance');
    });

    it('should reject transfers containing identical source and destination accounts', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await FinancialLedgerService.postJournalEntry(
            tx,
            {
              userId: TEST_USER_ID,
              sourceModule: SourceModule.TRANSACTIONS,
              referenceType: LedgerReferenceType.TRANSFER,
              referenceId: randomUUID(),
            },
            [
              {
                accountId: account1Id,
                type: 'TRANSFER_OUT',
                amount: 500,
                category: 'Transfer',
                description: 'Outflow'
              },
              {
                accountId: account1Id, // Same account!
                type: 'TRANSFER_IN',
                amount: 500,
                category: 'Transfer',
                description: 'Inflow'
              }
            ]
          );
        }, { timeout: 30000 })
      ).rejects.toThrow('Source and destination accounts for a transfer must be different');
    });

    it('should successfully post a balanced, valid transfer journal entry', async () => {
      const initialAcc1 = await prisma.account.findUnique({ where: { id: account1Id } });
      const initialAcc2 = await prisma.account.findUnique({ where: { id: account2Id } });

      const je = await prisma.$transaction(async (tx) => {
        return await FinancialLedgerService.postJournalEntry(
          tx,
          {
            userId: TEST_USER_ID,
            sourceModule: SourceModule.TRANSACTIONS,
            referenceType: LedgerReferenceType.TRANSFER,
            referenceId: randomUUID(),
          },
          [
            {
              accountId: account1Id,
              type: 'TRANSFER_OUT',
              amount: 500,
              category: 'Transfer',
              description: 'Outflow test'
            },
            {
              accountId: account2Id,
              type: 'TRANSFER_IN',
              amount: 500,
              category: 'Transfer',
              description: 'Inflow test'
            }
          ]
        );
      }, { timeout: 30000 });

      expect(je).toBeDefined();

      const updatedAcc1 = await prisma.account.findUnique({ where: { id: account1Id } });
      const updatedAcc2 = await prisma.account.findUnique({ where: { id: account2Id } });

      expect(Number(updatedAcc1!.balance)).toBe(Number(initialAcc1!.balance) - 500);
      expect(Number(updatedAcc2!.balance)).toBe(Number(initialAcc2!.balance) + 500);
    });
  });

  describe('3. Database unique constraint idempotency shield', () => {
    it('should enforce ruleId + scheduledDate uniqueness in recurring_executions', async () => {
      // 1. Create a dummy recurring transaction rule
      const rule = await prisma.recurringTransaction.create({
        data: {
          userId: TEST_USER_ID,
          title: 'Monthly Test Rule',
          amount: 99.99,
          category: 'Bills',
          interval: 'monthly',
          nextDueDate: new Date(),
          status: 'active'
        }
      });

      const targetDate = new Date('2026-08-01T00:00:00Z');

      // 2. Create the first execution record
      const exec1 = await prisma.recurringExecution.create({
        data: {
          ruleId: rule.id,
          scheduledDate: targetDate,
          status: 'SUCCESS'
        }
      });
      expect(exec1).toBeDefined();

      // 3. Attempt to create the second execution record with the same rule and date
      await expect(
        prisma.recurringExecution.create({
          data: {
            ruleId: rule.id,
            scheduledDate: targetDate,
            status: 'PENDING'
          }
        })
      ).rejects.toThrow();

      // Cleanup rule and execution
      await prisma.recurringExecution.delete({ where: { id: exec1.id } });
      await prisma.recurringTransaction.delete({ where: { id: rule.id } });
    });
  });
});
