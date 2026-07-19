-- Migration: Fix Data Duplication and Sync Tracking
-- Description: Adds unique constraints on local_id and missing sync tracking columns.

-- 1. Add missing columns to core tables if they don't exist
DO $$
DECLARE
    t TEXT;
    core_tables TEXT[] := ARRAY['accounts', 'friends', 'transactions', 'loans', 'goals', 'investments', 'group_expenses', 'todo_lists', 'todo_items'];
BEGIN
    FOREACH t IN ARRAY core_tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS local_id INTEGER', t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT ''synced''', t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_id TEXT', t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1', t);
    END LOOP;
END $$;

-- 2. Clean up existing duplicates before adding unique constraints
-- This keeps the one with the earliest created_at for each user_id + local_id
DO $$
DECLARE
    t TEXT;
    core_tables TEXT[] := ARRAY['accounts', 'friends', 'transactions', 'loans', 'goals', 'investments', 'group_expenses', 'todo_lists', 'todo_items'];
BEGIN
    FOREACH t IN ARRAY core_tables
    LOOP
        EXECUTE format('
            DELETE FROM public.%I
            WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id, row_number() OVER (PARTITION BY user_id, local_id ORDER BY created_at ASC) as rn
                    FROM public.%I
                    WHERE local_id IS NOT NULL
                ) s
                WHERE s.rn = 1
            )
            AND local_id IS NOT NULL', t, t);
    END LOOP;
END $$;


-- 3. Add UNIQUE constraint on (user_id, local_id)
-- Note: Profiles doesn't have local_id as it maps directly to auth.uid()
DO $$
DECLARE
    t TEXT;
    core_tables TEXT[] := ARRAY['accounts', 'friends', 'transactions', 'loans', 'goals', 'investments', 'group_expenses', 'todo_lists', 'todo_items'];
BEGIN
    FOREACH t IN ARRAY core_tables
    LOOP
        -- Drop existing constraint if it exists (for idempotency)
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I_user_id_local_id_key', t, t);
        -- Add the unique constraint
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I_user_id_local_id_key UNIQUE (user_id, local_id)', t, t);
    END LOOP;
END $$;

-- 4. Update the updated_at trigger for all tables to also increment version
CREATE OR REPLACE FUNCTION set_updated_at_and_version() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the new trigger to core tables
DO $$
DECLARE
  t TEXT;
  arr TEXT[] := ARRAY['accounts', 'friends', 'transactions', 'goals', 'loans', 'investments', 'group_expenses', 'todo_lists', 'todo_items'];
BEGIN
  FOREACH t IN ARRAY arr
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at_and_version()', t, t);
  END LOOP;
END $$;
