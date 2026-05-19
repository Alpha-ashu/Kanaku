CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public."Account" ("userId");
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public."Transaction" ("userId");
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public."Transaction" ("date");
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public."Transaction" ("accountId");
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public."Transaction" ("category");
CREATE INDEX IF NOT EXISTS idx_transactions_user_id_date ON public."Transaction" ("userId", "date");
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public."Goal" ("userId");
CREATE INDEX IF NOT EXISTS idx_loans_user_id ON public."Loan" ("userId");
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON public."Investment" ("userId");
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON public."Notification" ("userId", "isRead");
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id_deleted_at ON public."LoanPayment" ("loanId", "deletedAt");
CREATE INDEX IF NOT EXISTS idx_group_expense_members_group_id_deleted_at ON public."GroupExpenseMember" ("groupExpenseId", "deletedAt");

ALTER TABLE public."ExpenseBill"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

ALTER TABLE public."GoalContribution"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_expense_bills_deleted_at ON public."ExpenseBill" ("deletedAt");
CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_id_deleted_at ON public."GoalContribution" ("goalId", "deletedAt");
CREATE INDEX IF NOT EXISTS idx_goal_contributions_user_id_deleted_at ON public."GoalContribution" ("userId", "deletedAt");

CREATE INDEX IF NOT EXISTS idx_notifications_created_at_desc ON public."Notification" ("createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_transactions_amount_positive'
  ) THEN
    ALTER TABLE public."Transaction"
      ADD CONSTRAINT chk_transactions_amount_positive
      CHECK ("amount" > 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_goals_target_amount_positive'
  ) THEN
    ALTER TABLE public."Goal"
      ADD CONSTRAINT chk_goals_target_amount_positive
      CHECK ("targetAmount" > 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_goals_current_amount_non_negative'
  ) THEN
    ALTER TABLE public."Goal"
      ADD CONSTRAINT chk_goals_current_amount_non_negative
      CHECK ("currentAmount" >= 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_loans_principal_amount_positive'
  ) THEN
    ALTER TABLE public."Loan"
      ADD CONSTRAINT chk_loans_principal_amount_positive
      CHECK ("principalAmount" > 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_loans_outstanding_balance_non_negative'
  ) THEN
    ALTER TABLE public."Loan"
      ADD CONSTRAINT chk_loans_outstanding_balance_non_negative
      CHECK ("outstandingBalance" >= 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_investments_quantity_positive'
  ) THEN
    ALTER TABLE public."Investment"
      ADD CONSTRAINT chk_investments_quantity_positive
      CHECK ("quantity" > 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_investments_buy_price_positive'
  ) THEN
    ALTER TABLE public."Investment"
      ADD CONSTRAINT chk_investments_buy_price_positive
      CHECK ("buyPrice" > 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_investments_current_price_non_negative'
  ) THEN
    ALTER TABLE public."Investment"
      ADD CONSTRAINT chk_investments_current_price_non_negative
      CHECK ("currentPrice" >= 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_ai_insights_confidence_score_range'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ai_insights'
  ) THEN
    ALTER TABLE public.ai_insights
      ADD CONSTRAINT chk_ai_insights_confidence_score_range
      CHECK (confidence_score >= 0 AND confidence_score <= 1) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public."AuditLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  status TEXT NOT NULL,
  ip TEXT,
  "userAgent" TEXT,
  details JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public."AuditLog" ("userId");
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public."AuditLog" ("createdAt");

