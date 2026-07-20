-- =============================================================================
-- Migration 011: Fintech-Grade CHECK Constraints + Performance Indexes
-- =============================================================================
-- Adds NOT NULL / CHECK constraints and composite indexes that Prisma cannot
-- express today. These enforce data integrity at the database level and
-- improve common query patterns.
--
-- IMPORTANT: Prisma does not manage CHECK constraints, so these survive
-- `prisma migrate` runs. If a future schema change drops the column, the
-- constraint also drops automatically.
-- =============================================================================

-- ── Monetary amount guards ──────────────────────────────────────────────────

-- Accounts: balance may be negative (overdraft) but never NaN / Infinity.
-- Use a very large bound as a simple sanity check.
DO $$ BEGIN
  ALTER TABLE "Account"
    ADD CONSTRAINT chk_account_balance
    CHECK ("balance" BETWEEN -1e12 AND 1e12);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transactions: amount must be positive, within sane bounds.
DO $$ BEGIN
  ALTER TABLE "Transaction"
    ADD CONSTRAINT chk_transaction_amount_positive
    CHECK ("amount" > 0 AND "amount" < 1e12);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Goals: target must be positive.
DO $$ BEGIN
  ALTER TABLE "Goal"
    ADD CONSTRAINT chk_goal_target_positive
    CHECK ("targetAmount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Goal"
    ADD CONSTRAINT chk_goal_current_non_negative
    CHECK ("currentAmount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Loans: principal must be positive.
DO $$ BEGIN
  ALTER TABLE "Loan"
    ADD CONSTRAINT chk_loan_principal_positive
    CHECK ("principalAmount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Investments: quantities and prices must be positive.
DO $$ BEGIN
  ALTER TABLE "Investment"
    ADD CONSTRAINT chk_investment_quantity_positive
    CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Investment"
    ADD CONSTRAINT chk_investment_buy_price_positive
    CHECK ("buyPrice" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- GoalContributions: amount must be positive.
DO $$ BEGIN
  ALTER TABLE "GoalContribution"
    ADD CONSTRAINT chk_contribution_amount_positive
    CHECK ("amount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Bookings: duration must be positive.
DO $$ BEGIN
  ALTER TABLE "BookingRequest"
    ADD CONSTRAINT chk_booking_duration_positive
    CHECK ("duration" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BookingRequest"
    ADD CONSTRAINT chk_booking_amount_positive
    CHECK ("amount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payments: amount must be positive.
DO $$ BEGIN
  ALTER TABLE "Payment"
    ADD CONSTRAINT chk_payment_amount_positive
    CHECK ("amount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Loan status enum enforcement.
DO $$ BEGIN
  ALTER TABLE "Loan"
    ADD CONSTRAINT chk_loan_status_enum
    CHECK ("status" IN ('active', 'closed', 'paid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Composite indexes for common fintech queries ────────────────────────────

-- Fast user + date range for dashboards / reports.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_user_date
  ON "Transaction" ("userId", "date" DESC);

-- Fast user + category aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_user_category
  ON "Transaction" ("userId", "category");

-- Loan due-date lookup for reminders / notifications.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loan_user_due
  ON "Loan" ("userId", "dueDate") WHERE "status" = 'active';

-- Goal target-date lookup for progress tracking.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goal_user_target
  ON "Goal" ("userId", "targetDate") WHERE "deletedAt" IS NULL;

-- Sync queue processing: pending items in chronological order.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_queue_pending
  ON "SyncQueue" ("userId", "createdAt") WHERE "status" = 'pending';

-- ── Verification ────────────────────────────────────────────────────────────

DO $$
DECLARE
  cnt INT;
BEGIN
  SELECT count(*) INTO cnt
  FROM information_schema.table_constraints
  WHERE constraint_type = 'CHECK'
    AND table_name IN ('Account', 'Transaction', 'Goal', 'Loan', 'Investment',
                       'GoalContribution', 'BookingRequest', 'Payment');

  RAISE NOTICE '✅ CHECK constraints count: %', cnt;
END $$;
