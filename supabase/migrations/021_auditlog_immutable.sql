-- ============================================================================
-- Migration 021: Make AuditLog append-only (immutable) — Phase 2 sign-off
-- ----------------------------------------------------------------------------
-- The application only ever INSERTs audit rows. UPDATE/DELETE on AuditLog is
-- blocked at the DB level so the trail cannot be tampered with through any
-- application workflow. Extracted from harden-financial-constraints.sql so the
-- audit-immutability guarantee can be applied independently of the (separate)
-- financial CHECK constraints. Idempotent.
--
--   cd backend && npx prisma db execute --file ../supabase/migrations/021_auditlog_immutable.sql --schema prisma/schema.prisma
-- ============================================================================

BEGIN;

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
