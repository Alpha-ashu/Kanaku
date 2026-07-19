-- Migration 012: Add dedupHash column to Transaction table for duplicate detection
-- SHA-256 hash of (userId + amount + date + description) prevents duplicate transactions
-- from multi-device sync and double-submit scenarios.

ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "dedupHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_dedupHash_key"
  ON "Transaction" ("dedupHash")
  WHERE "dedupHash" IS NOT NULL;
