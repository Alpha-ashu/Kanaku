import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { LedgerStatus, LedgerReferenceType, SourceModule, LedgerDirection, FinancialEventType } from '../../../../backend/src/db/prisma-client';
import { Decimal } from '@prisma/client/runtime/library';
import { FinancialLedgerService } from '../../../../backend/src/features/transactions/ledger.service';
import { initializeLedgerSubscriptions } from '../../../../backend/src/features/transactions/ledger.subscriber';

const API = '/api/v1';
const CREATOR_ID = 'e6e3bb28-2b1b-4cf7-9a0f-621f2bb87265';
const PARTICIPANT_ID = 'f073ad6d-cb51-4e78-be7f-0df524b01e3b';

const getSignedAuthToken = (userId: string = CREATOR_ID, role: string = 'user', email: string = 'creator@example.com') => {
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
      name: userId === CREATOR_ID ? 'Shaik Ashraf' : 'Jijo',
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

describe('Group Settlement & Master Ledger Integration (Phase 7B)', () => {
  let creatorToken: string;
  let participantToken: string;
  let creatorAccount: any;
  let participantUser: any;

  beforeAll(async () => {
    // 0. Initialize ledger subscriptions
    initializeLedgerSubscriptions();

    // 1. Set environment variables for Ledger V2 and Groups module
    process.env.LEDGER_V2_ENABLED = 'true';
    process.env.LEDGER_GROUPS_ENABLED = 'true';

    // 2. Ensure creator user and profile exists
    await prisma.user.upsert({
      where: { id: CREATOR_ID },
      update: { status: 'verified', isApproved: true },
      create: {
        id: CREATOR_ID,
        email: 'creator@example.com',
        name: 'Shaik Ashraf',
        password: 'dummy',
        status: 'verified',
        role: 'user',
        isApproved: true
      }
    });

    await prisma.profiles.upsert({
      where: { id: CREATOR_ID },
      update: { phone: '9876543210' },
      create: {
        id: CREATOR_ID,
        phone: '9876543210',
        full_name: 'Shaik Ashraf'
      }
    });

    // 3. Ensure participant user and profile exists
    participantUser = await prisma.user.upsert({
      where: { id: PARTICIPANT_ID },
      update: { status: 'verified', isApproved: true },
      create: {
        id: PARTICIPANT_ID,
        email: 'jijo@example.com',
        name: 'Jijo',
        password: 'dummy',
        status: 'verified',
        role: 'user',
        isApproved: true
      }
    });

    await prisma.profiles.upsert({
      where: { id: PARTICIPANT_ID },
      update: { phone: '8765432109' },
      create: {
        id: PARTICIPANT_ID,
        phone: '8765432109',
        full_name: 'Jijo'
      }
    });

    // 4. Ensure creator cash account exists
    creatorAccount = await prisma.account.upsert({
      where: { id: 'creator-bank-acc' },
      update: { balance: new Decimal(10000), openingBalance: new Decimal(10000) },
      create: {
        id: 'creator-bank-acc',
        userId: CREATOR_ID,
        name: 'Bank of Baroda',
        type: 'bank',
        balance: new Decimal(10000),
        openingBalance: new Decimal(10000),
        currency: 'INR'
      }
    });

    // Clean up previous runs
    await prisma.groupExpenseMember.deleteMany({ where: { groupExpense: { userId: CREATOR_ID } } });
    await prisma.groupExpense.deleteMany({ where: { userId: CREATOR_ID } });
    await prisma.transaction.deleteMany({ where: { userId: CREATOR_ID } });
    await prisma.journalEntry.deleteMany({ where: { userId: CREATOR_ID } });
    await prisma.notification.deleteMany({ where: { userId: { in: [CREATOR_ID, PARTICIPANT_ID] } } });

    creatorToken = getSignedAuthToken(CREATOR_ID, 'user', 'creator@example.com');
    participantToken = getSignedAuthToken(PARTICIPANT_ID, 'user', 'jijo@example.com');
  });

  afterAll(async () => {
    // Clean up
    await prisma.groupExpenseMember.deleteMany({ where: { groupExpense: { userId: CREATOR_ID } } });
    await prisma.groupExpense.deleteMany({ where: { userId: CREATOR_ID } });
    await prisma.transaction.deleteMany({ where: { userId: CREATOR_ID } });
    await prisma.journalEntry.deleteMany({ where: { userId: CREATOR_ID } });
    await prisma.notification.deleteMany({ where: { userId: { in: [CREATOR_ID, PARTICIPANT_ID] } } });
  });

  it('1. Double-Entry Balance Check on Creation', async () => {
    // Post new Group Expense: ₹5,100 total, creator share ₹2,550, Jijo share ₹2,550
    const res = await request(app)
      .post(`${API}/groups`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        name: 'Bike Service',
        totalAmount: 5100,
        paidBy: 'creator-bank-acc',
        date: new Date(),
        category: 'Vehicle Maintenance',
        yourShare: 2550,
        splitType: 'equal',
        members: [
          { name: 'You', share: 2550, isCurrentUser: true, paid: true },
          { name: 'Jijo', share: 2550, email: 'jijo@example.com', paid: false }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const groupExpenseId = res.body.data.id;

    // Verify JournalEntry was created
    const journal = await prisma.journalEntry.findFirst({
      where: { referenceId: groupExpenseId, referenceType: LedgerReferenceType.GROUP_EXPENSE }
    });
    expect(journal).toBeDefined();

    // Verify Legs and Double-Entry Balance (Debits = Credits)
    const legs = await prisma.transaction.findMany({
      where: { journalEntryId: journal!.id }
    });

    // Leg 1: Cash Outflow (-5100, POSTED)
    const outflowLeg = legs.find(l => l.type === 'expense');
    expect(outflowLeg).toBeDefined();
    expect(Number(outflowLeg!.amount)).toBe(5100);
    expect(outflowLeg!.status).toBe(LedgerStatus.POSTED);
    expect(outflowLeg!.category).toBe('Vehicle Maintenance');

    // Leg 2: Jijo Receivable Split (+2550, PENDING)
    const pendingLeg = legs.find(l => l.type === 'income' && l.status === LedgerStatus.PENDING);
    expect(pendingLeg).toBeDefined();
    expect(Number(pendingLeg!.amount)).toBe(2550);
    expect(pendingLeg!.category).toBe('Vehicle Maintenance');

    // Leg 3: Creator's own share offset (+2550, POSTED, skipBalanceUpdate)
    const offsetLeg = legs.find(l => l.type === 'income' && l.category === 'Personal Share Offset');
    expect(offsetLeg).toBeDefined();
    expect(Number(offsetLeg!.amount)).toBe(2550);
    expect(offsetLeg!.status).toBe(LedgerStatus.POSTED);

    // Sum validation
    const debits = legs.filter(l => l.type === 'income').reduce((sum, l) => sum + Number(l.amount), 0);
    const credits = legs.filter(l => l.type === 'expense').reduce((sum, l) => sum + Number(l.amount), 0);
    expect(debits).toBe(5100);
    expect(credits).toBe(5100);

    // Check account balance: cash balance should have decreased by exactly ₹5,100!
    // Since original balance was 10000, new balance should be 4900.
    const account = await prisma.account.findUnique({ where: { id: 'creator-bank-acc' } });
    expect(Number(account!.balance)).toBe(4900);
  });

  it('2. Filter statement check (Global Offset isolation)', async () => {
    // Fetch transactions list
    const res = await request(app)
      .get(`${API}/transactions`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const txs = res.body.data;
    // Verify that offset transaction (category = 'Personal Share Offset') is NOT in the returned feed
    const offsetTx = txs.find((t: any) => t.category === 'Personal Share Offset');
    expect(offsetTx).toBeUndefined();

    // Outflow transaction (Bike Service -5100) must be present
    const outflowTx = txs.find((t: any) => t.type === 'expense' && Number(t.amount) === 5100);
    expect(outflowTx).toBeDefined();
  });

  it('3. Partial Settlement Flow (Receivable cancellation & cash append)', async () => {
    const groupExpense = await prisma.groupExpense.findFirst({
      where: { userId: CREATOR_ID, name: 'Bike Service' }
    });

    const members = await prisma.groupExpenseMember.findMany({
      where: { groupExpenseId: groupExpense!.id }
    });
    const jijoMember = members.find(m => m.name === 'Jijo')!;

    const pendingTx = await prisma.transaction.findFirst({
      where: {
        userId: CREATOR_ID,
        idempotencyKey: `group-receivable-${groupExpense!.id}-${jijoMember.id}`,
        status: LedgerStatus.PENDING
      }
    });

    expect(pendingTx).toBeDefined();

    // Call settleJournalEntryLeg with partial amount ₹1,000
    await prisma.$transaction(async (tx) => {
      await FinancialLedgerService.settleJournalEntryLeg(
        tx,
        CREATOR_ID,
        pendingTx!.id,
        'creator-bank-acc',
        1000,
        FinancialEventType.SETTLEMENT
      );
    }, { timeout: 30000 });

    // Assert original pending receivable leg is REVERSED
    const cancelledTx = await prisma.transaction.findUnique({ where: { id: pendingTx!.id } });
    expect(cancelledTx!.status).toBe(LedgerStatus.REVERSED);

    // Assert a new posted settlement leg is appended (₹1,000, POSTED)
    const postedSettlement = await prisma.transaction.findFirst({
      where: {
        userId: CREATOR_ID,
        referenceType: LedgerReferenceType.GROUP_SETTLEMENT,
        status: LedgerStatus.POSTED,
        amount: new Decimal(1000)
      }
    });
    expect(postedSettlement).toBeDefined();
    expect(postedSettlement!.description).toContain('from Bike Service');

    // Assert a new pending receivable leg is appended for the remainder (₹1,550, PENDING)
    const remainderTx = await prisma.transaction.findFirst({
      where: {
        userId: CREATOR_ID,
        idempotencyKey: `settlement-remainder-${pendingTx!.id}-1550.00`,
        status: LedgerStatus.PENDING
      }
    });
    expect(remainderTx).toBeDefined();
    expect(Number(remainderTx!.amount)).toBe(1550);

    // Cash balance should increase from 4900 by 1000 to 5900!
    const account = await prisma.account.findUnique({ where: { id: 'creator-bank-acc' } });
    expect(Number(account!.balance)).toBe(5900);
  });

  it('4. Complete Settlement Flow (Participant transitions to Paid)', async () => {
    const groupExpense = await prisma.groupExpense.findFirst({
      where: { userId: CREATOR_ID, name: 'Bike Service' }
    });

    // Now Jijo marks his share as paid completely (transitions from pending to paid)
    // Since creator does it, creator updates group member list.
    const res = await request(app)
      .put(`${API}/groups/${groupExpense!.id}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        members: [
          { name: 'You', share: 2550, isCurrentUser: true, paid: true },
          { name: 'Jijo', share: 2550, email: 'jijo@example.com', paid: true } // Transitions to true!
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check cash balance: 5900 + 1550 = 7450! (Which matches 10000 initial - 2550 creator own share!)
    const account = await prisma.account.findUnique({ where: { id: 'creator-bank-acc' } });
    expect(Number(account!.balance)).toBe(7450);
  });

  it('5. In-App Notifications Outbox & Deduplication', async () => {
    // Look up the notifications created for the Jijo settlement
    const notifications = await prisma.notification.findMany({
      where: { userId: CREATOR_ID, type: 'group_expense' }
    });

    // Verify at least one notification exists for settlement
    expect(notifications.length).toBeGreaterThan(0);
    const creatorNotif = notifications.find(n => n.title === 'Settlement Received');
    expect(creatorNotif).toBeDefined();
    expect(creatorNotif!.requestId).toBeDefined();

    // Try to post duplicate notification with same requestId
    const { dispatchNotification } = require('../../../../backend/src/features/notifications/notification.dispatcher');
    const dispatchResult = await dispatchNotification({
      userId: CREATOR_ID,
      title: 'Settlement Received',
      message: 'Duplicate msg',
      type: 'group_expense',
      requestId: creatorNotif!.requestId!
    });

    // Should return the existing notification rather than creating a new one
    expect(dispatchResult.id).toBe(creatorNotif!.id);
  });

  it('6. Dashboard Summary & Group Analytics integration', async () => {
    // 1. Dashboard summary check
    const resSummary = await request(app)
      .get(`${API}/dashboard/summary`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(resSummary.status).toBe(200);
    expect(resSummary.body.success).toBe(true);

    const summary = resSummary.body.data;
    // Monthly spending expense must be 5100 (excluding offset category)
    expect(summary.monthlySpending.expense).toBe(5100);
    // Ledger metrics
    expect(summary.ledgerMetrics.grossExpense).toBe(5100);
    expect(summary.ledgerMetrics.recoveredAmount).toBe(2550);
    expect(summary.ledgerMetrics.netExpense).toBe(2550); // 5100 - 2550 = 2550
    expect(summary.ledgerMetrics.moneyToReceive).toBe(0); // settled completely

    // 2. Group Analytics check
    const resAnalytics = await request(app)
      .get(`${API}/groups/analytics`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(resAnalytics.status).toBe(200);
    expect(resAnalytics.body.success).toBe(true);

    const analytics = resAnalytics.body.data;
    expect(analytics.totalGroupExpenses).toBe(5100);
    expect(analytics.totalRecoveredAmount).toBe(2550);
    expect(analytics.pendingCollection).toBe(0);
    expect(analytics.netGroupSpending).toBe(2550);
    expect(analytics.recoveryRate).toBe(100);
  });
});
