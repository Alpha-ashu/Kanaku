import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../../../backend/src/db/prisma';
import { FinancialInvariantValidator } from '../../../../backend/src/utils/financialInvariantValidator';
import { LedgerLeg, LedgerError } from '../../../../backend/src/features/transactions/ledger.service';
import { LedgerStatus, LedgerReferenceType, SourceModule } from '../../../../backend/src/db/prisma-client';

describe('Financial Invariant Validator Integration Tests', () => {
  const USER_A = 'invariant-test-user-a';
  const USER_B = 'invariant-test-user-b';
  let accountA: string;
  let accountB: string;
  let accountDeleted: string;

  beforeAll(async () => {
    // Clean up
    await prisma.transaction.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.journalEntry.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });

    // Seed test users
    await prisma.user.create({
      data: {
        id: USER_A,
        email: 'invariant_a@example.com',
        name: 'User Invariant A',
        password: 'dummy_hash_a',
        role: 'user',
        isApproved: true,
      },
    });

    await prisma.user.create({
      data: {
        id: USER_B,
        email: 'invariant_b@example.com',
        name: 'User Invariant B',
        password: 'dummy_hash_b',
        role: 'user',
        isApproved: true,
      },
    });

    // Seed test accounts
    const accA = await prisma.account.create({
      data: {
        userId: USER_A,
        name: 'Account A',
        type: 'savings',
        balance: 1000.00,
        currency: 'INR',
      },
    });
    accountA = accA.id;

    const accB = await prisma.account.create({
      data: {
        userId: USER_B,
        name: 'Account B',
        type: 'savings',
        balance: 500.00,
        currency: 'INR',
      },
    });
    accountB = accB.id;

    const accDel = await prisma.account.create({
      data: {
        userId: USER_A,
        name: 'Deleted Account',
        type: 'checking',
        balance: 100.00,
        currency: 'INR',
        deletedAt: new Date(),
      },
    });
    accountDeleted = accDel.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.journalEntry.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
  });

  describe('assertPositiveAmount', () => {
    it('should pass on positive finite amount', () => {
      expect(() => FinancialInvariantValidator.assertPositiveAmount(100)).not.toThrow();
      expect(() => FinancialInvariantValidator.assertPositiveAmount(new Decimal(250.75))).not.toThrow();
    });

    it('should reject zero amount', () => {
      expect(() => FinancialInvariantValidator.assertPositiveAmount(0)).toThrow(/must be a positive non-zero/);
    });

    it('should reject negative amount', () => {
      expect(() => FinancialInvariantValidator.assertPositiveAmount(-50)).toThrow(/must be a positive non-zero/);
    });

    it('should reject NaN and Infinity', () => {
      expect(() => FinancialInvariantValidator.assertPositiveAmount(NaN)).toThrow();
      expect(() => FinancialInvariantValidator.assertPositiveAmount(Infinity)).toThrow();
    });
  });

  describe('assertJournalBalances', () => {
    it('should throw if legs list is empty', () => {
      expect(() => FinancialInvariantValidator.assertJournalBalances([])).toThrow('Journal must have at least one transaction leg.');
    });

    it('should pass for single-leg journals', () => {
      const singleLeg: LedgerLeg = {
        accountId: accountA,
        type: 'income',
        amount: 100,
        category: 'Salary',
        description: 'Single leg',
      };
      expect(() => FinancialInvariantValidator.assertJournalBalances([singleLeg])).not.toThrow();
    });

    it('should pass for balanced double-entry journals', () => {
      const legs: LedgerLeg[] = [
        { accountId: accountA, type: 'transfer_out', amount: 150, category: 'Transfer', description: 'Out' },
        { accountId: accountB, type: 'transfer_in', amount: 150, category: 'Transfer', description: 'In' },
      ];
      expect(() => FinancialInvariantValidator.assertJournalBalances(legs)).not.toThrow();
    });

    it('should throw for imbalanced double-entry journals', () => {
      const legs: LedgerLeg[] = [
        { accountId: accountA, type: 'transfer_out', amount: 150, category: 'Transfer', description: 'Out' },
        { accountId: accountB, type: 'transfer_in', amount: 140, category: 'Transfer', description: 'In' },
      ];
      expect(() => FinancialInvariantValidator.assertJournalBalances(legs)).toThrow(/must balance/);
    });
  });

  describe('assertValidTransfer', () => {
    it('should pass for valid transfer legs', () => {
      const legs: LedgerLeg[] = [
        { accountId: accountA, type: 'transfer_out', amount: 100, category: 'Transfer', description: 'Out' },
        { accountId: accountB, type: 'transfer_in', amount: 100, category: 'Transfer', description: 'In' },
      ];
      expect(() => FinancialInvariantValidator.assertValidTransfer(legs)).not.toThrow();
    });

    it('should throw if transfer legs is not exactly 2', () => {
      const legs: LedgerLeg[] = [
        { accountId: accountA, type: 'transfer_out', amount: 100, category: 'Transfer', description: 'Out' },
      ];
      expect(() => FinancialInvariantValidator.assertValidTransfer(legs)).toThrow(/must have exactly two transaction legs/);
    });

    it('should throw if transfer legs have same accountId', () => {
      const legs: LedgerLeg[] = [
        { accountId: accountA, type: 'transfer_out', amount: 100, category: 'Transfer', description: 'Out' },
        { accountId: accountA, type: 'transfer_in', amount: 100, category: 'Transfer', description: 'In' },
      ];
      expect(() => FinancialInvariantValidator.assertValidTransfer(legs)).toThrow(/must be different/);
    });

    it('should throw if transfer legs do not have one IN and one OUT', () => {
      const legs: LedgerLeg[] = [
        { accountId: accountA, type: 'transfer_in', amount: 100, category: 'Transfer', description: 'In 1' },
        { accountId: accountB, type: 'transfer_in', amount: 100, category: 'Transfer', description: 'In 2' },
      ];
      expect(() => FinancialInvariantValidator.assertValidTransfer(legs)).toThrow(/consist of exactly one TRANSFER_OUT leg and one TRANSFER_IN leg/);
    });
  });

  describe('assertAccountOwned', () => {
    it('should pass for accounts owned by requesting user', async () => {
      await prisma.$transaction(async (tx) => {
        const acc = await FinancialInvariantValidator.assertAccountOwned(tx, accountA, USER_A);
        expect(acc.id).toBe(accountA);
      });
    });

    it('should throw if account is owned by different user (cross-user reference guard)', async () => {
      await prisma.$transaction(async (tx) => {
        await expect(
          FinancialInvariantValidator.assertAccountOwned(tx, accountA, USER_B)
        ).rejects.toThrow(/not found or does not belong to user/);
      });
    });

    it('should throw if account is deleted', async () => {
      await prisma.$transaction(async (tx) => {
        await expect(
          FinancialInvariantValidator.assertAccountOwned(tx, accountDeleted, USER_A)
        ).rejects.toThrow(/not found or does not belong to user/);
      });
    });
  });

  describe('assertSameUser', () => {
    it('should pass if user IDs match', () => {
      expect(() => FinancialInvariantValidator.assertSameUser(USER_A, USER_A)).not.toThrow();
    });

    it('should throw if user IDs mismatch', () => {
      expect(() => FinancialInvariantValidator.assertSameUser(USER_A, USER_B)).toThrow(/Cross-user reference rejected/);
    });
  });

  describe('assertBalanceFloor', () => {
    it('should pass if resulting balance stays above floor', () => {
      expect(() =>
        FinancialInvariantValidator.assertBalanceFloor(new Decimal(100), new Decimal(20), 0)
      ).not.toThrow();
    });

    it('should throw if resulting balance drops below floor', () => {
      expect(() =>
        FinancialInvariantValidator.assertBalanceFloor(new Decimal(10), new Decimal(20), 0)
      ).toThrow(/fall below the minimum balance floor/);
    });
  });

  describe('assertSettlementAmount', () => {
    it('should pass for valid settlement amount', () => {
      expect(() =>
        FinancialInvariantValidator.assertSettlementAmount(new Decimal(50), new Decimal(100), 'tx-1')
      ).not.toThrow();
    });

    it('should throw if settlement amount exceeds pending amount', () => {
      expect(() =>
        FinancialInvariantValidator.assertSettlementAmount(new Decimal(120), new Decimal(100), 'tx-1')
      ).toThrow(/cannot exceed pending amount/);
    });

    it('should throw if settlement amount is zero or negative', () => {
      expect(() =>
        FinancialInvariantValidator.assertSettlementAmount(new Decimal(0), new Decimal(100), 'tx-1')
      ).toThrow(/Settlement amount must be positive/);
    });
  });
});
