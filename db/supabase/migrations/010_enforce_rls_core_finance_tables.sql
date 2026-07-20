-- =====================================================
-- Migration 010: Enforce RLS on core financial tables
-- =====================================================
-- Purpose:
-- 1) Ensure RLS is enabled on critical multi-tenant tables.
-- 2) Recreate strict ownership policies for authenticated users.
--
-- Apply in Supabase SQL Editor after earlier schema migrations.
-- =====================================================

-- 1) Enable + force RLS on required tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.friends FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.investments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.goals FORCE ROW LEVEL SECURITY;

-- 2) Accounts
DROP POLICY IF EXISTS "Users can view own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can insert own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can delete own accounts" ON public.accounts;

CREATE POLICY "Users can view own accounts"
  ON public.accounts FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own accounts"
  ON public.accounts FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own accounts"
  ON public.accounts FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own accounts"
  ON public.accounts FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 3) Transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 4) Friends
DROP POLICY IF EXISTS "Users can view own friends" ON public.friends;
DROP POLICY IF EXISTS "Users can insert own friends" ON public.friends;
DROP POLICY IF EXISTS "Users can update own friends" ON public.friends;
DROP POLICY IF EXISTS "Users can delete own friends" ON public.friends;

CREATE POLICY "Users can view own friends"
  ON public.friends FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own friends"
  ON public.friends FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own friends"
  ON public.friends FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own friends"
  ON public.friends FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 5) Group expenses
DROP POLICY IF EXISTS "Users can view own group expenses" ON public.group_expenses;
DROP POLICY IF EXISTS "Users can insert own group expenses" ON public.group_expenses;
DROP POLICY IF EXISTS "Users can update own group expenses" ON public.group_expenses;
DROP POLICY IF EXISTS "Users can delete own group expenses" ON public.group_expenses;

CREATE POLICY "Users can view own group expenses"
  ON public.group_expenses FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own group expenses"
  ON public.group_expenses FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own group expenses"
  ON public.group_expenses FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own group expenses"
  ON public.group_expenses FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 6) Loans
DROP POLICY IF EXISTS "Users can view own loans" ON public.loans;
DROP POLICY IF EXISTS "Users can insert own loans" ON public.loans;
DROP POLICY IF EXISTS "Users can update own loans" ON public.loans;
DROP POLICY IF EXISTS "Users can delete own loans" ON public.loans;

CREATE POLICY "Users can view own loans"
  ON public.loans FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own loans"
  ON public.loans FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own loans"
  ON public.loans FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own loans"
  ON public.loans FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 7) Investments
DROP POLICY IF EXISTS "Users can view own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can insert own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can update own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can delete own investments" ON public.investments;

CREATE POLICY "Users can view own investments"
  ON public.investments FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own investments"
  ON public.investments FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own investments"
  ON public.investments FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own investments"
  ON public.investments FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 8) Goals
DROP POLICY IF EXISTS "Users can view own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can insert own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can delete own goals" ON public.goals;

CREATE POLICY "Users can view own goals"
  ON public.goals FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own goals"
  ON public.goals FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own goals"
  ON public.goals FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own goals"
  ON public.goals FOR DELETE
  USING ((select auth.uid()) = user_id);
