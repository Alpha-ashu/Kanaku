import jwt from 'jsonwebtoken';
import { prisma } from '../../../../backend/src/db/prisma';
import { Prisma } from '../../../../backend/src/db/prisma-client';
const { Decimal } = Prisma;
import { FinancialLedgerService } from '../../../../backend/src/features/transactions/ledger.service';
import { FinancialEventStore } from '../../../../backend/src/features/events/eventStore';

describe('Financial Event Store & Outbox Integration Tests', () => {
  const TEST_USER = 'event-store-test-user';
  let accountId: string;

  beforeAll(async () => {
    // Clean up any old test data
    await prisma.financialEvent.deleteMany({ where: { userId: TEST_USER } });
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER } });
    await prisma.user.deleteMany({ where: { id: TEST_USER } });

    // Seed test user
    await prisma.user.create({
      data: {
        id: TEST_USER,
        email: 'eventstore@example.com',
        name: 'Event Store User',
        password: 'dummy_password_hash',
        role: 'admin',
        isApproved: true,
      },
    });

    // Seed test account
    const acc = await prisma.account.create({
      data: {
        userId: TEST_USER,
        name: 'Event Store Checking',
        type: 'checking',
        balance: 1000.00,
        openingBalance: 1000.00,
        currency: 'INR',
      },
    });
    accountId = acc.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.financialEvent.deleteMany({ where: { userId: TEST_USER } });
    await prisma.transaction.deleteMany({ where: { userId: TEST_USER } });
    await prisma.account.deleteMany({ where: { userId: TEST_USER } });
    await prisma.user.deleteMany({ where: { id: TEST_USER } });
  });

  it('should transactionally append to the FinancialEvent store when a journal entry is posted', async () => {
    // We execute inside a mock transaction using the service
    const journal = await prisma.$transaction(async (tx) => {
      return await FinancialLedgerService.postJournalEntry(
        tx,
        {
          userId: TEST_USER,
          sourceModule: 'TRANSACTIONS',
          referenceType: 'MANUAL',
          description: 'Salary Posting',
          requestId: 'req-event-store-test-123'
        },
        [
          {
            accountId,
            type: 'income',
            amount: 500.00,
            category: 'Salary',
            description: 'Direct Deposit',
            idempotencyKey: 'idemp-event-store-1'
          }
        ]
      );
    });

    // Verify journal exists
    expect(journal).toBeDefined();

    // Verify event is recorded in the Event Store
    const events = await FinancialEventStore.getEventsByUser(prisma, TEST_USER);
    expect(events.length).toBeGreaterThan(0);

    const postEvent = events.find(e => e.eventType === 'LEDGER_POSTED');
    expect(postEvent).toBeDefined();
    expect(postEvent!.aggregateType).toBe('JournalEntry');
    expect(postEvent!.aggregateId).toBe(journal.id);
    expect(postEvent!.journalEntryId).toBe(journal.id);
    expect(postEvent!.eventVersion).toBe(1);
    expect(postEvent!.requestId).toBe('req-event-store-test-123');

    // Verify aggregate queries
    const aggregateEvents = await FinancialEventStore.getEventsByAggregate(prisma, journal.id);
    expect(aggregateEvents.length).toBe(1);
    expect(aggregateEvents[0].id).toBe(postEvent!.id);
  });
});
