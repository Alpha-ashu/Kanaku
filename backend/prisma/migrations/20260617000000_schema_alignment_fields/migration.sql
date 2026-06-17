-- Schema alignment: persist Dexie client fields that were previously dropped on backend sync.
-- All columns are nullable / have safe defaults, so this migration is backward compatible
-- (existing rows and old application code continue to work — expand-only change).

-- ─── Investment ───────────────────────────────────────────────────────────────
ALTER TABLE "public"."Investment"
  ADD COLUMN IF NOT EXISTS "broker"              TEXT,
  ADD COLUMN IF NOT EXISTS "description"         TEXT,
  ADD COLUMN IF NOT EXISTS "assetCurrency"       TEXT,
  ADD COLUMN IF NOT EXISTS "baseCurrency"        TEXT,
  ADD COLUMN IF NOT EXISTS "buyFxRate"           DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS "lastKnownFxRate"     DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS "totalInvestedNative" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "currentValueNative"  DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "valuationVersion"    INTEGER,
  ADD COLUMN IF NOT EXISTS "positionStatus"      TEXT DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS "closedAt"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closePrice"          DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "closeFxRate"         DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS "grossSaleValue"      DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "netSaleValue"        DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "purchaseFees"        DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "closingFees"         DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "realizedProfitLoss"  DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "closeNotes"          TEXT;

CREATE INDEX IF NOT EXISTS "Investment_positionStatus_idx" ON "public"."Investment"("positionStatus");

-- ─── Loan ─────────────────────────────────────────────────────────────────────
ALTER TABLE "public"."Loan"
  ADD COLUMN IF NOT EXISTS "totalPayable"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "loanDate"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "contactEmail"  TEXT,
  ADD COLUMN IF NOT EXISTS "contactPhone"  TEXT,
  ADD COLUMN IF NOT EXISTS "bankName"      TEXT,
  ADD COLUMN IF NOT EXISTS "tenureMonths"  INTEGER,
  ADD COLUMN IF NOT EXISTS "downPayment"   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "loanCategory"  TEXT,
  ADD COLUMN IF NOT EXISTS "notes"         TEXT;

-- ─── RecurringTransaction ───────────────────────────────────────────────────────
ALTER TABLE "public"."recurring_transactions"
  ADD COLUMN IF NOT EXISTS "type"                TEXT,
  ADD COLUMN IF NOT EXISTS "startDate"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endDate"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminderDaysBefore"  INTEGER,
  ADD COLUMN IF NOT EXISTS "notes"               TEXT,
  ADD COLUMN IF NOT EXISTS "transferToAccountId" TEXT;
