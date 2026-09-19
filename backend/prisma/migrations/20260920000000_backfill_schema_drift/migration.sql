-- Migration: backfill_schema_drift
--
-- Why this exists:
--   schema.prisma declares objects that production gained out-of-band
--   (`db push`, backend/scripts/migrate-ledger-schema.cjs and friends) and that
--   no migration ever created: the Ledger V2 tables (JournalEntry,
--   financial_events, daily_account_balances, monthly_*), their enum types, the
--   ledger columns on "Transaction", User.accountType/demoStatus/emailVerified,
--   the factory-reset columns on UserSettings, and the CollaborationParticipant
--   phone/friend columns. A database built from migrations therefore did not
--   match what the app queries (e.g. every auth lookup selects "emailVerified").
--
--   This migration is ADDITIVE and IDEMPOTENT only (IF NOT EXISTS,
--   duplicate_object / unique_violation guards), so on production — where these
--   objects already exist — it is a no-op. Generated from
--   `prisma migrate diff --from-config-datasource --to-schema` against a database
--   built from all earlier migrations, then filtered to additive statements.
--
--   Deliberately NOT included (they would drop or retype live objects; they need
--   a comparison against the production catalog first — see the 2026-09-20 gap
--   review): the runtime-created todo_lists/todo_items/todo_list_shares tables
--   that schema.prisma does not model, the global *_clientRequestId_key unique
--   indexes superseded by per-user ones, and the voice_* column type differences.

-- Enums
DO $$ BEGIN
  CREATE TYPE "LedgerReferenceType" AS ENUM ('MANUAL', 'GROUP_EXPENSE', 'GROUP_SETTLEMENT', 'GOAL', 'GROUP_GOAL', 'INVESTMENT', 'GROUP_INVESTMENT', 'LOAN', 'LOAN_PAYMENT', 'EMI', 'SAVINGS', 'TRANSFER', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SourceModule" AS ENUM ('TRANSACTIONS', 'GROUPS', 'GOALS', 'INVESTMENTS', 'LOANS', 'SAVINGS', 'OFFLINE_SYNC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LedgerDirection" AS ENUM ('INFLOW', 'OUTFLOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinancialEventType" AS ENUM ('CREATE', 'UPDATE', 'REVERSAL', 'SETTLEMENT', 'REFUND', 'TRANSFER', 'WITHDRAWAL', 'CONTRIBUTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinancialEventLogType" AS ENUM ('LEDGER_POSTED', 'LEDGER_SETTLED', 'LEDGER_REVERSED', 'TRANSFER_COMPLETED', 'RECURRING_EXECUTED', 'GOAL_CONTRIBUTED', 'GOAL_WITHDRAWN', 'LOAN_DISBURSED', 'LOAN_PAYMENT', 'GROUP_EXPENSE_CREATED', 'GROUP_SETTLEMENT_COMPLETED', 'SNAPSHOT_UPDATED', 'FACTORY_RESET_STARTED', 'FACTORY_RESET_COMPLETED', 'FACTORY_RESET_FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS "JournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "daily_account_balances" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_account_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "monthly_category_spend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "monthly_category_spend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "monthly_cashflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "income" DECIMAL(12,2) NOT NULL,
    "expense" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "monthly_cashflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "financial_events" (
    "id" TEXT NOT NULL,
    "eventType" "FinancialEventLogType" NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "transactionId" TEXT,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "correlationId" TEXT,
    "requestId" TEXT,
    "sessionId" TEXT,
    "sourceModule" "SourceModule",
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_events_pkey" PRIMARY KEY ("id")
);

-- Columns
ALTER TABLE "CollaborationParticipant" ADD COLUMN IF NOT EXISTS "friendId" TEXT;
ALTER TABLE "CollaborationParticipant" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "CollaborationParticipant" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "CollaborationParticipant" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "direction" "LedgerDirection" NOT NULL DEFAULT 'OUTFLOW';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "eventType" "FinancialEventType" NOT NULL DEFAULT 'CREATE';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(18,8);
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "ledgerVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "referenceId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "referenceType" "LedgerReferenceType" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "sequenceNumber" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "sourceModule" "SourceModule" NOT NULL DEFAULT 'TRANSACTIONS';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "status" "LedgerStatus" NOT NULL DEFAULT 'POSTED';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "demoStatus" TEXT NOT NULL DEFAULT 'ENABLED';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "factoryResetCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "factoryResetVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserSettings" ADD COLUMN IF NOT EXISTS "lastFactoryResetAt" TIMESTAMP(3);

-- Indexes
CREATE INDEX IF NOT EXISTS "JournalEntry_userId_idx" ON "JournalEntry"("userId");
CREATE INDEX IF NOT EXISTS "JournalEntry_referenceId_idx" ON "JournalEntry"("referenceId");
CREATE INDEX IF NOT EXISTS "daily_account_balances_userId_date_idx" ON "daily_account_balances"("userId", "date");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "daily_account_balances_accountId_date_key" ON "daily_account_balances"("accountId", "date");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "monthly_category_spend_userId_year_month_idx" ON "monthly_category_spend"("userId", "year", "month");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "monthly_category_spend_userId_year_month_category_key" ON "monthly_category_spend"("userId", "year", "month", "category");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "monthly_cashflow_userId_year_month_idx" ON "monthly_cashflow"("userId", "year", "month");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cashflow_userId_year_month_key" ON "monthly_cashflow"("userId", "year", "month");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "financial_events_userId_idx" ON "financial_events"("userId");
CREATE INDEX IF NOT EXISTS "financial_events_aggregateId_idx" ON "financial_events"("aggregateId");
CREATE INDEX IF NOT EXISTS "financial_events_aggregateType_idx" ON "financial_events"("aggregateType");
CREATE INDEX IF NOT EXISTS "financial_events_eventType_idx" ON "financial_events"("eventType");
CREATE INDEX IF NOT EXISTS "financial_events_journalEntryId_idx" ON "financial_events"("journalEntryId");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Account_userId_clientRequestId_key" ON "Account"("userId", "clientRequestId");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CollaborationParticipant_phone_idx" ON "CollaborationParticipant"("phone");
CREATE INDEX IF NOT EXISTS "CollaborationParticipant_friendId_idx" ON "CollaborationParticipant"("friendId");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Goal_userId_clientRequestId_key" ON "Goal"("userId", "clientRequestId");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "GroupExpenseMember_groupExpenseId_userId_idx" ON "GroupExpenseMember"("groupExpenseId", "userId");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Investment_userId_clientRequestId_key" ON "Investment"("userId", "clientRequestId");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Loan_userId_clientRequestId_key" ON "Loan"("userId", "clientRequestId");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Payment_transactionId_key" ON "Payment"("transactionId");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_sequenceNumber_key" ON "Transaction"("sequenceNumber");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Transaction_referenceId_idx" ON "Transaction"("referenceId");
CREATE INDEX IF NOT EXISTS "Transaction_journalEntryId_idx" ON "Transaction"("journalEntryId");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_userId_sourceModule_idempotencyKey_key" ON "Transaction"("userId", "sourceModule", "idempotencyKey");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "User_accountType_idx" ON "User"("accountType");
CREATE INDEX IF NOT EXISTS "User_demoStatus_idx" ON "User"("demoStatus");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_emailVerified_idx" ON "User"("emailVerified");
CREATE INDEX IF NOT EXISTS "recurring_transactions_status_nextDueDate_idx" ON "recurring_transactions"("status", "nextDueDate");
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "recurring_transactions_userId_clientRequestId_key" ON "recurring_transactions"("userId", "clientRequestId");
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
