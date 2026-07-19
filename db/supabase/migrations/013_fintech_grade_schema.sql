-- Migration 013: Fintech-grade schema upgrades
-- OTP system, device trust, user status, transaction versioning, AI scan storage

-- ══════════════════════════════════════════════════
-- 1. OtpCode table
-- ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "OtpCode" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "code"      TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "attempts"  INT NOT NULL DEFAULT 0,
  "used"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "OtpCode_userId_idx" ON "OtpCode" ("userId");
CREATE INDEX IF NOT EXISTS "OtpCode_expiresAt_idx" ON "OtpCode" ("expiresAt");

-- RLS
ALTER TABLE "OtpCode" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "otp_owner_only" ON "OtpCode"
  FOR ALL
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

-- ══════════════════════════════════════════════════
-- 2. AiScan table
-- ══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "AiScan" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "billId"         TEXT,
  "transactionId"  TEXT,
  "extractedJson"  TEXT NOT NULL,
  "confidence"     DOUBLE PRECISION NOT NULL,
  "provider"       TEXT NOT NULL DEFAULT 'gemini',
  "processingMs"   INT,
  "status"         TEXT NOT NULL DEFAULT 'completed',
  "errorMessage"   TEXT,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AiScan_userId_idx" ON "AiScan" ("userId");
CREATE INDEX IF NOT EXISTS "AiScan_billId_idx" ON "AiScan" ("billId");
CREATE INDEX IF NOT EXISTS "AiScan_createdAt_idx" ON "AiScan" ("createdAt");

-- RLS
ALTER TABLE "AiScan" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aiscan_owner_only" ON "AiScan"
  FOR ALL
  USING (auth.uid()::text = "userId")
  WITH CHECK (auth.uid()::text = "userId");

-- ══════════════════════════════════════════════════
-- 3. Device.isTrusted column
-- ══════════════════════════════════════════════════
ALTER TABLE "Device"
  ADD COLUMN IF NOT EXISTS "isTrusted" BOOLEAN NOT NULL DEFAULT false;

-- ══════════════════════════════════════════════════
-- 4. User.status column
-- ══════════════════════════════════════════════════
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'verified';

CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User" ("status");

-- Validate status values
ALTER TABLE "User"
  ADD CONSTRAINT "chk_user_status"
  CHECK ("status" IN ('verified', 'limited_access', 'suspended'));

-- ══════════════════════════════════════════════════
-- 5. Transaction.version column
-- ══════════════════════════════════════════════════
ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "version" INT NOT NULL DEFAULT 1;
