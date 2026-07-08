-- Sync three columns that were added to schema.prisma (and are written by the
-- application) but were never captured in a migration, so any database rebuilt
-- purely from `prisma migrate deploy` (fresh env, DR restore, new region) was
-- missing them:
--
--   * Account.openingBalance   — foundation of the derived-balance model
--     (Current = openingBalance + Σ ledger). Previously hand-applied to prod
--     out-of-band (see fly.toml), leaving migrations behind schema.
--   * AuditLog.requestId (+ index) — end-to-end correlation ID persisted with
--     every financial-mutation audit row. Without the column, auditLog.create()
--     threw "column requestId does not exist" and the durable audit trail
--     (required for SOC-2 / RBI retention) silently failed to persist.
--   * Notification.requestId   — same correlation ID on notification rows.
--
-- All additive and nullable/defaulted → safe to apply to a populated database.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "requestId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "requestId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_requestId_idx" ON "AuditLog"("requestId");
