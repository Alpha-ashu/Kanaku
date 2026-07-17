import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { LedgerStatus, LedgerReferenceType } from '../../../../backend/src/db/prisma-client';
import { cacheSetJson, cacheGetJson } from '../../../../backend/src/cache/redis';
import { initializeLedgerSubscriptions } from '../../../../backend/src/features/transactions/ledger.subscriber';

const API = '/api/v1';
const TEST_USER_ID = 'da6d92bf-33ab-41c6-a675-ea285f524021';
const TEST_FRIEND_EMAIL = 'consistency_friend@example.com';

const getSignedAuthToken = (userId: string = TEST_USER_ID, role: string = 'user', email: string = 'consistency_test@example.com') => {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }
  return jwt.sign(
    {
      userId,
      id: userId,
      email,
      role,
      isApproved: true,
      name: 'Consistency Tester',
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

describe('Phase 9 — Platform Consistency & Data Integrity Integration Tests', () => {
  let authToken: string;
  let accountId: string;
  let friendId: string;

  beforeAll(async () => {
    // 0. Initialize ledger subscriptions
    initializeLedgerSubscriptions();
    jest.setTimeout(60000);

    // 1. Set environment variables
    process.env.LEDGER_V2_ENABLED = 'true';
    process.env.LEDGER_GROUPS_ENABLED = 'true';

    authToken = getSignedAuthToken();

    // Ensure clean state before starting
    await cleanupUserRecords(TEST_USER_ID);

    // Create test user record
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'consistency_test@example.com',
        name: 'Consistency Tester',
        password: 'dummy',
        status: 'verified',
        role: 'user',
        isApproved: true
      }
    });
  });

  afterAll(async () => {
    await cleanupUserRecords(TEST_USER_ID);
    await prisma.user.delete({ where: { id: TEST_USER_ID } }).catch(() => {});
  });

  async function cleanupUserRecords(userId: string) {
    // Helper to purge records cleanly
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.journalEntry.deleteMany({ where: { userId } });
    await prisma.groupExpenseMember.deleteMany({ where: { OR: [{ userId }, { groupExpense: { userId } }] } });
    await prisma.groupExpense.deleteMany({ where: { userId } });
    await prisma.goalContribution.deleteMany({ where: { userId } });
    await prisma.goal.deleteMany({ where: { userId } });
    await prisma.loanPayment.deleteMany({ where: { loan: { userId } } });
    await prisma.loan.deleteMany({ where: { userId } });
    await prisma.investment.deleteMany({ where: { userId } });
    await prisma.goldAsset.deleteMany({ where: { userId } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.friend.deleteMany({ where: { userId } });
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.device.deleteMany({ where: { userId } });
    await prisma.recurringExecution.deleteMany({ where: { rule: { userId } } });
    await prisma.recurringTransaction.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
  }

  describe('Scenario 1: End-to-End User Flow Consistency', () => {
    it('should complete E2E lifecycle with correct balances, dashboard stats, and notifications', async () => {
      // 1. Create Account
      const accRes = await request(app)
        .post(`${API}/accounts`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Main Wallet',
          type: 'cash',
          balance: 1000,
          openingBalance: 1000
        });
      expect(accRes.status).toBe(201);
      accountId = accRes.body.data.id;

      // 2. Create Friend
      const friendRes = await request(app)
        .post(`${API}/friends`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Shaik Jijo',
          email: TEST_FRIEND_EMAIL,
          phone: '9876543219'
        });
      expect(friendRes.status).toBe(201);
      friendId = friendRes.body.data.id;

      // 3. Create Group Expense
      // Ash pays 600, Jijo owes 300
      const groupExpRes = await request(app)
        .post(`${API}/groups`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Team Outing',
          totalAmount: 600,
          paidBy: accountId,
          date: new Date(),
          category: 'Leisure',
          yourShare: 300,
          splitType: 'equal',
          members: [
            { name: 'You', share: 300, isCurrentUser: true, paid: true },
            { name: 'Shaik Jijo', share: 300, email: TEST_FRIEND_EMAIL, paid: false }
          ]
        });
      expect(groupExpRes.status).toBe(201);
      const groupExpenseId = groupExpRes.body.data.id;

      // 4. Verify Account balance decreases to 400 (600 leaves account)
      const accVerify = await request(app)
        .get(`${API}/accounts`)
        .set('Authorization', `Bearer ${authToken}`);
      const mainWallet = accVerify.body.data.find((a: any) => a.id === accountId);
      expect(Number(mainWallet.balance)).toBe(400);

      // 5. Verify Dashboard Analytics (Dashboard must read POSTED, excluding pending receivables)
      const dashRes = await request(app)
        .get(`${API}/dashboard/summary`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(dashRes.status).toBe(200);
      // Net flow / remaining balance = 400
      expect(Number(dashRes.body.data.totalBalance)).toBe(400);
      expect(Number(dashRes.body.data.monthlySpending.expense)).toBe(600);

      // 6. Friend pays back share (complete settlement workflow)
      const settleRes = await request(app)
        .put(`${API}/groups/${groupExpenseId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          members: [
            { name: 'You', share: 300, isCurrentUser: true, paid: true },
            { name: 'Shaik Jijo', share: 300, email: TEST_FRIEND_EMAIL, paid: true }
          ]
        });
      expect(settleRes.status).toBe(200);

      // 7. Verify Account balance updates to 700 (400 + 300 returned)
      const accVerify2 = await request(app)
        .get(`${API}/accounts`)
        .set('Authorization', `Bearer ${authToken}`);
      const mainWallet2 = accVerify2.body.data.find((a: any) => a.id === accountId);
      expect(Number(mainWallet2.balance)).toBe(700);

      // 8. Verify Notification Sent
      const notifRes = await request(app)
        .get(`${API}/notifications`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(notifRes.body.length).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Scenario 2: Complete Transactional Clear All Data Reset', () => {
    it('should purge every user-owned record and evict all caches in a single transaction', async () => {
      // 1. Seed some dummy cache data to verify invalidation
      const cacheKey = `dashboard:${TEST_USER_ID}:summary`;
      await cacheSetJson(cacheKey, { netFlow: 99999 }, 60);

      const cachedBefore = await cacheGetJson(cacheKey);
      expect(cachedBefore).toBeDefined();

      // 2. Call Clear Data endpoint
      const clearRes = await request(app)
        .post(`${API}/settings/clear-data`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(clearRes.status).toBe(200);
      expect(clearRes.body.success).toBe(true);

      // 3. Verify Database tables are 100% empty for user
      const txCount = await prisma.transaction.count({ where: { userId: TEST_USER_ID } });
      const accCount = await prisma.account.count({ where: { userId: TEST_USER_ID } });
      const friendCount = await prisma.friend.count({ where: { userId: TEST_USER_ID } });
      const notifCount = await prisma.notification.count({ where: { userId: TEST_USER_ID } });
      const groupCount = await prisma.groupExpense.count({ where: { userId: TEST_USER_ID } });

      expect(txCount).toBe(0);
      expect(accCount).toBe(0);
      expect(friendCount).toBe(0);
      expect(notifCount).toBe(0);
      expect(groupCount).toBe(0);

      // 4. Verify Caches are invalidated
      const cachedAfter = await cacheGetJson(cacheKey);
      expect(cachedAfter).toBeNull();
    }, 90000);
  });

  describe('Scenario 3: Friend Recreation Soft-Delete Restoration', () => {
    it('should restore a soft-deleted friend on recreation instead of creating a duplicate', async () => {
      // 1. Create Friend
      const createRes = await request(app)
        .post(`${API}/friends`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Shaik Jijo',
          email: TEST_FRIEND_EMAIL,
          phone: '9876543219'
        });
      expect(createRes.status).toBe(201);
      const createdId = createRes.body.data.id;

      // 2. Delete Friend (soft delete)
      const deleteRes = await request(app)
        .delete(`${API}/friends/${createdId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(deleteRes.status).toBe(200);

      // 3. Re-create the same friend
      const recreateRes = await request(app)
        .post(`${API}/friends`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Shaik Jijo',
          email: TEST_FRIEND_EMAIL,
          phone: '9876543219'
        });
      expect(recreateRes.status).toBe(200); // 200 OK (restored/updated) instead of 201 Created
      expect(recreateRes.body.data.id).toBe(createdId);
      expect(recreateRes.body.data.deletedAt).toBeNull();

      // 4. Verify count is exactly 1 (no duplicates)
      const listRes = await request(app)
        .get(`${API}/friends`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(listRes.body.data.length).toBe(1);
    }, 90000);
  });
});
