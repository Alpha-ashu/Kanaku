-- =====================================================
-- Add user_pins table for secure PIN backup/restore
-- =====================================================
-- Required by frontend PINAuth component:
--   - SELECT pin_hash by user_id
--   - UPSERT pin_hash/expires_at by user_id
-- Idempotent and safe to run multiple times.
-- =====================================================

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

-- Reuse shared updated_at trigger function created in 001_create_tables.sql
DROP TRIGGER IF EXISTS update_user_pins_updated_at ON public.user_pins;
CREATE TRIGGER update_user_pins_updated_at
  BEFORE UPDATE ON public.user_pins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
