-- ============================================================================
--  Fintech hardening — database-level defense-in-depth.
-- ----------------------------------------------------------------------------
--  The API already enforces these via Zod request validation; these CHECK
--  constraints enforce them for ALL write paths (sync, scripts, direct SQL),
--  and make the AuditLog table append-only (immutable) at the DB level.
--
--  Idempotent. Run once against the DB:
--    cd backend && npx prisma db execute --file scripts/harden-financial-constraints.sql --schema prisma/schema.prisma
--    (or paste into the Supabase SQL Editor)
-- ============================================================================

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
