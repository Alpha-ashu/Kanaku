-- Migration: 20261001000000_advisor_withdrawals
--
-- Advisor withdrawals: an advisor asks to be paid for coins earned from
-- completed sessions; finance staff pay outside the app (UPI / bank transfer)
-- and record the reference. Coins bought with money stay spend-only.
--
-- Additive: two new tables, and the ledger's `type` CHECK widened by two values
-- ('WITHDRAWAL', 'WITHDRAWAL_REVERSAL'). The CHECK is dropped and re-created
-- because Postgres cannot alter a CHECK in place; every existing row satisfies
-- the new, wider list, and the swap happens inside this migration's
-- transaction, so there is no moment without the constraint. No existing row
-- is changed. Idempotent (IF NOT EXISTS / duplicate_object guards) because
-- staging is db-push managed and receives migrations through `prisma db execute`.
--
-- Beyond what Prisma models:
--   * CHECK constraints — closed status/method sets, positive amounts, a paid
--     request always carries its payout reference, and `open_key` is set exactly
--     while the request is open (its UNIQUE index then allows one open request
--     per user);
--   * deny-all RLS for anon/authenticated, as for every wallet table.

-- ── Ledger types ───────────────────────────────────────────────────────────────
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (
  'PAYMENT_CREDIT', 'SESSION_PAYMENT', 'SESSION_EARNING', 'EARNING_RELEASE',
  'SESSION_REFUND', 'EARNING_REVERSAL', 'PURCHASE_REVERSAL', 'ADMIN_ADJUSTMENT',
  'WITHDRAWAL', 'WITHDRAWAL_REVERSAL'
));

-- ── payout_methods ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payout_methods" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "display_label" TEXT NOT NULL,
    "details_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payout_methods_method_check" CHECK ("method" IN ('UPI', 'BANK'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "payout_methods_user_id_key" ON "payout_methods"("user_id");

DO $$ BEGIN
  ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── withdrawal_requests ────────────────────────────────────────────────────────
-- No foreign key to "User": like payment_orders, a payout is a financial record
-- that outlives the account.
CREATE TABLE IF NOT EXISTS "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "open_key" TEXT,
    "method" TEXT NOT NULL,
    "payout_label" TEXT NOT NULL,
    "payout_details_encrypted" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payout_reference" TEXT,
    "decision_note" TEXT,
    "reviewed_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "withdrawal_requests_coins_positive" CHECK ("coins" > 0),
    CONSTRAINT "withdrawal_requests_amount_positive" CHECK ("amount_minor" > 0),
    CONSTRAINT "withdrawal_requests_status_check"
      CHECK ("status" IN ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED')),
    CONSTRAINT "withdrawal_requests_method_check" CHECK ("method" IN ('UPI', 'BANK')),
    CONSTRAINT "withdrawal_requests_paid_has_reference"
      CHECK ("status" <> 'PAID' OR ("payout_reference" IS NOT NULL AND "paid_at" IS NOT NULL)),
    CONSTRAINT "withdrawal_requests_open_key_matches_status"
      CHECK (("status" IN ('REQUESTED', 'APPROVED')) = ("open_key" IS NOT NULL AND "open_key" = "user_id"))
);
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_requests_open_key_key" ON "withdrawal_requests"("open_key");
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_requests_user_id_idempotency_key_key" ON "withdrawal_requests"("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "withdrawal_requests_user_id_created_at_idx" ON "withdrawal_requests"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- ── Row Level Security: no PostgREST access ────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payout_methods', 'withdrawal_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_client_access', t);
    BEGIN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t || '_no_client_access', t);
    EXCEPTION WHEN undefined_object THEN
      NULL; -- plain Postgres (CI) has no anon/authenticated roles; RLS alone already denies them
    END;
  END LOOP;
END $$;
