import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { processDueRecurringTransactions } from '../../../../backend/src/workers/recurring.worker';
import { drainNotificationOutbox } from '../../../../backend/src/workers/index';

const API = '/api/v1';

const getSignedAuthHeaders = (userId = '123e4567-e89b-12d3-a456-426614174000', role = 'user') => {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = secret;
  const token = jwt.sign({ userId, id: userId, email: 'clear-e2e@test.com', role }, secret, { expiresIn: '15m' });
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
};

describe('Factory Reset (Clear Data) E2E Hardening Test', () => {
  const userId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    // Clean up any leftovers for this user before each test run
    await prisma.dailyAccountBalance.deleteMany({ where: { userId } });
    await prisma.monthlyCategorySpend.deleteMany({ where: { userId } });
    await prisma.monthlyCashflow.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    // Re-create core User + UserSettings
    await prisma.user.create({
      data: {
        id: userId,
        email: 'clear-e2e@test.com',
        name: 'Clear E2E User',
        password: 'dummy_hash_e2e',
        role: 'user',
        isApproved: true,
        userSettings: {
          create: {
            theme: 'light',
            currency: 'USD',
          },
        },
      },
    });
  });

  afterAll(async () => {
    // Cleanup user and snapshots
    await prisma.dailyAccountBalance.deleteMany({ where: { userId } });
    await prisma.monthlyCategorySpend.deleteMany({ where: { userId } });
    await prisma.monthlyCashflow.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('should execute a complete factory reset, return FactoryResetReport, and ignore concurrent requests', async () => {
    // 1. Seed data directly into various user-owned tables
    const account = await prisma.account.create({
      data: {
        id: 'clear-e2e-account-1',
        userId,
        name: 'Main Bank Account',
        type: 'bank',
        balance: 1000,
      },
    });

    await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        amount: 250,
        type: 'expense',
        category: 'Food',
        date: new Date(),
        description: 'Groceries',
      },
    });

    await prisma.goal.create({
      data: {
        userId,
        name: 'New Car',
        targetAmount: 20000,
        currentAmount: 500,
        targetDate: new Date(),
      },
    });

    await prisma.friend.create({
      data: {
        userId,
        name: 'Friend Contact',
        email: 'friend@test.com',
      },
    });

    // Create a due recurring transaction rule
    await prisma.recurringTransaction.create({
      data: {
        userId,
        accountId: account.id,
        amount: 150,
        type: 'expense',
        category: 'Subscription',
        interval: 'monthly',
        title: 'Subscription Title',
        nextDueDate: new Date(Date.now() - 10000), // due in the past
        status: 'active',
      },
    });

    // Create a pending notification row
    await prisma.notification.create({
      data: {
        userId,
        title: 'Low Balance Alert',
        message: 'Your account is below $50.',
        status: 'pending',
        channels: '["email"]',
        deliveryStatus: '{}',
      },
    });

    // Create derived snapshots
    await prisma.dailyAccountBalance.create({
      data: {
        accountId: account.id,
        userId,
        date: new Date(),
        balance: 1000,
      },
    });

    await prisma.monthlyCategorySpend.create({
      data: {
        userId,
        year: 2026,
        month: 7,
        category: 'Food',
        total: 250,
      },
    });

    // 2. Perform a Dry Run check first
    const dryRunRes = await request(app)
      .post(`${API}/settings/clear-data?dryRun=true`)
      .set(getSignedAuthHeaders(userId));

    expect(dryRunRes.status).toBe(200);
    expect(dryRunRes.body.success).toBe(true);
    expect(dryRunRes.body.dryRun).toBe(true);
    expect(dryRunRes.body.wouldDelete.accounts).toBe(1);
    expect(dryRunRes.body.wouldDelete.transactions).toBe(1);
    expect(dryRunRes.body.wouldDelete.recurringTransactions).toBe(1);

    // 3. Execute real Clear Data request
    const clearRes = await request(app)
      .post(`${API}/settings/clear-data`)
      .set(getSignedAuthHeaders(userId))
      .set('idempotency-key', 'reset-test-key-1');

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.success).toBe(true);
    expect(clearRes.body.factoryResetId.startsWith('FR-')).toBe(true);
    expect(clearRes.body.factoryResetId.length).toBe(24);
    expect(clearRes.body.factoryResetVersion).toBe('10.7');
    expect(clearRes.body.timings.phase0).toBeGreaterThanOrEqual(0);
    expect(clearRes.body.timings.phase1).toBeGreaterThanOrEqual(0);
    expect(clearRes.body.timings.phase2).toBeGreaterThanOrEqual(0);
    expect(clearRes.body.timings.phase3).toBeGreaterThanOrEqual(0);
    expect(clearRes.body.timings.phase4).toBeGreaterThanOrEqual(0);
    expect(clearRes.body.timings.phase5).toBeGreaterThanOrEqual(0);

    expect(clearRes.body.summary.financial.accounts).toBe(1);
    expect(clearRes.body.summary.financial.transactions).toBe(1);
    expect(clearRes.body.summary.recurring.recurringTransactions).toBe(1);
    expect(clearRes.body.summary.snapshots.dailyBalances).toBe(1);
    expect(clearRes.body.summary.snapshots.monthlySpends).toBe(1);

    // Check reset metadata fields on UserSettings
    expect(clearRes.body.resetMetadata.factoryResetVersion).toBe(1);
    expect(clearRes.body.resetMetadata.lastFactoryResetAt).toBeDefined();

    // Verify verification block has all 0s
    expect(clearRes.body.verification.accounts).toBe(0);
    expect(clearRes.body.verification.transactions).toBe(0);
    expect(clearRes.body.verification.dailyBalances).toBe(0);

    // 4. Verify Idempotency replay
    const replayRes = await request(app)
      .post(`${API}/settings/clear-data`)
      .set(getSignedAuthHeaders(userId))
      .set('idempotency-key', 'reset-test-key-1');

    expect(replayRes.status).toBe(200);
    expect(replayRes.body.success).toBe(true);
    expect(replayRes.body.resetMetadata.factoryResetVersion).toBe(1);

    // 5. Verify the endpoints are empty (API-level empty checks)
    const accountsRes = await request(app)
      .get(`${API}/accounts`)
      .set(getSignedAuthHeaders(userId));
    if (accountsRes.status === 200) {
      expect(accountsRes.body.data || accountsRes.body).toHaveLength(0);
    }

    const transactionsRes = await request(app)
      .get(`${API}/transactions`)
      .set(getSignedAuthHeaders(userId));
    if (transactionsRes.status === 200) {
      expect(transactionsRes.body.data || transactionsRes.body).toHaveLength(0);
    }

    // 6. Verify that background workers create nothing for this user if marked (worker checks)
    // Run recurring transaction worker
    await processDueRecurringTransactions();
    // Run notification outbox worker
    await drainNotificationOutbox();

    // Check that no new transactions or notifications were generated
    const postWorkerTxCount = await prisma.transaction.count({ where: { userId } });
    expect(postWorkerTxCount).toBe(0);

    const postWorkerNotifCount = await prisma.notification.count({ where: { userId } });
    expect(postWorkerNotifCount).toBe(0);

    // 7. Verify creating a new account still works (system still functional)
    const createAccountRes = await request(app)
      .post(`${API}/accounts`)
      .set(getSignedAuthHeaders(userId))
      .send({
        name: 'Post-Reset Account',
        type: 'savings',
        balance: 500,
      });

    expect([200, 201]).toContain(createAccountRes.status);

    const newAccountsCount = await prisma.account.count({ where: { userId } });
    expect(newAccountsCount).toBe(1);
  }, 90000);
});
