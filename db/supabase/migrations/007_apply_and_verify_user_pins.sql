-- =====================================================
-- APPLY + VERIFY: user_pins migration
-- =====================================================
-- Run this whole script in Supabase SQL Editor.
-- It creates/updates `public.user_pins` and prints verification rows.
-- =====================================================

-- 1) Apply schema
CREATE TABLE IF NOT EXISTS public.user_pins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_pins_expires_at ON public.user_pins(expires_at);

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own user_pins" ON public.user_pins;
CREATE POLICY "Users can view own user_pins"
  ON public.user_pins FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own user_pins" ON public.user_pins;
CREATE POLICY "Users can insert own user_pins"
  ON public.user_pins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own user_pins" ON public.user_pins;
CREATE POLICY "Users can update own user_pins"
  ON public.user_pins FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own user_pins" ON public.user_pins;
CREATE POLICY "Users can delete own user_pins"
  ON public.user_pins FOR DELETE
  USING (auth.uid() = user_id);

-- Ensure trigger function exists (safe fallback)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_pins_updated_at ON public.user_pins;
CREATE TRIGGER update_user_pins_updated_at
  BEFORE UPDATE ON public.user_pins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Verify table exists
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_pins';

-- 3) Verify columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_pins'
ORDER BY ordinal_position;

-- 4) Verify RLS
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'user_pins';

-- 5) Verify policies
SELECT policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_pins'
ORDER BY policyname;

-- 6) Verify trigger
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'user_pins'
ORDER BY trigger_name;
