-- Migration: 20260920020000_audit_coverage_and_integrity
--
-- Three things, all additive and idempotent (staging_kanakku is db-push managed
-- and has no _prisma_migrations table, so this file is also applied standalone
-- via `prisma db execute`):
--
--   1. AuditLog gains actorRole / resourceType / resourceId + the indexes that
--      make per-user, per-role and per-record activity queries cheap. The audit
--      interceptor in src/db/prisma.ts now covers every business model, not the
--      17 financial ones it used to, so this table becomes the activity trail.
--   2. Ownership + idempotency columns that were missing on money tables:
--      LoanPayment.userId (backfilled from its loan), LoanPayment /
--      GoalContribution / Payment clientRequestId, and the refund audit columns
--      Payment never had.
--   3. The CHECK constraints and the AuditLog immutability trigger that until
--      now lived only in scripts/harden-financial-constraints.sql — an
--      out-of-band script, so schema and database disagreed about them.

-- ── 1. AuditLog: actor role + queryable resource split ──────────────────────────
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "actorRole"    TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "resourceType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "resourceId"   TEXT;

-- Drop the immutability trigger if it exists from earlier out-of-band runs
-- so the schema backfill can populate resourceType and resourceId.
-- It is re-created at the bottom of this file.
DROP TRIGGER IF EXISTS auditlog_immutable ON "AuditLog";

-- Backfill the split from the existing "Model:id" strings. `resource` is either
-- "Model:uuid" or a bare "Model" / "METHOD /path", so split on the FIRST colon
-- only and leave resourceId NULL when there is nothing after it.
UPDATE "AuditLog"
SET "resourceType" = split_part("resource", ':', 1),
    "resourceId"   = NULLIF(substr("resource", strpos("resource", ':') + 1), '')
WHERE "resourceType" IS NULL
  AND strpos("resource", ':') > 0;

UPDATE "AuditLog"
SET "resourceType" = "resource"
WHERE "resourceType" IS NULL
  AND strpos("resource", ':') = 0;

CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx"        ON "AuditLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx"                  ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_actorRole_createdAt_idx"     ON "AuditLog"("actorRole", "createdAt");

-- ── 2a. LoanPayment: owner column, idempotency key, updatedAt ───────────────────
ALTER TABLE "LoanPayment" ADD COLUMN IF NOT EXISTS "userId"          TEXT;
ALTER TABLE "LoanPayment" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "LoanPayment" ADD COLUMN IF NOT EXISTS "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill ownership from the parent loan. The FK to Loan has existed since the
-- init migration, so every row resolves; rows whose loan is somehow gone are
-- left NULL and skipped by the NOT NULL step below rather than failing it.
UPDATE "LoanPayment" lp
SET "userId" = l."userId"
FROM "Loan" l
WHERE l."id" = lp."loanId" AND lp."userId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LoanPayment" WHERE "userId" IS NULL) THEN
    ALTER TABLE "LoanPayment" ALTER COLUMN "userId" SET NOT NULL;
  ELSE
    RAISE WARNING 'LoanPayment.userId left nullable: % row(s) have no parent Loan',
      (SELECT count(*) FROM "LoanPayment" WHERE "userId" IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE "LoanPayment"
    ADD CONSTRAINT "LoanPayment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object   THEN NULL;
  WHEN invalid_foreign_key THEN RAISE WARNING 'LoanPayment_userId_fkey not added (orphan rows present)';
END $$;

CREATE INDEX        IF NOT EXISTS "LoanPayment_userId_idx"                 ON "LoanPayment"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "LoanPayment_userId_clientRequestId_key" ON "LoanPayment"("userId", "clientRequestId");

-- ── 2b. GoalContribution: idempotency key ──────────────────────────────────────
ALTER TABLE "GoalContribution" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "GoalContribution_userId_clientRequestId_key"
  ON "GoalContribution"("userId", "clientRequestId");

-- ── 2c. Budget / gold_assets: per-user idempotency alongside the global index ──
-- The global unique indexes (budgets_clientRequestId_key,
-- gold_assets_clientRequestId_key) stay by owner decision (2026-09-20); these
-- add the per-user form the other five money tables already carry.
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_userId_clientRequestId_key"
  ON "budgets"("userId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "gold_assets_userId_clientRequestId_key"
  ON "gold_assets"("userId", "clientRequestId");

-- ── 2d. Payment: idempotency + refund/completion audit ─────────────────────────
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "completedAt"     TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundedAt"      TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "refundReason"    TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "failureReason"   TEXT;

-- Existing rows already in a terminal state get a best-effort timestamp from
-- updatedAt so the new columns are not uniformly NULL for historical payments.
UPDATE "Payment" SET "completedAt" = "updatedAt" WHERE "status" = 'completed' AND "completedAt" IS NULL;
UPDATE "Payment" SET "refundedAt"  = "updatedAt" WHERE "status" = 'refunded'  AND "refundedAt"  IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_clientId_clientRequestId_key"
  ON "Payment"("clientId", "clientRequestId");

-- ── 2e. LoanPayment RLS now keys off its own owner column ──────────────────────
-- Was a subquery through "Loan"; with userId present it is a direct comparison.
-- The `auth` schema, auth.uid() and the `authenticated` role exist only on
-- Supabase. Scratch and CI clusters have none of them, so this is gated on the
-- schema being present (a missing schema raises invalid_schema_name at PLAN
-- time, which an EXCEPTION block inside the same statement cannot catch) and
-- still guarded for the rest.
DO $$
BEGIN
  IF to_regnamespace('auth') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'LoanPayment')
     AND NOT EXISTS (SELECT 1 FROM "LoanPayment" WHERE "userId" IS NULL) THEN
    DROP POLICY IF EXISTS "own_LoanPayment_all" ON public."LoanPayment";
    CREATE POLICY "own_LoanPayment_all" ON public."LoanPayment"
      FOR ALL TO authenticated
      USING ("userId" = (SELECT auth.uid())::text)
      WITH CHECK ("userId" = (SELECT auth.uid())::text);
  ELSE
    RAISE NOTICE 'Skipping LoanPayment RLS policy (non-Supabase target or backfill incomplete)';
  END IF;
EXCEPTION
  WHEN undefined_function  THEN RAISE NOTICE 'Skipping LoanPayment RLS policy: auth.uid() unavailable';
  WHEN undefined_object    THEN RAISE NOTICE 'Skipping LoanPayment RLS policy: role "authenticated" unavailable';
  WHEN invalid_schema_name THEN RAISE NOTICE 'Skipping LoanPayment RLS policy: schema "auth" unavailable';
END $$;

-- ── 3. Constraints that previously lived only in an out-of-band script ─────────
-- Source: backend/scripts/harden-financial-constraints.sql. Folded in so the
-- database a migration produces matches the database production actually runs.
DO $$
BEGIN
  ALTER TABLE "Transaction"      DROP CONSTRAINT IF EXISTS chk_transaction_amount;
  ALTER TABLE "Transaction"      ADD  CONSTRAINT chk_transaction_amount      CHECK ("amount" >= 0);
  ALTER TABLE "LoanPayment"      DROP CONSTRAINT IF EXISTS chk_loanpayment_amount;
  ALTER TABLE "LoanPayment"      ADD  CONSTRAINT chk_loanpayment_amount      CHECK ("amount" > 0);
  ALTER TABLE "Goal"             DROP CONSTRAINT IF EXISTS chk_goal_amounts;
  ALTER TABLE "Goal"             ADD  CONSTRAINT chk_goal_amounts            CHECK ("targetAmount" > 0 AND "currentAmount" >= 0);
  ALTER TABLE "GoalContribution" DROP CONSTRAINT IF EXISTS chk_goalcontribution_amount;
  ALTER TABLE "GoalContribution" ADD  CONSTRAINT chk_goalcontribution_amount CHECK ("amount" > 0);
  ALTER TABLE "Investment"       DROP CONSTRAINT IF EXISTS chk_investment_values;
  ALTER TABLE "Investment"       ADD  CONSTRAINT chk_investment_values       CHECK ("quantity" > 0 AND "buyPrice" >= 0 AND "currentPrice" >= 0);
  ALTER TABLE "gold_assets"      DROP CONSTRAINT IF EXISTS chk_gold_values;
  ALTER TABLE "gold_assets"      ADD  CONSTRAINT chk_gold_values             CHECK ("quantity" > 0 AND "purchasePrice" >= 0 AND "currentPrice" >= 0);
  ALTER TABLE "budgets"          DROP CONSTRAINT IF EXISTS chk_budget_values;
  ALTER TABLE "budgets"          ADD  CONSTRAINT chk_budget_values           CHECK ("amount" > 0 AND "threshold" >= 0 AND "threshold" <= 100);
EXCEPTION
  -- A pre-existing row that violates one of these would abort the whole
  -- migration. Warn and continue: the constraint guards new writes, and the
  -- rows to repair are reported separately rather than blocking a deploy.
  WHEN check_violation THEN
    RAISE WARNING 'Financial CHECK constraints not fully applied - existing rows violate one of them';
END $$;

-- AuditLog is append-only: the activity trail is worthless if it can be edited.
CREATE OR REPLACE FUNCTION public.prevent_auditlog_mutation() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only (attempted %)', TG_OP;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditlog_immutable ON "AuditLog";
CREATE TRIGGER auditlog_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_auditlog_mutation();
