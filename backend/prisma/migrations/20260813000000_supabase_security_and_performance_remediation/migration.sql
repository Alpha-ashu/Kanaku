-- Migration: 20260813000000_supabase_security_and_performance_remediation
-- Purpose: Remediate Supabase Database Linter & Security Advisor alerts:
--   1. Fix mutable function search_path (CVE / search_path injection prevention)
--   2. Optimize Auth RLS policies using subquery InitPlan ((select auth.uid()))
--   3. Add missing foreign key performance indexes

-- ── 1. Function Search Paths ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'recalculate_account_balance') THEN
    ALTER FUNCTION public.recalculate_account_balance() SET search_path = public, pg_temp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'recalculate_loan_balance') THEN
    ALTER FUNCTION public.recalculate_loan_balance() SET search_path = public, pg_temp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'recalculate_investment_values') THEN
    ALTER FUNCTION public.recalculate_investment_values() SET search_path = public, pg_temp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'kanku_set_updated_at') THEN
    ALTER FUNCTION public.kanku_set_updated_at() SET search_path = public, pg_temp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'prevent_auditlog_mutation') THEN
    ALTER FUNCTION public.prevent_auditlog_mutation() SET search_path = public, pg_temp;
  END IF;
END $$;

-- ── 2. Auth RLS InitPlan Optimization ─────────────────────────────────────────
DO $$
BEGIN
  -- public.profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_user_only" ON public.profiles;
    CREATE POLICY "Users can manage own profile" ON public.profiles
      FOR ALL USING ((select auth.uid()) = id)
      WITH CHECK ((select auth.uid()) = id);
  END IF;

  -- public.voice_transcripts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'voice_transcripts') THEN
    ALTER TABLE public.voice_transcripts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "voice_transcripts_user_only" ON public.voice_transcripts;
    DROP POLICY IF EXISTS "Users can manage own voice transcripts" ON public.voice_transcripts;
    CREATE POLICY "Users can manage own voice transcripts" ON public.voice_transcripts
      FOR ALL USING ((select auth.uid())::text = "user_id")
      WITH CHECK ((select auth.uid())::text = "user_id");
  END IF;

  -- public.user_voice_learning
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_voice_learning') THEN
    ALTER TABLE public.user_voice_learning ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "user_voice_learning_user_only" ON public.user_voice_learning;
    DROP POLICY IF EXISTS "Users can manage own voice learning" ON public.user_voice_learning;
    CREATE POLICY "Users can manage own voice learning" ON public.user_voice_learning
      FOR ALL USING ((select auth.uid())::text = "user_id")
      WITH CHECK ((select auth.uid())::text = "user_id");
  END IF;
EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
  -- Fallback for non-Supabase environments without auth schema
  NULL;
END $$;

-- ── 3. Unindexed Foreign Key Indexes ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "AdvisorApplication_reviewedBy_idx" ON public."AdvisorApplication"("reviewedBy");
CREATE INDEX IF NOT EXISTS "CollaborationParticipant_userId_idx" ON public."CollaborationParticipant"("userId");
CREATE INDEX IF NOT EXISTS "CollaborationParticipant_invitedBy_idx" ON public."CollaborationParticipant"("invitedBy");

-- Raw todo tables foreign key indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_items') THEN
    CREATE INDEX IF NOT EXISTS "idx_todo_items_user_id" ON public.todo_items("user_id");
    CREATE INDEX IF NOT EXISTS "idx_todo_items_created_by" ON public.todo_items("created_by");
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_list_shares') THEN
    CREATE INDEX IF NOT EXISTS "idx_todo_list_shares_shared_by" ON public.todo_list_shares("shared_by");
  END IF;
END $$;
