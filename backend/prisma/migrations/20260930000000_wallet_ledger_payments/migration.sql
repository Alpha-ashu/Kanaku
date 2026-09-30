-- Migration: 20260930000000_wallet_ledger_payments
--
-- Coin wallet, immutable ledger, coin packages, payment-provider orders and
-- webhook events; staff permission grants and manager assignments; session
-- payment columns on BookingRequest; read receipts on ChatMessage.
--
-- Entirely additive: new tables, and nullable/defaulted columns on two
-- existing ones. Existing bookings read as paymentStatus 'NOT_REQUIRED', so
-- nothing already booked starts demanding payment. Idempotent (IF NOT EXISTS /
-- duplicate_object guards) because staging is db-push managed and receives
-- migrations through `prisma db execute`.
--
-- Beyond what Prisma models, this file adds:
--   * CHECK constraints — balances can never go negative, ledger rows can never
--     be zero or leave a negative balance behind, statuses are closed sets;
--   * an immutability trigger on wallet_transactions (UPDATE/DELETE/TRUNCATE
--     refused — corrections are compensating rows);
--   * deny-all RLS for anon/authenticated on every new table, because Supabase
--     serves `public` over PostgREST to the anon key shipped in the web bundle;
--   * four seed coin packages, all INACTIVE — pricing is a business decision an
--     admin confirms (and activates) in the admin console.

-- ── BookingRequest: session payment state ──────────────────────────────────────
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "coinCost" INTEGER;
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "earningsReleasedAt" TIMESTAMP(3);
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "expiredAt" TIMESTAMP(3);
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "BookingRequest" ADD COLUMN IF NOT EXISTS "timeZone" TEXT;

CREATE INDEX IF NOT EXISTS "BookingRequest_startsAt_idx" ON "BookingRequest"("startsAt");
CREATE INDEX IF NOT EXISTS "BookingRequest_paymentStatus_idx" ON "BookingRequest"("paymentStatus");

DO $$ BEGIN
  ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_coinCost_nonnegative" CHECK ("coinCost" IS NULL OR "coinCost" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_paymentStatus_check"
    CHECK ("paymentStatus" IN ('NOT_REQUIRED', 'UNPAID', 'PAID', 'REFUNDED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ChatMessage: read receipts ─────────────────────────────────────────────────
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_readAt_idx" ON "ChatMessage"("sessionId", "readAt");

-- ── wallets ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "available_balance" INTEGER NOT NULL DEFAULT 0,
    "pending_balance" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallets_available_balance_nonnegative" CHECK ("available_balance" >= 0),
    CONSTRAINT "wallets_pending_balance_nonnegative" CHECK ("pending_balance" >= 0),
    CONSTRAINT "wallets_status_check" CHECK ("status" IN ('ACTIVE', 'FROZEN'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_user_id_key" ON "wallets"("user_id");

-- ── coin_packages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "coin_packages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "bonus_coins" INTEGER NOT NULL DEFAULT 0,
    "price_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "coin_packages_coins_positive" CHECK ("coins" > 0),
    CONSTRAINT "coin_packages_bonus_nonnegative" CHECK ("bonus_coins" >= 0),
    CONSTRAINT "coin_packages_price_positive" CHECK ("price_minor" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "coin_packages_code_key" ON "coin_packages"("code");
CREATE INDEX IF NOT EXISTS "coin_packages_is_active_sort_order_idx" ON "coin_packages"("is_active", "sort_order");

-- ── payment_orders ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "provider_payment_id" TEXT,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "coins" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "failure_reason" TEXT,
    "idempotency_key" TEXT,
    "verified_via" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "credited_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "provider_refund_id" TEXT,
    "refund_reason" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_orders_amount_positive" CHECK ("amount_minor" > 0),
    CONSTRAINT "payment_orders_coins_positive" CHECK ("coins" > 0),
    CONSTRAINT "payment_orders_status_check"
      CHECK ("status" IN ('CREATED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'))
);
CREATE INDEX IF NOT EXISTS "payment_orders_user_id_created_at_idx" ON "payment_orders"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "payment_orders_status_created_at_idx" ON "payment_orders"("status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_provider_provider_order_id_key" ON "payment_orders"("provider", "provider_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_provider_provider_payment_id_key" ON "payment_orders"("provider", "provider_payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_user_id_idempotency_key_key" ON "payment_orders"("user_id", "idempotency_key");

-- ── wallet_transactions (the ledger) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "amount" INTEGER NOT NULL,
    "available_after" INTEGER NOT NULL,
    "pending_after" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT NOT NULL,
    "booking_id" TEXT,
    "payment_order_id" TEXT,
    "reversal_of_id" TEXT,
    "counterparty_user_id" TEXT,
    "description" TEXT NOT NULL,
    "reason" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_transactions_amount_nonzero" CHECK ("amount" <> 0),
    CONSTRAINT "wallet_transactions_available_after_nonnegative" CHECK ("available_after" >= 0),
    CONSTRAINT "wallet_transactions_pending_after_nonnegative" CHECK ("pending_after" >= 0),
    CONSTRAINT "wallet_transactions_bucket_check" CHECK ("bucket" IN ('AVAILABLE', 'PENDING')),
    CONSTRAINT "wallet_transactions_status_check" CHECK ("status" IN ('COMPLETED')),
    CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (
      'PAYMENT_CREDIT', 'SESSION_PAYMENT', 'SESSION_EARNING', 'EARNING_RELEASE',
      'SESSION_REFUND', 'EARNING_REVERSAL', 'PURCHASE_REVERSAL', 'ADMIN_ADJUSTMENT'
    ))
);
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_reference_key" ON "wallet_transactions"("reference");
CREATE INDEX IF NOT EXISTS "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");
CREATE INDEX IF NOT EXISTS "wallet_transactions_booking_id_idx" ON "wallet_transactions"("booking_id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_payment_order_id_idx" ON "wallet_transactions"("payment_order_id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_reversal_of_id_idx" ON "wallet_transactions"("reversal_of_id");
CREATE INDEX IF NOT EXISTS "wallet_transactions_type_created_at_idx" ON "wallet_transactions"("type", "created_at");

-- ── payment_webhook_events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "payment_order_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "payload" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_webhook_events_status_check"
      CHECK ("status" IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'REJECTED', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS "payment_webhook_events_payment_order_id_idx" ON "payment_webhook_events"("payment_order_id");
CREATE INDEX IF NOT EXISTS "payment_webhook_events_received_at_idx" ON "payment_webhook_events"("received_at");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_event_id_key" ON "payment_webhook_events"("provider", "event_id");

-- ── staff_permission_grants / manager_assignments ──────────────────────────────
CREATE TABLE IF NOT EXISTS "staff_permission_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_permission_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "staff_permission_grants_user_id_permission_key" ON "staff_permission_grants"("user_id", "permission");

CREATE TABLE IF NOT EXISTS "manager_assignments" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "subject_user_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manager_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "manager_assignments_not_self" CHECK ("manager_id" <> "subject_user_id")
);
CREATE INDEX IF NOT EXISTS "manager_assignments_subject_user_id_idx" ON "manager_assignments"("subject_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "manager_assignments_manager_id_subject_user_id_key" ON "manager_assignments"("manager_id", "subject_user_id");

-- ── Foreign keys ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "coin_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "staff_permission_grants" ADD CONSTRAINT "staff_permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "manager_assignments" ADD CONSTRAINT "manager_assignments_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "manager_assignments" ADD CONSTRAINT "manager_assignments_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Ledger immutability ────────────────────────────────────────────────────────
-- A posted ledger row is a financial fact. Mistakes are corrected by a
-- compensating row that references it (reversal_of_id), never by editing or
-- deleting it — including from SQL consoles and scripts, which is why this is a
-- trigger and not an application rule.
CREATE OR REPLACE FUNCTION "wallet_transactions_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions is append-only: record a compensating transaction instead of % ', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS wallet_transactions_no_update_delete ON "wallet_transactions";
CREATE TRIGGER wallet_transactions_no_update_delete
  BEFORE UPDATE OR DELETE ON "wallet_transactions"
  FOR EACH ROW EXECUTE FUNCTION "wallet_transactions_immutable"();

DROP TRIGGER IF EXISTS wallet_transactions_no_truncate ON "wallet_transactions";
CREATE TRIGGER wallet_transactions_no_truncate
  BEFORE TRUNCATE ON "wallet_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION "wallet_transactions_immutable"();

-- ── Row Level Security: no PostgREST access ────────────────────────────────────
-- Not FORCEd, so the owning backend role keeps full access; anon/authenticated
-- (the key in the web bundle) see nothing.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['wallets', 'wallet_transactions', 'coin_packages', 'payment_orders',
                           'payment_webhook_events', 'staff_permission_grants', 'manager_assignments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_client_access', t);
    BEGIN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t || '_no_client_access', t);
    EXCEPTION WHEN undefined_object THEN
      NULL; -- plain Postgres (CI) has no anon/authenticated roles; RLS alone already denies them
    END;
  END LOOP;
END $$;

-- ── Seed packages (INACTIVE until an admin reviews and activates them) ─────────
-- 1 coin = 1 INR (SESSION_COIN_VALUE_MINOR = 100 paise), bonus on larger packs.
INSERT INTO "coin_packages" ("id", "code", "name", "coins", "bonus_coins", "price_minor", "currency", "is_active", "sort_order", "updated_at")
VALUES
  (gen_random_uuid()::text, 'starter-100',  'Starter',  100,  0,   10000,  'INR', false, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'standard-500', 'Standard', 500,  25,  50000,  'INR', false, 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'plus-1000',    'Plus',     1000, 75,  100000, 'INR', false, 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'pro-2500',     'Pro',      2500, 250, 250000, 'INR', false, 40, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
