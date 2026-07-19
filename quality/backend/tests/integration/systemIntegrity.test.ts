import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { LedgerStatus, LedgerReferenceType, SourceModule, LedgerDirection, FinancialEventType } from '../../../../backend/src/db/prisma-client';

const API = '/api/v1';
const TEST_USER_ID = 'da6d92bf-33ab-41c6-a675-ea285f524021';

// The integrity endpoint is admin-only (system-wide operational data), so the
// suite signs an admin token; NODE_ENV=test lets the role claim be trusted.
const getSignedAuthToken = (userId: string = TEST_USER_ID, role: string = 'admin', email: string = 'integrity_test@example.com') => {
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
      name: 'Integrity Tester',
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

describe('System Integrity Diagnostic Endpoint Integration Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    authToken = getSignedAuthToken();

    // Ensure clean state
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  async function cleanup() {
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.journalEntry.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER_ID } });
  }

  it('should reject non-admin users with 403', async () => {
    const userToken = getSignedAuthToken(TEST_USER_ID, 'user');
    const res = await request(app)
      .get(`${API}/system/integrity`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('should return isHealthy = true on a clean ledger', async () => {
    const res = await request(app)
      .get(`${API}/system/integrity`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isHealthy).toBe(true);
    // Ledger fields are nested under data.ledger since the Phase 9.5 restructure
    expect(res.body.data.ledger.ledgerBalanced).toBe(true);
  }, 30000);

  it('should flag imbalanced journal entries', async () => {
    // 1. Create a dummy account
    const account = await prisma.account.create({
      data: {
        userId: TEST_USER_ID,
        name: 'Audit Test Account',
        type: 'cash',
        balance: 1000,
        openingBalance: 1000
      }
    });

    // 2. Create a dummy imbalanced JournalEntry
    const journalEntry = await prisma.journalEntry.create({
      data: {
        userId: TEST_USER_ID,
        sourceModule: SourceModule.TRANSACTIONS,
        referenceType: LedgerReferenceType.MANUAL,
        description: 'Imbalanced Test Entry'
      }
    });

    // 3. Create imbalanced legs: Outflow of 600 and Inflow of 500!
    await prisma.transaction.create({
      data: {
        userId: TEST_USER_ID,
        accountId: account.id,
        type: 'expense',
        amount: 600,
        category: 'Leisure',
        description: 'Outflow leg',
        date: new Date(),
        referenceType: LedgerReferenceType.MANUAL,
        sourceModule: SourceModule.TRANSACTIONS,
        direction: LedgerDirection.OUTFLOW,
        eventType: FinancialEventType.CREATE,
        status: LedgerStatus.POSTED,
        journalEntryId: journalEntry.id
      }
    });

    await prisma.transaction.create({
      data: {
        userId: TEST_USER_ID,
        accountId: account.id,
        type: 'income',
        amount: 500,
        category: 'Leisure',
        description: 'Imbalanced inflow leg',
        date: new Date(),
        referenceType: LedgerReferenceType.MANUAL,
        sourceModule: SourceModule.TRANSACTIONS,
        direction: LedgerDirection.INFLOW,
        eventType: FinancialEventType.CREATE,
        status: LedgerStatus.POSTED,
        journalEntryId: journalEntry.id
      }
    });

    // 4. Run integrity audit
    const res = await request(app)
      .get(`${API}/system/integrity`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isHealthy).toBe(false);
    expect(res.body.data.ledger.ledgerBalanced).toBe(false);
    expect(res.body.data.ledger.imbalancedJournalEntries.length).toBeGreaterThan(0);
    const found = res.body.data.ledger.imbalancedJournalEntries.find((e: any) => e.journalEntryId === journalEntry.id);
    expect(found).toBeDefined();
  }, 30000);
});
