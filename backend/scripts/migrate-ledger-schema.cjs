const path = require('path');
if (process.argv.includes('--test')) {
  console.log('[Migration] Running in TEST mode. Loading .env.test...');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });
} else {
  require('dotenv').config();
}

const { PrismaClient } = require('../generated/prisma');

async function main() {
  const prisma = new PrismaClient();
  console.log('[Migration] Connecting to database...');
  await prisma.$connect();
  console.log('[Migration] Connected.');

  const runSql = async (sql) => {
    try {
      console.log(`[Migration] Executing: ${sql.slice(0, 100)}...`);
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate'))) {
        console.log('[Migration] Already exists, skipping.');
      } else {
        console.error('[Migration] Error executing SQL:', err);
        throw err;
      }
    }
  };

  // 1. Create Enums if they do not exist
  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerReferenceType') THEN
        CREATE TYPE "LedgerReferenceType" AS ENUM (
          'MANUAL', 'GROUP_EXPENSE', 'GROUP_SETTLEMENT', 'GOAL', 'GROUP_GOAL',
          'INVESTMENT', 'GROUP_INVESTMENT', 'LOAN', 'LOAN_PAYMENT', 'EMI',
          'SAVINGS', 'TRANSFER', 'SYSTEM'
        );
      END IF;
    END$$;
  `);

  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SourceModule') THEN
        CREATE TYPE "SourceModule" AS ENUM (
          'TRANSACTIONS', 'GROUPS', 'GOALS', 'INVESTMENTS', 'LOANS', 'SAVINGS', 'OFFLINE_SYNC'
        );
      END IF;
    END$$;
  `);

  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerDirection') THEN
        CREATE TYPE "LedgerDirection" AS ENUM ('INFLOW', 'OUTFLOW');
      END IF;
    END$$;
  `);

  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialEventType') THEN
        CREATE TYPE "FinancialEventType" AS ENUM (
          'CREATE', 'UPDATE', 'REVERSAL', 'SETTLEMENT', 'REFUND', 'TRANSFER', 'WITHDRAWAL', 'CONTRIBUTION'
        );
      END IF;
    END$$;
  `);

  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LedgerStatus') THEN
        CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED', 'FAILED');
      END IF;
    END$$;
  `);

  // 2. Create JournalEntry Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS "JournalEntry" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "sourceModule" "SourceModule" NOT NULL,
      "referenceType" "LedgerReferenceType" NOT NULL,
      "referenceId" TEXT,
      "status" "LedgerStatus" NOT NULL DEFAULT 'POSTED',
      "description" TEXT,
      "eventVersion" INTEGER NOT NULL DEFAULT 1,
      "createdBy" TEXT,
      "createdFrom" TEXT,
      "deviceId" TEXT,
      "ipAddress" TEXT,
      "requestId" TEXT,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  // Create indexes on JournalEntry
  await runSql(`CREATE INDEX IF NOT EXISTS "JournalEntry_userId_idx" ON "JournalEntry"("userId");`);
  await runSql(`CREATE INDEX IF NOT EXISTS "JournalEntry_referenceId_idx" ON "JournalEntry"("referenceId");`);

  // 3. Add Columns to Transaction Table
  const addColumn = async (colName, colType, defaultVal = null) => {
    const checkSql = `
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'Transaction' AND column_name = '${colName}'
    `;
    const colExists = await prisma.$queryRawUnsafe(checkSql);
    if (colExists.length === 0) {
      const defaultClause = defaultVal !== null ? ` DEFAULT ${defaultVal}` : '';
      await runSql(`ALTER TABLE "Transaction" ADD COLUMN "${colName}" ${colType}${defaultClause};`);
    } else {
      console.log(`[Migration] Column ${colName} already exists on Transaction, skipping.`);
    }
  };

  await addColumn('referenceType', '"LedgerReferenceType"', "'MANUAL'");
  await addColumn('referenceId', 'TEXT');
  await addColumn('sourceModule', '"SourceModule"', "'TRANSACTIONS'");
  await addColumn('direction', '"LedgerDirection"', "'OUTFLOW'");
  await addColumn('eventType', '"FinancialEventType"', "'CREATE'");
  await addColumn('idempotencyKey', 'TEXT');
  await addColumn('ledgerVersion', 'INTEGER', '1');
  await addColumn('journalEntryId', 'TEXT');
  await addColumn('status', '"LedgerStatus"', "'POSTED'");
  await addColumn('currency', 'TEXT');
  await addColumn('exchangeRate', 'DECIMAL(18, 8)');
  await addColumn('sequenceNumber', 'TEXT');
  await addColumn('metadata', 'JSONB');

  // 4. Add Constraint
  await runSql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'Transaction_journalEntryId_fkey'
      ) THEN
        ALTER TABLE "Transaction" 
          ADD CONSTRAINT "Transaction_journalEntryId_fkey" 
          FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL;
      END IF;
    END$$;
  `);

  // 5. Add Indexes
  await runSql(`CREATE INDEX IF NOT EXISTS "Transaction_referenceId_idx" ON "Transaction"("referenceId");`);
  await runSql(`CREATE INDEX IF NOT EXISTS "Transaction_journalEntryId_idx" ON "Transaction"("journalEntryId");`);

  // Unique constraint for idempotency
  await runSql(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_userId_sourceModule_idempotencyKey_key" 
    ON "Transaction"("userId", "sourceModule", "idempotencyKey") 
    WHERE "idempotencyKey" IS NOT NULL;
  `);

  // Unique constraint for sequence number
  await runSql(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_sequenceNumber_key" 
    ON "Transaction"("sequenceNumber") 
    WHERE "sequenceNumber" IS NOT NULL;
  `);

  console.log('[Migration] Schema migration completed successfully!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[Migration] Migration failed:', err);
  process.exit(1);
});
