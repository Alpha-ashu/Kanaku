-- =====================================================
-- Migration 014: Enforce RLS on PascalCase Tables
-- =====================================================
-- Ensures that the new table names used by Prisma are 
-- correctly protected by Supabase Row Level Security.
-- =====================================================

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'Account', 'Transaction', 'Goal', 'Friend', 'Loan', 
        'Investment', 'Category', 'ExpenseBill', 'GoalContribution', 
        'LoanPayment', 'Notification', 'Todo', 'SyncQueue', 
        'UserPin', 'UserSettings', 'Device', 'ImportLog', 
        'AiScan', 'BookingRequest', 'AdvisorSession', 'Payment', 
        'ChatMessage', 'AdvisorAvailability', 'GroupExpenseMember'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE IF EXISTS public."%s" ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE IF EXISTS public."%s" FORCE ROW LEVEL SECURITY', t);
        
        -- Drop existing standard policies to avoid duplicates
        EXECUTE format('DROP POLICY IF EXISTS "owner_all_access" ON public."%s"', t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can view own %s" ON public."%s"', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can insert own %s" ON public."%s"', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can update own %s" ON public."%s"', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Users can delete own %s" ON public."%s"', t, t);
    END LOOP;
END $$;

-- 1. Standard Ownership Policies (User-bound tables)
-- Logic: (select auth.uid())::text = "userId"
-- We use a loop for the common pattern to keep it clean.

DO $$
DECLARE
    t text;
    -- Tables where ownership is defined by "userId" column
    user_id_tables text[] := ARRAY[
        'Account', 'Transaction', 'Goal', 'Friend', 'Loan', 
        'Investment', 'Category', 'ExpenseBill', 'GoalContribution', 
        'Notification', 'Todo', 'SyncQueue', 'UserPin', 'UserSettings', 
        'Device', 'ImportLog', 'AiScan', 'AdvisorAvailability'
    ];
BEGIN
    FOREACH t IN ARRAY user_id_tables
    LOOP
        EXECUTE format('
            CREATE POLICY "owner_all_access" ON public."%s"
            FOR ALL
            USING ((select auth.uid())::text = "userId")
            WITH CHECK ((select auth.uid())::text = "userId")
        ', t);
    END LOOP;
END $$;

-- 2. Special Cases

-- OtpCode (Schema: auth)
ALTER TABLE IF EXISTS auth."OtpCode" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "otp_owner_only" ON auth."OtpCode";
CREATE POLICY "otp_owner_only" ON auth."OtpCode"
  FOR ALL
  USING ((select auth.uid())::text = "userId")
  WITH CHECK ((select auth.uid())::text = "userId");

-- LoanPayment
-- userId is not directly on LoanPayment in Prisma, but it should be for RLS.
-- If it's missing, we need to join through Loan.
-- Let's check LoanPayment schema again.
-- Line 334: model LoanPayment { userId String ... } - it IS there.
ALTER TABLE IF EXISTS public."LoanPayment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loan_payment_owner" ON public."LoanPayment";
CREATE POLICY "loan_payment_owner" ON public."LoanPayment"
  FOR ALL
  USING ((select auth.uid())::text = "userId")
  WITH CHECK ((select auth.uid())::text = "userId");

-- BookingRequest
-- Has clientId and advisorId. Both should see it.
DROP POLICY IF EXISTS "booking_participants" ON public."BookingRequest";
CREATE POLICY "booking_participants" ON public."BookingRequest"
  FOR ALL
  USING ((select auth.uid())::text = "clientId" OR (select auth.uid())::text = "advisorId");

-- AdvisorSession
-- Has clientId and advisorId.
DROP POLICY IF EXISTS "session_participants" ON public."AdvisorSession";
CREATE POLICY "session_participants" ON public."AdvisorSession"
  FOR ALL
  USING ((select auth.uid())::text = "clientId" OR (select auth.uid())::text = "advisorId");

-- Payment
-- Has clientId and advisorId.
DROP POLICY IF EXISTS "payment_participants" ON public."Payment";
CREATE POLICY "payment_participants" ON public."Payment"
  FOR ALL
  USING ((select auth.uid())::text = "clientId" OR (select auth.uid())::text = "advisorId");

-- ChatMessage
-- Has senderId and is linked to session.
DROP POLICY IF EXISTS "chat_participants" ON public."ChatMessage";
CREATE POLICY "chat_participants" ON public."ChatMessage"
  FOR ALL
  USING (
    (select auth.uid())::text = "senderId" OR
    EXISTS (
      SELECT 1 FROM public."AdvisorSession" s
      WHERE s.id = "sessionId"
      AND (s."clientId" = (select auth.uid())::text OR s."advisorId" = (select auth.uid())::text)
    )
  );

-- GroupExpenseMember
-- Has userId (optional).
DROP POLICY IF EXISTS "member_access" ON public."GroupExpenseMember";
CREATE POLICY "member_access" ON public."GroupExpenseMember"
  FOR ALL
  USING (
    (select auth.uid())::text = "userId" OR
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = "groupExpenseId"
      AND ge.user_id = (select auth.uid()) -- Note: group_expenses is snake_case and user_id is UUID
    )
  );

-- User table (if exists in public)
ALTER TABLE IF EXISTS public."User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_self_access" ON public."User";
CREATE POLICY "user_self_access" ON public."User"
  FOR ALL
  USING ((select auth.uid())::text = id)
  WITH CHECK ((select auth.uid())::text = id);

-- =====================================================
-- Migration 014 Complete
-- =====================================================
