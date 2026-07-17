/**
 * KANAKKU — Phase 10 Disaster Recovery Validation Tool.
 *
 * Simulates a disaster event by:
 *  1. backing up database state in-memory (accounts, transactions, journals).
 *  2. corrupting database state (deleting tables, modifying balances to induce drifts).
 *  3. restoring database state from the in-memory backup.
 *  4. executing the reconciliation audit to ensure the database returns to 100% consistency.
 *
 * Run with:
 *   node quality/database/disaster_recovery.cjs
 */
const { PrismaClient } = require('../../backend/generated/prisma');

async function main() {
  console.log('================================================================');
  console.log('         KANAKKU - DISASTER RECOVERY & RESTORE AUDIT           ');
  console.log('================================================================');

  const prisma = new PrismaClient();
  let accountsBackup = [];
  let transactionsBackup = [];
  let journalsBackup = [];

  try {
    await prisma.$connect();
    console.log('⚡ Connected to database.');

    // ── 1. Backup Phase ──────────────────────────────────────────────────────
    console.log('\n> Phase 1: Creating in-memory snapshot backup...');
    accountsBackup = await prisma.account.findMany();
    transactionsBackup = await prisma.transaction.findMany();
    journalsBackup = await prisma.journalEntry.findMany();

    console.log(`   [OK] Accounts backed up:     ${accountsBackup.length}`);
    console.log(`   [OK] Transactions backed up: ${transactionsBackup.length}`);
    console.log(`   [OK] JournalEntries backed up: ${journalsBackup.length}`);

    if (accountsBackup.length === 0) {
      console.warn('   [WARN] Database is empty! Please run the scale benchmark or seed data first.');
      process.exit(0);
    }

    // ── 2. Corrupt / Disaster Phase ──────────────────────────────────────────
    console.log('\n> Phase 2: Simulating Disaster (deleting & corrupting database)...');
    
    // We execute inside a transaction block to make sure we can clean up if the script crashes
    await prisma.$transaction(async (tx) => {
      // Delete all transactions and journals
      await tx.transaction.deleteMany({});
      await tx.journalEntry.deleteMany({});
      
      // Modify balances of accounts to zero (wiping them)
      await tx.account.updateMany({
        data: { balance: 0.00 }
      });
    });
    console.log('   [OK] Database successfully wiped/corrupted.');

    // Verify database reports unhealthy/empty state
    const currentTxCount = await prisma.transaction.count();
    const currentAccs = await prisma.account.findMany();
    const allZeroBalances = currentAccs.every(a => Number(a.balance) === 0);
    if (currentTxCount === 0 && allZeroBalances) {
      console.log('   [OK] Verified: database is in corrupted state.');
    } else {
      throw new Error('Disaster simulation failed to corrupt database tables.');
    }

    // ── 3. Restore Phase ─────────────────────────────────────────────────────
    console.log('\n> Phase 3: Executing Database Restore from snapshot backup...');
    
    await prisma.$transaction(async (tx) => {
      // 1. Restore Journal Entries using createMany (bulk)
      if (journalsBackup.length > 0) {
        await tx.journalEntry.createMany({
          data: journalsBackup.map(journal => ({
            id: journal.id,
            userId: journal.userId,
            sourceModule: journal.sourceModule,
            referenceType: journal.referenceType,
            referenceId: journal.referenceId,
            status: journal.status,
            description: journal.description,
            createdBy: journal.createdBy,
            createdFrom: journal.createdFrom,
            deviceId: journal.deviceId,
            ipAddress: journal.ipAddress,
            requestId: journal.requestId,
            createdAt: journal.createdAt,
            updatedAt: journal.updatedAt,
          }))
        });
      }

      // 2. Restore Transactions using createMany (bulk)
      if (transactionsBackup.length > 0) {
        await tx.transaction.createMany({
          data: transactionsBackup.map(t => ({
            id: t.id,
            userId: t.userId,
            accountId: t.accountId,
            type: t.type,
            amount: t.amount,
            category: t.category,
            subcategory: t.subcategory,
            description: t.description,
            date: t.date,
            referenceType: t.referenceType,
            referenceId: t.referenceId,
            sourceModule: t.sourceModule,
            direction: t.direction,
            eventType: t.eventType,
            idempotencyKey: t.idempotencyKey,
            journalEntryId: t.journalEntryId,
            status: t.status,
            sequenceNumber: t.sequenceNumber,
            metadata: t.metadata ? JSON.parse(JSON.stringify(t.metadata)) : undefined,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }))
        });
      }

      // 3. Restore Account Balances
      for (const acc of accountsBackup) {
        await tx.account.update({
          where: { id: acc.id },
          data: {
            balance: acc.balance,
            openingBalance: acc.openingBalance,
          }
        });
      }
    }, { timeout: 60000 });

    console.log('   [OK] Database restore transaction completed.');

    // ── 4. Verification Phase ────────────────────────────────────────────────
    console.log('\n> Phase 4: Running Integrity & Reconciliation Audits...');
    const verifyTxCount = await prisma.transaction.count();
    const verifyAccCount = await prisma.account.count();
    
    expectEquals(verifyTxCount, transactionsBackup.length, 'Transaction count matches backup');
    expectEquals(verifyAccCount, accountsBackup.length, 'Account count matches backup');

    // Run reconciliation checks
    let driftsFound = 0;
    const restoredAccs = await prisma.account.findMany();
    for (const acc of restoredAccs) {
      const original = accountsBackup.find(a => a.id === acc.id);
      if (original) {
        expectEquals(Number(acc.balance), Number(original.balance), `Account ${acc.name} balance matches backup`);
      }
    }

    console.log('\n================================================================');
    console.log('  🔐 DISASTER RECOVERY VERDICT: SUCCESS (RESTORE IS CONSISTENT) ');
    console.log('================================================================');
    process.exit(0);

  } catch (error) {
    console.error('\n🚨 DISASTER RECOVERY AUDIT FAILED:', error.message);
    console.log('\n> Attempting emergency rollback/restore...');
    
    // Emergency restore if we got interrupted
    try {
      if (accountsBackup.length > 0) {
        for (const acc of accountsBackup) {
          await prisma.account.upsert({
            where: { id: acc.id },
            update: { balance: acc.balance, openingBalance: acc.openingBalance },
            create: {
              id: acc.id,
              userId: acc.userId,
              name: acc.name,
              type: acc.type,
              balance: acc.balance,
              openingBalance: acc.openingBalance,
              currency: acc.currency,
            }
          });
        }
        console.log('   [RECOVERED] Restored accounts safety state.');
      }
    } catch (restoreErr) {
      console.error('CRITICAL: Emergency restore failed:', restoreErr.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function expectEquals(actual, expected, description) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${description}. Expected: ${expected}, Got: ${actual}`);
  }
  console.log(`   [PASS] ${description}`);
}

main();
