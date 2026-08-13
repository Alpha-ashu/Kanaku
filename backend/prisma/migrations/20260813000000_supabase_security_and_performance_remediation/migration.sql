-- Migration: 20260813000000_supabase_security_and_performance_remediation
-- Purpose: Complete, reproducible, idempotent database security and performance remediation:
--   1. Function search_path mutable lockdown (prevent search_path hijacking)
--   2. Performance indexes for unindexed foreign keys
--   3. Complete Row Level Security (RLS) & single-tenant policies across all 64 public tables

-- ── 1. Function Search Paths Lockdown ───────────────────────────────────────────
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
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'cleanup_expired_tokens') THEN
    ALTER FUNCTION public.cleanup_expired_tokens() SET search_path = public, pg_temp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_modified_column') THEN
    ALTER FUNCTION public.update_modified_column() SET search_path = public, pg_temp;
  END IF;
END $$;

-- ── 2. Performance Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "AdvisorApplication_reviewedBy_idx" ON public."AdvisorApplication"("reviewedBy");
CREATE INDEX IF NOT EXISTS "CollaborationParticipant_userId_idx" ON public."CollaborationParticipant"("userId");
CREATE INDEX IF NOT EXISTS "CollaborationParticipant_invitedBy_idx" ON public."CollaborationParticipant"("invitedBy");

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

-- ── 3. Enable RLS on All Tables in Public Schema ────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- ── 4. Service Role Bypass Policies (For Backend Operations) ────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all_%s" ON public.%I;', r.tablename, r.tablename);
    BEGIN
      EXECUTE format('CREATE POLICY "service_role_all_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', r.tablename, r.tablename);
    EXCEPTION WHEN undefined_object OR invalid_schema_name THEN
      NULL; -- In environments without service_role role, skip
    END;
  END LOOP;
END $$;

-- ── 5. Single-Tenant User RLS Policies (Idempotent & InitPlan Optimized) ────────
DO $$
BEGIN
  -- ── Core Tables (userId text) ──
  -- Account
  DROP POLICY IF EXISTS "own_Account_all" ON public."Account";
  CREATE POLICY "own_Account_all" ON public."Account" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- Transaction
  DROP POLICY IF EXISTS "own_Transaction_all" ON public."Transaction";
  CREATE POLICY "own_Transaction_all" ON public."Transaction" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- User
  DROP POLICY IF EXISTS "own_User_all" ON public."User";
  CREATE POLICY "own_User_all" ON public."User" FOR ALL TO authenticated USING ((select auth.uid())::text = "id"::text) WITH CHECK ((select auth.uid())::text = "id"::text);

  -- profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    DROP POLICY IF EXISTS "own_profiles_all" ON public."profiles";
    DROP POLICY IF EXISTS "Users can manage own profile" ON public."profiles";
    DROP POLICY IF EXISTS "profiles_user_only" ON public."profiles";
    CREATE POLICY "own_profiles_all" ON public."profiles" FOR ALL TO authenticated USING ((select auth.uid()) = "id") WITH CHECK ((select auth.uid()) = "id");
  END IF;

  -- UserSettings
  DROP POLICY IF EXISTS "own_UserSettings_all" ON public."UserSettings";
  CREATE POLICY "own_UserSettings_all" ON public."UserSettings" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- UserPin
  DROP POLICY IF EXISTS "own_UserPin_all" ON public."UserPin";
  CREATE POLICY "own_UserPin_all" ON public."UserPin" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- RefreshToken
  DROP POLICY IF EXISTS "own_RefreshToken_all" ON public."RefreshToken";
  CREATE POLICY "own_RefreshToken_all" ON public."RefreshToken" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- AuditLog
  DROP POLICY IF EXISTS "own_AuditLog_all" ON public."AuditLog";
  CREATE POLICY "own_AuditLog_all" ON public."AuditLog" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- Loan
  DROP POLICY IF EXISTS "own_Loan_all" ON public."Loan";
  CREATE POLICY "own_Loan_all" ON public."Loan" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- LoanPayment
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LoanPayment') THEN
    DROP POLICY IF EXISTS "own_LoanPayment_all" ON public."LoanPayment";
    CREATE POLICY "own_LoanPayment_all" ON public."LoanPayment" FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public."Loan" l WHERE l.id = "LoanPayment"."loanId" AND l."userId" = (SELECT auth.uid())::text)) WITH CHECK (EXISTS (SELECT 1 FROM public."Loan" l WHERE l.id = "LoanPayment"."loanId" AND l."userId" = (SELECT auth.uid())::text));
  END IF;

  -- Investment
  DROP POLICY IF EXISTS "own_Investment_all" ON public."Investment";
  CREATE POLICY "own_Investment_all" ON public."Investment" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- Goal
  DROP POLICY IF EXISTS "own_Goal_all" ON public."Goal";
  CREATE POLICY "own_Goal_all" ON public."Goal" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- GoalContribution
  DROP POLICY IF EXISTS "own_GoalContribution_all" ON public."GoalContribution";
  CREATE POLICY "own_GoalContribution_all" ON public."GoalContribution" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- GoalMember
  DROP POLICY IF EXISTS "own_GoalMember_all" ON public."GoalMember";
  CREATE POLICY "own_GoalMember_all" ON public."GoalMember" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- ExpenseBill
  DROP POLICY IF EXISTS "own_ExpenseBill_all" ON public."ExpenseBill";
  CREATE POLICY "own_ExpenseBill_all" ON public."ExpenseBill" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- Friend
  DROP POLICY IF EXISTS "own_Friend_all" ON public."Friend";
  CREATE POLICY "own_Friend_all" ON public."Friend" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- Category
  DROP POLICY IF EXISTS "own_Category_all" ON public."Category";
  CREATE POLICY "own_Category_all" ON public."Category" FOR ALL TO authenticated USING ("userId" IS NULL OR (select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- Device
  DROP POLICY IF EXISTS "own_Device_all" ON public."Device";
  CREATE POLICY "own_Device_all" ON public."Device" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- ImportLog
  DROP POLICY IF EXISTS "own_ImportLog_all" ON public."ImportLog";
  CREATE POLICY "own_ImportLog_all" ON public."ImportLog" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- Notification
  DROP POLICY IF EXISTS "own_Notification_all" ON public."Notification";
  CREATE POLICY "own_Notification_all" ON public."Notification" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- OtpCode
  DROP POLICY IF EXISTS "own_OtpCode_all" ON public."OtpCode";
  CREATE POLICY "own_OtpCode_all" ON public."OtpCode" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- SyncQueue
  DROP POLICY IF EXISTS "own_SyncQueue_all" ON public."SyncQueue";
  CREATE POLICY "own_SyncQueue_all" ON public."SyncQueue" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- Todo
  DROP POLICY IF EXISTS "own_Todo_all" ON public."Todo";
  CREATE POLICY "own_Todo_all" ON public."Todo" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- JournalEntry
  DROP POLICY IF EXISTS "own_JournalEntry_all" ON public."JournalEntry";
  CREATE POLICY "own_JournalEntry_all" ON public."JournalEntry" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- AiScan
  DROP POLICY IF EXISTS "own_AiScan_all" ON public."AiScan";
  CREATE POLICY "own_AiScan_all" ON public."AiScan" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- GroupExpenseMember
  DROP POLICY IF EXISTS "own_GroupExpenseMember_all" ON public."GroupExpenseMember";
  CREATE POLICY "own_GroupExpenseMember_all" ON public."GroupExpenseMember" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- group_expenses
  DROP POLICY IF EXISTS "own_group_expenses_all" ON public."group_expenses";
  CREATE POLICY "own_group_expenses_all" ON public."group_expenses" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- budgets
  DROP POLICY IF EXISTS "own_budgets_all" ON public."budgets";
  CREATE POLICY "own_budgets_all" ON public."budgets" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- daily_account_balances
  DROP POLICY IF EXISTS "own_daily_account_balances_all" ON public."daily_account_balances";
  CREATE POLICY "own_daily_account_balances_all" ON public."daily_account_balances" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- financial_events
  DROP POLICY IF EXISTS "own_financial_events_all" ON public."financial_events";
  CREATE POLICY "own_financial_events_all" ON public."financial_events" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- gold_assets
  DROP POLICY IF EXISTS "own_gold_assets_all" ON public."gold_assets";
  CREATE POLICY "own_gold_assets_all" ON public."gold_assets" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- monthly_cashflow
  DROP POLICY IF EXISTS "own_monthly_cashflow_all" ON public."monthly_cashflow";
  CREATE POLICY "own_monthly_cashflow_all" ON public."monthly_cashflow" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- monthly_category_spend
  DROP POLICY IF EXISTS "own_monthly_category_spend_all" ON public."monthly_category_spend";
  CREATE POLICY "own_monthly_category_spend_all" ON public."monthly_category_spend" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- otp_requests
  DROP POLICY IF EXISTS "own_otp_requests_all" ON public."otp_requests";
  CREATE POLICY "own_otp_requests_all" ON public."otp_requests" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  -- aa_consent, aa_consent_artifact, aa_data_session, aa_financial_data, aa_transactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'aa_consent') THEN
    DROP POLICY IF EXISTS "own_aa_consent_all" ON public."aa_consent";
    CREATE POLICY "own_aa_consent_all" ON public."aa_consent" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'aa_consent_artifact') THEN
    DROP POLICY IF EXISTS "own_aa_consent_artifact_all" ON public."aa_consent_artifact";
    CREATE POLICY "own_aa_consent_artifact_all" ON public."aa_consent_artifact" FOR ALL TO authenticated USING (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'aa_data_session') THEN
    DROP POLICY IF EXISTS "own_aa_data_session_all" ON public."aa_data_session";
    CREATE POLICY "own_aa_data_session_all" ON public."aa_data_session" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'aa_financial_data') THEN
    DROP POLICY IF EXISTS "own_aa_financial_data_all" ON public."aa_financial_data";
    CREATE POLICY "own_aa_financial_data_all" ON public."aa_financial_data" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'aa_transactions') THEN
    DROP POLICY IF EXISTS "own_aa_transactions_all" ON public."aa_transactions";
    CREATE POLICY "own_aa_transactions_all" ON public."aa_transactions" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);
  END IF;

  -- ai_events, ai_insights, ai_model_runs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_events') THEN
    DROP POLICY IF EXISTS "own_ai_events_all" ON public."ai_events";
    CREATE POLICY "own_ai_events_all" ON public."ai_events" FOR ALL TO authenticated USING ((select auth.uid())::text = "user_id"::text) WITH CHECK ((select auth.uid())::text = "user_id"::text);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_insights') THEN
    DROP POLICY IF EXISTS "own_ai_insights_all" ON public."ai_insights";
    CREATE POLICY "own_ai_insights_all" ON public."ai_insights" FOR ALL TO authenticated USING ((select auth.uid())::text = "user_id"::text) WITH CHECK ((select auth.uid())::text = "user_id"::text);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_model_runs') THEN
    DROP POLICY IF EXISTS "own_ai_model_runs_all" ON public."ai_model_runs";
    CREATE POLICY "own_ai_model_runs_all" ON public."ai_model_runs" FOR SELECT TO authenticated USING (true);
  END IF;

  -- Voice Intelligence
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'voice_transcripts') THEN
    DROP POLICY IF EXISTS "own_voice_transcripts_all" ON public."voice_transcripts";
    DROP POLICY IF EXISTS "voice_transcripts_user_only" ON public."voice_transcripts";
    CREATE POLICY "own_voice_transcripts_all" ON public."voice_transcripts" FOR ALL TO authenticated USING ((select auth.uid())::text = "user_id"::text) WITH CHECK ((select auth.uid())::text = "user_id"::text);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_voice_learning') THEN
    DROP POLICY IF EXISTS "own_user_voice_learning_all" ON public."user_voice_learning";
    DROP POLICY IF EXISTS "user_voice_learning_user_only" ON public."user_voice_learning";
    CREATE POLICY "own_user_voice_learning_all" ON public."user_voice_learning" FOR ALL TO authenticated USING ((select auth.uid())::text = "user_id"::text) WITH CHECK ((select auth.uid())::text = "user_id"::text);
  END IF;

  -- Advisor Module
  DROP POLICY IF EXISTS "own_AdvisorApplication_all" ON public."AdvisorApplication";
  CREATE POLICY "own_AdvisorApplication_all" ON public."AdvisorApplication" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text OR (select auth.uid())::text = "reviewedBy"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);

  DROP POLICY IF EXISTS "own_AdvisorSession_all" ON public."AdvisorSession";
  CREATE POLICY "own_AdvisorSession_all" ON public."AdvisorSession" FOR ALL TO authenticated USING ((select auth.uid())::text = "clientId"::text OR (select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "clientId"::text OR (select auth.uid())::text = "advisorId"::text);

  DROP POLICY IF EXISTS "own_BookingRequest_all" ON public."BookingRequest";
  CREATE POLICY "own_BookingRequest_all" ON public."BookingRequest" FOR ALL TO authenticated USING ((select auth.uid())::text = "clientId"::text OR (select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "clientId"::text OR (select auth.uid())::text = "advisorId"::text);

  DROP POLICY IF EXISTS "own_Payment_all" ON public."Payment";
  CREATE POLICY "own_Payment_all" ON public."Payment" FOR ALL TO authenticated USING ((select auth.uid())::text = "clientId"::text OR (select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "clientId"::text OR (select auth.uid())::text = "advisorId"::text);

  DROP POLICY IF EXISTS "own_AdvisorAvailability_select" ON public."AdvisorAvailability";
  DROP POLICY IF EXISTS "own_AdvisorAvailability_modify" ON public."AdvisorAvailability";
  CREATE POLICY "own_AdvisorAvailability_select" ON public."AdvisorAvailability" FOR SELECT TO authenticated USING (true);
  CREATE POLICY "own_AdvisorAvailability_modify" ON public."AdvisorAvailability" FOR ALL TO authenticated USING ((select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "advisorId"::text);

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AdvisorFollow') THEN
    DROP POLICY IF EXISTS "own_AdvisorFollow_all" ON public."AdvisorFollow";
    CREATE POLICY "own_AdvisorFollow_all" ON public."AdvisorFollow" FOR ALL TO authenticated USING ((select auth.uid())::text = "followerId"::text OR (select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "followerId"::text OR (select auth.uid())::text = "advisorId"::text);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AdvisorPost') THEN
    DROP POLICY IF EXISTS "own_AdvisorPost_select" ON public."AdvisorPost";
    DROP POLICY IF EXISTS "own_AdvisorPost_modify" ON public."AdvisorPost";
    CREATE POLICY "own_AdvisorPost_select" ON public."AdvisorPost" FOR SELECT TO authenticated USING (true);
    CREATE POLICY "own_AdvisorPost_modify" ON public."AdvisorPost" FOR ALL TO authenticated USING ((select auth.uid())::text = "advisorId"::text) WITH CHECK ((select auth.uid())::text = "advisorId"::text);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AdvisorPostLike') THEN
    DROP POLICY IF EXISTS "own_AdvisorPostLike_all" ON public."AdvisorPostLike";
    CREATE POLICY "own_AdvisorPostLike_all" ON public."AdvisorPostLike" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text) WITH CHECK ((select auth.uid())::text = "userId"::text);
  END IF;

  -- Collaboration & Chat
  DROP POLICY IF EXISTS "own_CollaborationParticipant_all" ON public."CollaborationParticipant";
  CREATE POLICY "own_CollaborationParticipant_all" ON public."CollaborationParticipant" FOR ALL TO authenticated USING ((select auth.uid())::text = "userId"::text OR (select auth.uid())::text = "invitedBy"::text) WITH CHECK ((select auth.uid())::text = "userId"::text OR (select auth.uid())::text = "invitedBy"::text);

  DROP POLICY IF EXISTS "own_ChatMessage_all" ON public."ChatMessage";
  CREATE POLICY "own_ChatMessage_all" ON public."ChatMessage" FOR ALL TO authenticated USING ((select auth.uid())::text = "senderId"::text) WITH CHECK ((select auth.uid())::text = "senderId"::text);

  -- ── Discrete 7 Tables ──
  -- 1. user_features
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_features') THEN
    DROP POLICY IF EXISTS "own user_features select" ON public.user_features;
    DROP POLICY IF EXISTS "own user_features insert" ON public.user_features;
    DROP POLICY IF EXISTS "own user_features update" ON public.user_features;
    DROP POLICY IF EXISTS "own user_features delete" ON public.user_features;
    CREATE POLICY "own user_features select" ON public.user_features FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid())::text);
    CREATE POLICY "own user_features insert" ON public.user_features FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid())::text);
    CREATE POLICY "own user_features update" ON public.user_features FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())::text) WITH CHECK (user_id = (SELECT auth.uid())::text);
    CREATE POLICY "own user_features delete" ON public.user_features FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid())::text);
  END IF;

  -- 2. recurring_transactions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recurring_transactions') THEN
    DROP POLICY IF EXISTS "own recurring_transactions select" ON public.recurring_transactions;
    DROP POLICY IF EXISTS "own recurring_transactions insert" ON public.recurring_transactions;
    DROP POLICY IF EXISTS "own recurring_transactions update" ON public.recurring_transactions;
    DROP POLICY IF EXISTS "own recurring_transactions delete" ON public.recurring_transactions;
    CREATE POLICY "own recurring_transactions select" ON public.recurring_transactions FOR SELECT TO authenticated USING ("userId" = (SELECT auth.uid())::text);
    CREATE POLICY "own recurring_transactions insert" ON public.recurring_transactions FOR INSERT TO authenticated WITH CHECK ("userId" = (SELECT auth.uid())::text);
    CREATE POLICY "own recurring_transactions update" ON public.recurring_transactions FOR UPDATE TO authenticated USING ("userId" = (SELECT auth.uid())::text) WITH CHECK ("userId" = (SELECT auth.uid())::text);
    CREATE POLICY "own recurring_transactions delete" ON public.recurring_transactions FOR DELETE TO authenticated USING ("userId" = (SELECT auth.uid())::text);
  END IF;

  -- 3. user_learning
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_learning') THEN
    DROP POLICY IF EXISTS "own user_learning select" ON public.user_learning;
    DROP POLICY IF EXISTS "own user_learning insert" ON public.user_learning;
    DROP POLICY IF EXISTS "own user_learning update" ON public.user_learning;
    DROP POLICY IF EXISTS "own user_learning delete" ON public.user_learning;
    CREATE POLICY "own user_learning select" ON public.user_learning FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid())::text);
    CREATE POLICY "own user_learning insert" ON public.user_learning FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid())::text);
    CREATE POLICY "own user_learning update" ON public.user_learning FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())::text) WITH CHECK (user_id = (SELECT auth.uid())::text);
    CREATE POLICY "own user_learning delete" ON public.user_learning FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid())::text);
  END IF;

  -- 4. todo_lists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_lists') THEN
    DROP POLICY IF EXISTS "own todo_lists select" ON public.todo_lists;
    DROP POLICY IF EXISTS "own todo_lists insert" ON public.todo_lists;
    DROP POLICY IF EXISTS "own todo_lists update" ON public.todo_lists;
    DROP POLICY IF EXISTS "own todo_lists delete" ON public.todo_lists;
    CREATE POLICY "own todo_lists select" ON public.todo_lists FOR SELECT TO authenticated USING (user_id::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_lists insert" ON public.todo_lists FOR INSERT TO authenticated WITH CHECK (user_id::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_lists update" ON public.todo_lists FOR UPDATE TO authenticated USING (user_id::text = (SELECT auth.uid())::text) WITH CHECK (user_id::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_lists delete" ON public.todo_lists FOR DELETE TO authenticated USING (user_id::text = (SELECT auth.uid())::text);
  END IF;

  -- 5. todo_items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_items') THEN
    DROP POLICY IF EXISTS "own todo_items select" ON public.todo_items;
    DROP POLICY IF EXISTS "own todo_items insert" ON public.todo_items;
    DROP POLICY IF EXISTS "own todo_items update" ON public.todo_items;
    DROP POLICY IF EXISTS "own todo_items delete" ON public.todo_items;
    CREATE POLICY "own todo_items select" ON public.todo_items FOR SELECT TO authenticated USING (user_id::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_items insert" ON public.todo_items FOR INSERT TO authenticated WITH CHECK (user_id::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_items update" ON public.todo_items FOR UPDATE TO authenticated USING (user_id::text = (SELECT auth.uid())::text) WITH CHECK (user_id::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_items delete" ON public.todo_items FOR DELETE TO authenticated USING (user_id::text = (SELECT auth.uid())::text);
  END IF;

  -- 6. todo_list_shares
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'todo_list_shares') THEN
    DROP POLICY IF EXISTS "own todo_list_shares select" ON public.todo_list_shares;
    DROP POLICY IF EXISTS "own todo_list_shares insert" ON public.todo_list_shares;
    DROP POLICY IF EXISTS "own todo_list_shares update" ON public.todo_list_shares;
    DROP POLICY IF EXISTS "own todo_list_shares delete" ON public.todo_list_shares;
    CREATE POLICY "own todo_list_shares select" ON public.todo_list_shares FOR SELECT TO authenticated USING (shared_with_user_id::text = (SELECT auth.uid())::text OR shared_by::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_list_shares insert" ON public.todo_list_shares FOR INSERT TO authenticated WITH CHECK (shared_by::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_list_shares update" ON public.todo_list_shares FOR UPDATE TO authenticated USING (shared_by::text = (SELECT auth.uid())::text) WITH CHECK (shared_by::text = (SELECT auth.uid())::text);
    CREATE POLICY "own todo_list_shares delete" ON public.todo_list_shares FOR DELETE TO authenticated USING (shared_by::text = (SELECT auth.uid())::text);
  END IF;

  -- 7. recurring_executions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recurring_executions') THEN
    DROP POLICY IF EXISTS "own recurring_executions select" ON public.recurring_executions;
    DROP POLICY IF EXISTS "own recurring_executions insert" ON public.recurring_executions;
    DROP POLICY IF EXISTS "own recurring_executions update" ON public.recurring_executions;
    DROP POLICY IF EXISTS "own recurring_executions delete" ON public.recurring_executions;
    CREATE POLICY "own recurring_executions select" ON public.recurring_executions FOR SELECT TO authenticated 
      USING (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text));
    CREATE POLICY "own recurring_executions insert" ON public.recurring_executions FOR INSERT TO authenticated 
      WITH CHECK (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text));
    CREATE POLICY "own recurring_executions update" ON public.recurring_executions FOR UPDATE TO authenticated 
      USING (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text))
      WITH CHECK (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text));
    CREATE POLICY "own recurring_executions delete" ON public.recurring_executions FOR DELETE TO authenticated 
      USING (EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = "ruleId" AND rt."userId" = (SELECT auth.uid())::text));
  END IF;

  -- System / Lookup Read-Only Tables
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PlatformSettings') THEN
    DROP POLICY IF EXISTS "read_only_PlatformSettings" ON public."PlatformSettings";
    CREATE POLICY "read_only_PlatformSettings" ON public."PlatformSettings" FOR SELECT TO authenticated USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'keyword_mappings') THEN
    DROP POLICY IF EXISTS "read_only_keyword_mappings" ON public."keyword_mappings";
    CREATE POLICY "read_only_keyword_mappings" ON public."keyword_mappings" FOR SELECT TO authenticated USING (true);
  END IF;

EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
  -- Fallback for environments without Supabase auth schema
  NULL;
END $$;
