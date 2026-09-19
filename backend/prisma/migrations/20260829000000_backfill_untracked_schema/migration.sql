-- Migration: backfill_untracked_schema
--
-- Why this exists:
--   recurring_executions, api_idempotency_keys and ApprovalRequest were created
--   in production out-of-band (`db push` / scripts under backend/scripts), never
--   by a migration — yet 20260830000000_add_dedup_fields and
--   20260912010000_rls_backend_only_tables ALTER them. So `prisma migrate deploy`
--   could not build a fresh database (it failed at 20260830000000 with
--   "relation recurring_executions does not exist") and CI's "Guard schema drift
--   against migrations" step could not pass.
--
--   Dated just before 20260830000000 so a fresh database gets these tables before
--   the first migration that depends on them. Everything is idempotent
--   (IF NOT EXISTS / duplicate_object guards): on production, where the objects
--   already exist, it is a no-op. The rest of the out-of-band schema is caught up
--   by 20260920000000_backfill_schema_drift.

DO $$ BEGIN
  CREATE TYPE "RecurringExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tables

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



-- Columns



-- Indexes

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

CREATE UNIQUE INDEX IF NOT EXISTS "api_idempotency_keys_key_key" ON "api_idempotency_keys"("key");

CREATE INDEX IF NOT EXISTS "api_idempotency_keys_user_id_idx" ON "api_idempotency_keys"("user_id");

CREATE INDEX IF NOT EXISTS "api_idempotency_keys_expires_at_idx" ON "api_idempotency_keys"("expires_at");



-- Foreign keys (guarded: they may already exist)

DO $$ BEGIN
  ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recurring_executions" ADD CONSTRAINT "recurring_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "recurring_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
