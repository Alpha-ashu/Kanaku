-- Migration: 20260812000000_create_untracked_tables
--
-- These eight tables are in schema.prisma and exist in production, but no
-- migration ever created them — they reached the database through `prisma db push`.
-- A database built from the migration history alone (CI's shadow DB, or a new
-- staging/dev environment) therefore broke at 20260813000000, which creates RLS
-- policies on JournalEntry, financial_events, etc. unconditionally.
--
-- Timestamped before 20260813000000 so a from-empty replay creates the tables
-- before those policies. Every statement is idempotent (IF NOT EXISTS / guarded
-- constraints), so on databases that already have the tables — production — it
-- is a no-op when `migrate deploy` applies it. DDL generated from schema.prisma
-- with `prisma migrate diff --from-empty --to-schema`.

DO $$
BEGIN
  CREATE TYPE "RecurringExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "LedgerReferenceType" AS ENUM ('MANUAL', 'GROUP_EXPENSE', 'GROUP_SETTLEMENT', 'GOAL', 'GROUP_GOAL', 'INVESTMENT', 'GROUP_INVESTMENT', 'LOAN', 'LOAN_PAYMENT', 'EMI', 'SAVINGS', 'TRANSFER', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "SourceModule" AS ENUM ('TRANSACTIONS', 'GROUPS', 'GOALS', 'INVESTMENTS', 'LOANS', 'SAVINGS', 'OFFLINE_SYNC');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "LedgerStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "FinancialEventLogType" AS ENUM ('LEDGER_POSTED', 'LEDGER_SETTLED', 'LEDGER_REVERSED', 'TRANSFER_COMPLETED', 'RECURRING_EXECUTED', 'GOAL_CONTRIBUTED', 'GOAL_WITHDRAWN', 'LOAN_DISBURSED', 'LOAN_PAYMENT', 'GROUP_EXPENSE_CREATED', 'GROUP_SETTLEMENT_COMPLETED', 'SNAPSHOT_UPDATED', 'FACTORY_RESET_STARTED', 'FACTORY_RESET_COMPLETED', 'FACTORY_RESET_FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "payload" JSONB,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recurring_executions" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "executedDate" TIMESTAMP(3),
    "journalId" TEXT,
    "transactionId" TEXT,
    "status" "RecurringExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_executions_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE IF NOT EXISTS "api_idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "body_hash" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

CREATE INDEX IF NOT EXISTS "ApprovalRequest_requesterId_idx" ON "ApprovalRequest"("requesterId");

CREATE INDEX IF NOT EXISTS "ApprovalRequest_targetUserId_idx" ON "ApprovalRequest"("targetUserId");

CREATE INDEX IF NOT EXISTS "ApprovalRequest_actionType_idx" ON "ApprovalRequest"("actionType");

CREATE INDEX IF NOT EXISTS "ApprovalRequest_createdAt_idx" ON "ApprovalRequest"("createdAt");

CREATE INDEX IF NOT EXISTS "recurring_executions_ruleId_idx" ON "recurring_executions"("ruleId");

CREATE INDEX IF NOT EXISTS "recurring_executions_status_idx" ON "recurring_executions"("status");

CREATE INDEX IF NOT EXISTS "recurring_executions_scheduledDate_idx" ON "recurring_executions"("scheduledDate");

CREATE INDEX IF NOT EXISTS "recurring_executions_transactionId_idx" ON "recurring_executions"("transactionId");

CREATE UNIQUE INDEX IF NOT EXISTS "recurring_executions_ruleId_scheduledDate_key" ON "recurring_executions"("ruleId", "scheduledDate");

CREATE INDEX IF NOT EXISTS "JournalEntry_userId_idx" ON "JournalEntry"("userId");

CREATE INDEX IF NOT EXISTS "JournalEntry_referenceId_idx" ON "JournalEntry"("referenceId");

CREATE INDEX IF NOT EXISTS "daily_account_balances_userId_date_idx" ON "daily_account_balances"("userId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "daily_account_balances_accountId_date_key" ON "daily_account_balances"("accountId", "date");

CREATE INDEX IF NOT EXISTS "monthly_category_spend_userId_year_month_idx" ON "monthly_category_spend"("userId", "year", "month");

CREATE UNIQUE INDEX IF NOT EXISTS "monthly_category_spend_userId_year_month_category_key" ON "monthly_category_spend"("userId", "year", "month", "category");

CREATE INDEX IF NOT EXISTS "monthly_cashflow_userId_year_month_idx" ON "monthly_cashflow"("userId", "year", "month");

CREATE UNIQUE INDEX IF NOT EXISTS "monthly_cashflow_userId_year_month_key" ON "monthly_cashflow"("userId", "year", "month");

CREATE INDEX IF NOT EXISTS "financial_events_userId_idx" ON "financial_events"("userId");

CREATE INDEX IF NOT EXISTS "financial_events_aggregateId_idx" ON "financial_events"("aggregateId");

CREATE INDEX IF NOT EXISTS "financial_events_aggregateType_idx" ON "financial_events"("aggregateType");

CREATE INDEX IF NOT EXISTS "financial_events_eventType_idx" ON "financial_events"("eventType");

CREATE INDEX IF NOT EXISTS "financial_events_journalEntryId_idx" ON "financial_events"("journalEntryId");

CREATE UNIQUE INDEX IF NOT EXISTS "api_idempotency_keys_key_key" ON "api_idempotency_keys"("key");

CREATE INDEX IF NOT EXISTS "api_idempotency_keys_user_id_idx" ON "api_idempotency_keys"("user_id");

CREATE INDEX IF NOT EXISTS "api_idempotency_keys_expires_at_idx" ON "api_idempotency_keys"("expires_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_requesterId_fkey') THEN
    ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_targetUserId_fkey') THEN
    ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApprovalRequest_reviewedBy_fkey') THEN
    ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recurring_executions_ruleId_fkey') THEN
    ALTER TABLE "recurring_executions" ADD CONSTRAINT "recurring_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "recurring_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JournalEntry_userId_fkey') THEN
    ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
