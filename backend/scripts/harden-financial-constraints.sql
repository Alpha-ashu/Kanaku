-- ============================================================================
--  SUPERSEDED — do not run this script.
-- ----------------------------------------------------------------------------
--  Everything here now lives in a tracked migration:
--    prisma/migrations/20260920020000_audit_coverage_and_integrity
--
--  It was folded in because keeping it out-of-band meant the schema a migration
--  produces and the schema production actually runs disagreed about these
--  constraints — `migrate diff` reported clean while prod carried objects no
--  migration had created.
--
--  Running it now would be actively harmful: its version of
--  `prevent_auditlog_mutation()` refuses EVERY delete, while the migration's
--  version allows deletes outside the 730-day retention window. Re-installing
--  the strict one breaks the nightly AuditLog purge in
--  src/workers/cleanup.worker.ts, and AuditLog — which now records every
--  business model, not just the 17 financial ones — would grow without bound.
--
--  Kept in the tree only as the historical record of what prod had before
--  2026-09-20.
-- ============================================================================

-- Server-side guard rather than psql's \quit: this file is documented to run
-- through `prisma db execute`, which ships it to the server as plain SQL and
-- never interprets psql meta-commands. Raising aborts either way.
DO $guard$
BEGIN
  RAISE EXCEPTION
    'REFUSED: superseded by migration 20260920020000_audit_coverage_and_integrity. %',
    'Running this would reinstate the strict AuditLog trigger and break retention.';
END;
$guard$;

BEGIN;

-- ── Quantitative business-rule CHECK constraints ────────────────────────────
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS chk_transaction_amount;
ALTER TABLE "Transaction" ADD  CONSTRAINT chk_transaction_amount CHECK ("amount" >= 0);

ALTER TABLE "Loan" DROP CONSTRAINT IF EXISTS chk_loan_amounts;
ALTER TABLE "Loan" ADD  CONSTRAINT chk_loan_amounts CHECK (
  "principalAmount" > 0
  AND "outstandingBalance" >= 0
  AND ("interestRate" IS NULL OR ("interestRate" >= 0 AND "interestRate" <= 100))
  AND ("emiAmount" IS NULL OR "emiAmount" >= 0)
);

ALTER TABLE "LoanPayment" DROP CONSTRAINT IF EXISTS chk_loanpayment_amount;
ALTER TABLE "LoanPayment" ADD  CONSTRAINT chk_loanpayment_amount CHECK ("amount" > 0);

ALTER TABLE "Goal" DROP CONSTRAINT IF EXISTS chk_goal_amounts;
ALTER TABLE "Goal" ADD  CONSTRAINT chk_goal_amounts CHECK ("targetAmount" > 0 AND "currentAmount" >= 0);

ALTER TABLE "GoalContribution" DROP CONSTRAINT IF EXISTS chk_goalcontribution_amount;
ALTER TABLE "GoalContribution" ADD  CONSTRAINT chk_goalcontribution_amount CHECK ("amount" > 0);

ALTER TABLE "Investment" DROP CONSTRAINT IF EXISTS chk_investment_values;
ALTER TABLE "Investment" ADD  CONSTRAINT chk_investment_values CHECK ("quantity" > 0 AND "buyPrice" >= 0 AND "currentPrice" >= 0);

ALTER TABLE "gold_assets" DROP CONSTRAINT IF EXISTS chk_gold_values;
ALTER TABLE "gold_assets" ADD  CONSTRAINT chk_gold_values CHECK ("quantity" > 0 AND "purchasePrice" >= 0 AND "currentPrice" >= 0);

ALTER TABLE "budgets" DROP CONSTRAINT IF EXISTS chk_budget_values;
ALTER TABLE "budgets" ADD  CONSTRAINT chk_budget_values CHECK ("amount" > 0 AND "threshold" >= 0 AND "threshold" <= 100);

-- ── Immutable, append-only AuditLog ─────────────────────────────────────────
-- The application only ever INSERTs audit rows (allowed). UPDATE/DELETE on
-- AuditLog is blocked at the DB level so the trail cannot be tampered with
-- through normal application workflows.
CREATE OR REPLACE FUNCTION public.prevent_auditlog_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only — UPDATE/DELETE is not permitted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auditlog_immutable ON "AuditLog";
CREATE TRIGGER auditlog_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_auditlog_mutation();

COMMIT;
