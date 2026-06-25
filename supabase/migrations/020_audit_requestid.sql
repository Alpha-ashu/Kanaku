-- ============================================================================
-- Migration 020: Request-ID correlation for audit + notifications (Phase 2)
-- ----------------------------------------------------------------------------
-- Adds a nullable `requestId` correlation column so an audit row (and the
-- worker-side delivery of a notification) can be tied back to the originating
-- API request. End-to-end: Frontend X-Request-Id → API → AuditLog/Notification
-- → Worker delivery audits.
--
-- Additive, nullable, idempotent — safe to run on a live DB before the code
-- that writes the column ships (the column simply stays NULL until then).
-- Tables are PascalCase post-migration 014 (see harden-financial-constraints.sql).
--
--   cd backend && npx prisma db execute --file ../supabase/migrations/020_audit_requestid.sql --schema prisma/schema.prisma
--   (or paste into the Supabase SQL Editor)
-- ============================================================================

BEGIN;

-- Audit trail correlation
ALTER TABLE "AuditLog"      ADD COLUMN IF NOT EXISTS "requestId" TEXT;
CREATE INDEX IF NOT EXISTS "AuditLog_requestId_idx" ON "AuditLog" ("requestId");

-- Notification correlation (API request → worker delivery)
ALTER TABLE "Notification"  ADD COLUMN IF NOT EXISTS "requestId" TEXT;

COMMIT;
