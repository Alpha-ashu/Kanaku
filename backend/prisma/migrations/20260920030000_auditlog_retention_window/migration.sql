-- Migration: 20260920030000_auditlog_retention_window
--
-- Makes the AuditLog append-only trigger retention-aware.
--
-- 20260920020000 installed the strict form inherited from
-- scripts/harden-financial-constraints.sql: it refuses EVERY update and EVERY
-- delete. That was right when the trail covered 17 financial models. It is not
-- right now that the interceptor in src/db/prisma.ts covers every business
-- model, because the table grows with the app's total write volume and there is
-- no way to age it out — and a trail nobody can prune eventually gets switched
-- off, which is a worse outcome than a bounded one.
--
-- After this:
--   UPDATE — never permitted, at any age. Records cannot be tampered with.
--   DELETE — refused inside the retention window, permitted outside it, so
--            cleanup.worker.ts can age the table out in batches.
--
-- Shipped as its own migration rather than an edit to 20260920020000: that file
-- may already be applied, and editing an applied migration changes its checksum
-- and makes Prisma refuse to deploy. `CREATE OR REPLACE` means this is correct
-- whether the previous migration ran a minute ago or not at all.
--
-- retention_days is duplicated as AUDIT_RETENTION_DAYS in
-- src/workers/cleanup.worker.ts. This is the floor; the worker is the ceiling.
-- The worker's value must stay >= this one, or its deletes are simply refused.

CREATE OR REPLACE FUNCTION public.prevent_auditlog_mutation() RETURNS trigger AS $fn$
DECLARE
  retention_days CONSTANT int := 730; -- 24 months
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog is append-only: UPDATE is never permitted';
  END IF;
  IF OLD."createdAt" < (now() - make_interval(days => retention_days)) THEN
    RETURN OLD; -- past retention: the cleanup worker may age this row out
  END IF;
  RAISE EXCEPTION
    'AuditLog is append-only: DELETE is not permitted inside the % day retention window (row is % old)',
    retention_days, age(now(), OLD."createdAt");
END;
$fn$ LANGUAGE plpgsql;

-- Re-assert the trigger binding. Idempotent, and covers the case where
-- 20260920020000 has not run on this database yet.
DROP TRIGGER IF EXISTS auditlog_immutable ON "AuditLog";
CREATE TRIGGER auditlog_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_auditlog_mutation();
