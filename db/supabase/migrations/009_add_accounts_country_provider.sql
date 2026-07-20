-- Migration: Add optional account metadata columns for cloud sync compatibility
-- Context: frontend sync sends provider/country in account upserts.

ALTER TABLE IF EXISTS public.accounts
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

-- Refresh PostgREST schema cache so REST API sees new columns immediately.
NOTIFY pgrst, 'reload schema';
