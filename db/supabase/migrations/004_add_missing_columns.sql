-- =====================================================
-- Expense Tracker - Add missing columns for sync
-- =====================================================
-- This migration aligns existing tables with app sync expectations.
-- Run this AFTER 001_create_tables.sql and 002_enable_rls.sql.
-- =====================================================

-- FRIENDS TABLE: add updated_at + deleted_at for soft-delete + sync metadata
ALTER TABLE public.friends
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- GROUP EXPENSES TABLE: add sync-related fields + timestamps
ALTER TABLE public.group_expenses
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS split_type TEXT CHECK (split_type IN ('equal', 'custom')),
  ADD COLUMN IF NOT EXISTS your_share DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS expense_transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('pending', 'settled')),
  ADD COLUMN IF NOT EXISTS notification_status TEXT CHECK (notification_status IN ('pending', 'partial', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill updated_at for existing rows
UPDATE public.friends
SET updated_at = COALESCE(updated_at, NOW())
WHERE updated_at IS NULL;

UPDATE public.group_expenses
SET updated_at = COALESCE(updated_at, NOW())
WHERE updated_at IS NULL;

-- Add missing indexes
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON public.friends(user_id);
CREATE INDEX IF NOT EXISTS idx_group_expenses_user_id ON public.group_expenses(user_id);

-- Ensure updated_at triggers exist
DROP TRIGGER IF EXISTS update_friends_updated_at ON public.friends;
CREATE TRIGGER update_friends_updated_at
  BEFORE UPDATE ON public.friends
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_group_expenses_updated_at ON public.group_expenses;
CREATE TRIGGER update_group_expenses_updated_at
  BEFORE UPDATE ON public.group_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

