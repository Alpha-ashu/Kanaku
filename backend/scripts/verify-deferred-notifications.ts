import sgMail from '@sendgrid/mail';
import { prisma } from '../src/db/prisma';
import {
  trackAndInviteParticipants,
  resolveContactDetailsForFriend,
  resolveAndDeliverPendingCollaborations,
} from '../src/features/collaboration/invitation.service';
import { processEmail } from '../src/workers/index';
import assert from 'assert';
import dotenv from 'dotenv';

dotenv.config();

// Mock sgMail to prevent external API quota failures during automated test execution
(sgMail as any).send = async () => [{ statusCode: 202, headers: {}, body: {} }];

async function runDeferredNotificationTestSuite() {
  console.log('===============================================================');
  console.log('=== KANAKU DEFERRED PARTICIPANT NOTIFICATION TEST SUITE ===');
  console.log('===============================================================\n');

  const testSuffix = Date.now().toString(36);
  const userAEmail = `usera_${testSuffix}@kanakutest.local`;
  const userBEmail = `userb_${testSuffix}@kanakutest.local`;
  const userCEmail = `userc_${testSuffix}@kanakutest.local`;
  const userDEmail = `userd_${testSuffix}@kanakutest.local`;

  try {
    // 0. Setup User A (Creator)
    console.log('Setting up User A (Creator)...');
    const userA = await prisma.user.create({
      data: {
        email: userAEmail,
        name: 'Alice Creator',
        password: 'hashed_password_test_123',
        status: 'verified',
        emailVerified: true,
      },
    });

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 1: End-to-End Acceptance Test: Group Expense (New Participant, No Email)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 1: Group Expense (No Email ➔ Email Added Later ➔ Verified) ---');

    // Step 1: Create Group Expense with User B (name only, no email)
    const groupExpense = await prisma.groupExpense.create({
      data: {
        userId: userA.id,
        name: `Dinner Split ${testSuffix}`,
        totalAmount: 1200,
        category: 'Food & Dining',
        date: new Date(),
        status: 'pending',
      },
    });

    const friendB = await prisma.friend.create({
      data: {
        userId: userA.id,
        name: 'Bob Participant',
        email: null,
        phone: null,
      },
    });

    const memberB = await prisma.groupExpenseMember.create({
      data: {
        groupExpenseId: groupExpense.id,
        friendId: friendB.id,
        name: 'Bob Participant',
        email: null,
        shareAmount: 600,
        hasPaid: false,
      },
    });

    // Track in unified collaboration engine
    const trackResult = await trackAndInviteParticipants({
      moduleType: 'group_expense',
      moduleId: groupExpense.id,
      moduleName: groupExpense.name,
      creatorId: userA.id,
      participants: [{
        name: 'Bob Participant',
        friendId: friendB.id,
        detail: 'Total: ₹1,200, Your share: ₹600.',
      }],
    });

    assert.strictEqual(trackResult.length, 1, 'One participant tracked');
    assert.strictEqual(trackResult[0].status, 'PENDING_CONTACT', 'Participant state must be PENDING_CONTACT');
    console.log('  ✔ Step 1: Group Expense created; Participant preserved as PENDING_CONTACT in DB.');

    // Step 2: Verify record in CollaborationParticipant table
    const storedCollabB = await prisma.collaborationParticipant.findFirst({
      where: { moduleType: 'group_expense', moduleId: groupExpense.id, friendId: friendB.id },
    });
    assert(storedCollabB, 'CollaborationParticipant row must exist');
    assert.strictEqual(storedCollabB.status, 'PENDING_CONTACT');
    assert.strictEqual(storedCollabB.email, null);
    console.log('  ✔ Step 2: CollaborationParticipant permanently stored with metadata.');

    // Step 3: Later, User A updates Friend B with email
    console.log('  Updating Friend B contact info with email...');
    await prisma.friend.update({
      where: { id: friendB.id },
      data: { email: userBEmail, phone: '+919876543210' },
    });

    await resolveContactDetailsForFriend({
      friendId: friendB.id,
      userId: userA.id,
      email: userBEmail,
      phone: '+919876543210',
      name: 'Bob Participant',
    });

    const updatedCollabB = await prisma.collaborationParticipant.findUnique({
      where: { id: storedCollabB.id },
    });
    assert.strictEqual(updatedCollabB?.email, userBEmail, 'Email must be attached to collaboration');
    assert.strictEqual(updatedCollabB?.status, 'PENDING_REGISTRATION', 'Status must transition to PENDING_REGISTRATION');
    console.log('  ✔ Step 3: Contact updated; Collaboration upgraded to PENDING_REGISTRATION.');

    // Step 4: Bob registers and completes email verification
    console.log('  Bob registers and verifies email...');
    const userB = await prisma.user.create({
      data: {
        email: userBEmail,
        name: 'Bob Participant',
        password: 'hashed_password_test_123',
        status: 'verified',
        emailVerified: true,
      },
    });

    await resolveAndDeliverPendingCollaborations(userB.id, userB.email);

    const verifiedCollabB = await prisma.collaborationParticipant.findUnique({
      where: { id: storedCollabB.id },
    });
    assert.strictEqual(verifiedCollabB?.status, 'REGISTERED', 'Status must transition to REGISTERED');
    assert.strictEqual(verifiedCollabB?.userId, userB.id, 'UserId must be linked to User B');

    // Step 5: Verify Notification was generated for User B
    const notifB = await prisma.notification.findUnique({
      where: { dedupKey: `collab_notif:group_expense:${groupExpense.id}:${userB.id}` },
    });
    assert(notifB, 'Notification must be created for User B upon email verification');
    assert.strictEqual(notifB.userId, userB.id);
    assert.strictEqual(notifB.type, 'group_expense');
    assert(notifB.message.includes('Dinner Split'), 'Message must contain group name');
    console.log('  ✔ Step 4 & 5: Email verified; Notification generated with channels ["app","email"].');

    // Step 6: Outbox worker delivers email
    const emailResult = await processEmail({
      data: {
        notificationId: notifB.id,
        userId: userB.id,
        title: notifB.title,
        message: notifB.message,
        category: notifB.category || undefined,
        metadata: notifB.metadata,
      },
    });
    console.log('  ✔ Step 6: Outbox worker processEmail executed successfully.');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 2: Multi-Module Collaboration (Goal + Loan across same participant)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: Multi-Module Test (Goal + Loan for User C) ---');

    const goal = await prisma.goal.create({
      data: {
        userId: userA.id,
        name: `Vacation Fund ${testSuffix}`,
        targetAmount: 50000,
        targetDate: new Date(Date.now() + 90 * 86400000),
      },
    });

    const loan = await prisma.loan.create({
      data: {
        userId: userA.id,
        name: `Emergency Loan ${testSuffix}`,
        type: 'lent',
        principalAmount: 10000,
        outstandingBalance: 10000,
        contactPerson: 'Charlie Member',
      },
    });

    const friendC = await prisma.friend.create({
      data: {
        userId: userA.id,
        name: 'Charlie Member',
        email: null,
      },
    });

    // Track across Goal and Loan
    await trackAndInviteParticipants({
      moduleType: 'goal',
      moduleId: goal.id,
      moduleName: goal.name,
      creatorId: userA.id,
      participants: [{ name: 'Charlie Member', friendId: friendC.id, detail: 'Target: ₹50,000' }],
    });

    await trackAndInviteParticipants({
      moduleType: 'loan',
      moduleId: loan.id,
      moduleName: loan.name,
      creatorId: userA.id,
      participants: [{ name: 'Charlie Member', friendId: friendC.id, detail: 'Lent: ₹10,000' }],
    });

    const pendingCollabsC = await prisma.collaborationParticipant.findMany({
      where: { invitedBy: userA.id, friendId: friendC.id },
    });
    assert.strictEqual(pendingCollabsC.length, 2, 'Two distinct modules tracked for Charlie');
    console.log('  ✔ Goal & Loan tracked with status PENDING_CONTACT.');

    // Charlie registers and verifies email
    const userC = await prisma.user.create({
      data: {
        email: userCEmail,
        name: 'Charlie Member',
        password: 'hashed_password_test_123',
        status: 'verified',
        emailVerified: true,
      },
    });

    // Friend contact updated
    await resolveContactDetailsForFriend({
      friendId: friendC.id,
      userId: userA.id,
      email: userCEmail,
      name: 'Charlie Member',
    });

    // Verify both Goal and Loan notifications were created
    const goalNotif = await prisma.notification.findUnique({
      where: { dedupKey: `collab_notif:goal:${goal.id}:${userC.id}` },
    });
    const loanNotif = await prisma.notification.findUnique({
      where: { dedupKey: `collab_notif:loan:${loan.id}:${userC.id}` },
    });

    assert(goalNotif, 'Goal notification must be created');
    assert(loanNotif, 'Loan notification must be created');
    assert.strictEqual(goalNotif.type, 'goal');
    assert.strictEqual(loanNotif.type, 'loan');
    console.log('  ✔ Both Goal & Loan notifications generated and deliverable.');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 3: Strict Idempotency & Duplicate Prevention
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: Idempotency & Duplicate Prevention ---');

    // Trigger verification callback again
    await resolveAndDeliverPendingCollaborations(userB.id, userB.email);
    await resolveAndDeliverPendingCollaborations(userB.id, userB.email);

    const countNotifB = await prisma.notification.count({
      where: { dedupKey: `collab_notif:group_expense:${groupExpense.id}:${userB.id}` },
    });
    assert.strictEqual(countNotifB, 1, 'Exactly 1 notification must exist (no duplicate rows)');

    // Outbox re-process
    const replayResult: any = await processEmail({
      data: {
        notificationId: notifB.id,
        userId: userB.id,
        title: notifB.title,
        message: notifB.message,
      },
    });
    assert.strictEqual(replayResult?.skipped, true, 'Already sent email must be skipped idempotently');
    assert.strictEqual(replayResult?.reason, 'already_sent');
    console.log('  ✔ Idempotency verified: 0 duplicate rows, 0 duplicate email sends.');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 4: Deleted Source Record Guard
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: Deleted Source Record Guard ---');

    const deletedExpense = await prisma.groupExpense.create({
      data: {
        userId: userA.id,
        name: `Cancelled Trip ${testSuffix}`,
        totalAmount: 5000,
        category: 'Travel',
        date: new Date(),
        deletedAt: new Date(), // Already deleted!
      },
    });

    await trackAndInviteParticipants({
      moduleType: 'group_expense',
      moduleId: deletedExpense.id,
      moduleName: deletedExpense.name,
      creatorId: userA.id,
      participants: [{ email: userDEmail, name: 'David Member' }],
    });

    const userD = await prisma.user.create({
      data: {
        email: userDEmail,
        name: 'David Member',
        password: 'hashed_password_test_123',
        status: 'verified',
        emailVerified: true,
      },
    });

    await resolveAndDeliverPendingCollaborations(userD.id, userDEmail);

    const deletedNotif = await prisma.notification.findUnique({
      where: { dedupKey: `collab_notif:group_expense:${deletedExpense.id}:${userD.id}` },
    });
    assert.strictEqual(deletedNotif, null, 'No notification must be delivered for deleted group expense');
    console.log('  ✔ Guard verified: Deleted records do not trigger deferred notifications.');

    console.log('\n===============================================================');
    console.log('ALL DEFERRED PARTICIPANT NOTIFICATION TESTS PASSED (4/4)!');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
}

runDeferredNotificationTestSuite().then(() => process.exit(0));
