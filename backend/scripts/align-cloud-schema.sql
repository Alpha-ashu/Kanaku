-- ============================================================================
--  Align the cloud DB to the current code, then create the raw to-do tables.
-- ----------------------------------------------------------------------------
--  Run ONCE against the cloud DB, AFTER the data wipe (data is already empty,
--  so the DROPs below lose nothing). Then run the mock-data seed.
--
--  HOW TO RUN (pick one):
--    Supabase SQL Editor: paste this whole file and Run.
--    Prisma:  cd backend && npx prisma db execute --file scripts/align-cloud-schema.sql --schema prisma/schema.prisma
--
--  This is the exact, previewed change set (from `prisma migrate diff`):
--    • add  Account.openingBalance
--    • drop tax_calculations (finishes the Tax Calculator removal at the DB)
--    • drop unused keyword_mappings, user_learning
--    • create raw todo_lists / todo_items / todo_list_shares (referencing
--      public."User" — this deployment's identity — not auth.users)
-- ============================================================================

BEGIN;

-- ── 1) Bring Prisma-managed tables in line with prisma/schema.prisma ─────────
ALTER TABLE "tax_calculations" DROP CONSTRAINT IF EXISTS "tax_calculations_userId_fkey";
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;
DROP TABLE IF EXISTS "keyword_mappings";
DROP TABLE IF EXISTS "tax_calculations";
DROP TABLE IF EXISTS "user_learning";

-- ── 2) Raw to-do feature tables (NOT Prisma-managed) ────────────────────────
-- The backend `todos` feature and seed-mock-data.cjs write these via raw SQL,
-- inserting the user id cast to ::uuid. Prisma stores public."User".id as TEXT
-- (not uuid), so the user columns stay UUID (matching the original auth.users
-- design and the seed's casts) with NO foreign key to "User" — a uuid column
-- cannot reference a text key. The internal list_id FKs are kept.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.todo_lists (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  archived    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.todo_items (
  id           BIGSERIAL PRIMARY KEY,
  list_id      BIGINT REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  completed    BOOLEAN DEFAULT false,
  priority     TEXT CHECK (priority IN ('low','medium','high')) DEFAULT 'medium',
  due_date     TIMESTAMPTZ,
  created_by   UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.todo_list_shares (
  id                  BIGSERIAL PRIMARY KEY,
  list_id             BIGINT REFERENCES public.todo_lists(id) ON DELETE CASCADE NOT NULL,
  shared_with_user_id UUID NOT NULL,
  shared_by           UUID NOT NULL,
  permission          TEXT CHECK (permission IN ('view','edit')) DEFAULT 'view',
  shared_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_todo_lists_user_id   ON public.todo_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_list_id   ON public.todo_items(list_id);
CREATE INDEX IF NOT EXISTS idx_todo_items_completed ON public.todo_items(completed);

DROP TRIGGER IF EXISTS update_todo_lists_updated_at ON public.todo_lists;
CREATE TRIGGER update_todo_lists_updated_at BEFORE UPDATE ON public.todo_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_todo_items_updated_at ON public.todo_items;
CREATE TRIGGER update_todo_items_updated_at BEFORE UPDATE ON public.todo_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
