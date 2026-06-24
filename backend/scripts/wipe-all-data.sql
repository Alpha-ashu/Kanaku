-- ============================================================================
--  ⚠️  DESTRUCTIVE: WIPE ALL DATA  ⚠️
-- ----------------------------------------------------------------------------
--  Empties EVERY table in the `public` schema — all rows, all users, all
--  settings, all feature config. The schema itself (tables, columns, indexes,
--  triggers, functions, sequences) is left completely intact; only data (rows)
--  is removed. Sequences are reset so new ids start from 1.
--
--  This is NOT a migration. Do NOT place it in prisma/migrations or
--  supabase/migrations — it must never run automatically. Run it by hand,
--  once, against the database you intend to blank.
--
--  WHAT THIS DOES NOT TOUCH:
--    • `_prisma_migrations` — Prisma's migration-state ledger. Wiping it would
--      make Prisma think the schema is unmigrated and try to re-create existing
--      tables on the next `migrate deploy`. Kept so the schema stays valid.
--      (To include it anyway, delete it from the exclusion list below.)
--    • Supabase-managed schemas — `auth.users` (login accounts), `storage`,
--      `realtime`, etc. live OUTSIDE `public` and are NOT cleared here. If you
--      also want to delete Supabase Auth users, do that from the Supabase
--      dashboard (Authentication → Users) or the Admin API — not via this SQL.
--
--  HOW TO RUN (pick one):
--    psql:            psql "$DATABASE_URL" -f backend/scripts/wipe-all-data.sql
--    Prisma:          npx prisma db execute --file backend/scripts/wipe-all-data.sql --schema backend/prisma/schema.prisma
--    Supabase studio: paste the contents into the SQL Editor and Run.
--
--  TIP: take a backup first —  pg_dump "$DATABASE_URL" > backup.sql
-- ============================================================================

BEGIN;

DO $$
DECLARE
  stmt text;
BEGIN
  SELECT 'TRUNCATE TABLE '
       || string_agg(format('%I.%I', schemaname, tablename), ', ')
       || ' RESTART IDENTITY CASCADE'
    INTO stmt
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename <> '_prisma_migrations';   -- keep migration-state ledger

  IF stmt IS NULL THEN
    RAISE NOTICE 'No tables found in schema "public" — nothing to truncate.';
  ELSE
    RAISE NOTICE 'Executing: %', stmt;
    EXECUTE stmt;
    RAISE NOTICE 'All public tables emptied.';
  END IF;
END $$;

COMMIT;
