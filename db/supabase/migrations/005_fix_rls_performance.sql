-- =====================================================
-- Migration 005: Fix RLS Performance Issues
-- =====================================================
-- Fixes two categories of Supabase Database Linter warnings:
--
-- 1. auth_rls_initplan (WARN): Replace bare auth.uid() calls with
--    (select auth.uid()) so PostgreSQL evaluates the function once
--    per query instead of once per row, improving performance at scale.
--
-- 2. multiple_permissive_policies (WARN): Drop the duplicate
--    "Users access own <table>" policies that overlap with the
--    original "Users can ... own <table>" policies on the same
--    role+action combinations.
--
-- Instructions:
--   Go to Supabase Dashboard → SQL Editor → paste and run this file.
-- =====================================================

-- =====================================================
-- PART 1: DROP DUPLICATE PERMISSIVE POLICIES
-- (the "Users access own ..." set duplicates the original policies)
-- =====================================================

DROP POLICY IF EXISTS "Users access own accounts"    ON public.accounts;
DROP POLICY IF EXISTS "Users access own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users access own loans"        ON public.loans;
DROP POLICY IF EXISTS "Users access own goals"        ON public.goals;
DROP POLICY IF EXISTS "Users access own investments"  ON public.investments;
DROP POLICY IF EXISTS "Users access own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users access own devices"      ON public.user_devices;

-- =====================================================
-- PART 2: FIX auth_rls_initplan — Replace all bare auth.uid()
-- with (select auth.uid()) in every policy.
-- Strategy: DROP + CREATE each policy.
-- =====================================================

-- ── PROFILES ─────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

-- ── ACCOUNTS ─────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own accounts"   ON public.accounts;
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
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own accounts"
  ON public.accounts FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── FRIENDS ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own friends"   ON public.friends;
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
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own friends"
  ON public.friends FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── TRANSACTIONS ─────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own transactions"   ON public.transactions;
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
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── LOANS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own loans"   ON public.loans;
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
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own loans"
  ON public.loans FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── LOAN PAYMENTS ────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own loan payments"   ON public.loan_payments;
DROP POLICY IF EXISTS "Users can insert own loan payments" ON public.loan_payments;
DROP POLICY IF EXISTS "Users can update own loan payments" ON public.loan_payments;
DROP POLICY IF EXISTS "Users can delete own loan payments" ON public.loan_payments;

CREATE POLICY "Users can view own loan payments"
  ON public.loan_payments FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own loan payments"
  ON public.loan_payments FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own loan payments"
  ON public.loan_payments FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own loan payments"
  ON public.loan_payments FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── GOALS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own goals"   ON public.goals;
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
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own goals"
  ON public.goals FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── GOAL CONTRIBUTIONS ───────────────────────────────
DROP POLICY IF EXISTS "Users can view own goal contributions"   ON public.goal_contributions;
DROP POLICY IF EXISTS "Users can insert own goal contributions" ON public.goal_contributions;
DROP POLICY IF EXISTS "Users can update own goal contributions" ON public.goal_contributions;
DROP POLICY IF EXISTS "Users can delete own goal contributions" ON public.goal_contributions;

CREATE POLICY "Users can view own goal contributions"
  ON public.goal_contributions FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own goal contributions"
  ON public.goal_contributions FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own goal contributions"
  ON public.goal_contributions FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own goal contributions"
  ON public.goal_contributions FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── GROUP EXPENSES ───────────────────────────────────
DROP POLICY IF EXISTS "Users can view own group expenses"   ON public.group_expenses;
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
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own group expenses"
  ON public.group_expenses FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── INVESTMENTS ──────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own investments"   ON public.investments;
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
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own investments"
  ON public.investments FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── NOTIFICATIONS ────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── TAX CALCULATIONS ─────────────────────────────────
DROP POLICY IF EXISTS "Users can view own tax calculations"   ON public.tax_calculations;
DROP POLICY IF EXISTS "Users can insert own tax calculations" ON public.tax_calculations;
DROP POLICY IF EXISTS "Users can update own tax calculations" ON public.tax_calculations;
DROP POLICY IF EXISTS "Users can delete own tax calculations" ON public.tax_calculations;

CREATE POLICY "Users can view own tax calculations"
  ON public.tax_calculations FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own tax calculations"
  ON public.tax_calculations FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own tax calculations"
  ON public.tax_calculations FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own tax calculations"
  ON public.tax_calculations FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── TODO LISTS ───────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own todo lists"                     ON public.todo_lists;
DROP POLICY IF EXISTS "Users can view shared todo lists"                  ON public.todo_lists;
DROP POLICY IF EXISTS "Users can insert own todo lists"                   ON public.todo_lists;
DROP POLICY IF EXISTS "Users can update own todo lists"                   ON public.todo_lists;
DROP POLICY IF EXISTS "Users can update shared todo lists if editor"      ON public.todo_lists;
DROP POLICY IF EXISTS "Users can delete own todo lists"                   ON public.todo_lists;

CREATE POLICY "Users can view own todo lists"
  ON public.todo_lists FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can view shared todo lists"
  ON public.todo_lists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_list_shares
      WHERE list_id = todo_lists.id
      AND shared_with_user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert own todo lists"
  ON public.todo_lists FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own todo lists"
  ON public.todo_lists FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update shared todo lists if editor"
  ON public.todo_lists FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_list_shares
      WHERE list_id = todo_lists.id
      AND shared_with_user_id = (select auth.uid())
      AND permission = 'edit'
    )
  );

CREATE POLICY "Users can delete own todo lists"
  ON public.todo_lists FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── TODO ITEMS ───────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own todo items"                         ON public.todo_items;
DROP POLICY IF EXISTS "Users can insert todo items in own lists"              ON public.todo_items;
DROP POLICY IF EXISTS "Users can insert todo items in shared lists if editor" ON public.todo_items;
DROP POLICY IF EXISTS "Users can update own todo items"                       ON public.todo_items;
DROP POLICY IF EXISTS "Users can delete own todo items"                       ON public.todo_items;

CREATE POLICY "Users can view own todo items"
  ON public.todo_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_items.list_id
      AND (
        user_id = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.todo_list_shares
          WHERE list_id = todo_lists.id
          AND shared_with_user_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "Users can insert todo items in own lists"
  ON public.todo_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_items.list_id
      AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert todo items in shared lists if editor"
  ON public.todo_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.todo_list_shares
      WHERE list_id = todo_items.list_id
      AND shared_with_user_id = (select auth.uid())
      AND permission = 'edit'
    )
  );

CREATE POLICY "Users can update own todo items"
  ON public.todo_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_items.list_id
      AND (
        user_id = (select auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.todo_list_shares
          WHERE list_id = todo_lists.id
          AND shared_with_user_id = (select auth.uid())
          AND permission = 'edit'
        )
      )
    )
  );

CREATE POLICY "Users can delete own todo items"
  ON public.todo_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_items.list_id
      AND user_id = (select auth.uid())
    )
  );

-- ── TODO LIST SHARES ─────────────────────────────────
DROP POLICY IF EXISTS "Users can view shares for own lists"  ON public.todo_list_shares;
DROP POLICY IF EXISTS "Users can view own shares"            ON public.todo_list_shares;
DROP POLICY IF EXISTS "Users can create shares for own lists" ON public.todo_list_shares;
DROP POLICY IF EXISTS "Users can delete shares from own lists" ON public.todo_list_shares;

CREATE POLICY "Users can view shares for own lists"
  ON public.todo_list_shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_list_shares.list_id
      AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can view own shares"
  ON public.todo_list_shares FOR SELECT
  USING (shared_with_user_id = (select auth.uid()));

CREATE POLICY "Users can create shares for own lists"
  ON public.todo_list_shares FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_list_shares.list_id
      AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete shares from own lists"
  ON public.todo_list_shares FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_list_shares.list_id
      AND user_id = (select auth.uid())
    )
  );

-- ── EXPENSE BILLS ────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own expense bills"   ON public.expense_bills;
DROP POLICY IF EXISTS "Users can insert own expense bills" ON public.expense_bills;
DROP POLICY IF EXISTS "Users can update own expense bills" ON public.expense_bills;
DROP POLICY IF EXISTS "Users can delete own expense bills" ON public.expense_bills;

CREATE POLICY "Users can view own expense bills"
  ON public.expense_bills FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own expense bills"
  ON public.expense_bills FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own expense bills"
  ON public.expense_bills FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own expense bills"
  ON public.expense_bills FOR DELETE
  USING ((select auth.uid()) = user_id);

-- =====================================================
-- COMPLETED!
-- All RLS policies now use (select auth.uid()) for optimal
-- query plan caching. Duplicate "Users access own ..." policies
-- have been removed.
-- =====================================================
