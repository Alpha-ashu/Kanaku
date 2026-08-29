-- Migration: add_dedup_fields
-- Purpose:
--   1. Add Notification.dedupKey (nullable String, unique) for budget alert
--      and recurring reminder deduplication at the DB level.
--   2. Add RecurringExecution.transactionId (nullable String) to link the
--      created transaction back to its execution record for financial reconciliation.
--
-- These are additive-only changes — no existing rows are modified, no columns
-- are dropped. Safe to apply to production without data loss.

-- 1. Notification.dedupKey
ALTER TABLE "public"."Notification"
  ADD COLUMN IF NOT EXISTS "dedupKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupKey_key"
  ON "public"."Notification" ("dedupKey");

-- 2. RecurringExecution.transactionId
ALTER TABLE "public"."recurring_executions"
  ADD COLUMN IF NOT EXISTS "transactionId" TEXT;

CREATE INDEX IF NOT EXISTS "recurring_executions_transactionId_idx"
  ON "public"."recurring_executions" ("transactionId");

-- Ensure the existing @@unique([ruleId, scheduledDate]) index exists
-- (it was already created, this is idempotent via IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "recurring_executions_ruleId_scheduledDate_key"
  ON "public"."recurring_executions" ("ruleId", "scheduledDate");
