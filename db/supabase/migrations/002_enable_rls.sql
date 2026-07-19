-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================
-- This script enables RLS and creates policies to ensure
-- users can only access their own data
-- 
-- Instructions:
-- 1. Run this AFTER running 001_create_tables.sql
-- 2. Go to Supabase Dashboard > SQL Editor
-- 3. Paste this entire file
-- 4. Click "Run"
-- =====================================================

-- =====================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- =====================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_list_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_bills ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =====================================================
-- ACCOUNTS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own accounts"
  ON public.accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON public.accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON public.accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON public.accounts FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- FRIENDS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own friends"
  ON public.friends FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own friends"
  ON public.friends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own friends"
  ON public.friends FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own friends"
  ON public.friends FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TRANSACTIONS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- LOANS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own loans"
  ON public.loans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own loans"
  ON public.loans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own loans"
  ON public.loans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own loans"
  ON public.loans FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- LOAN PAYMENTS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own loan payments"
  ON public.loan_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own loan payments"
  ON public.loan_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own loan payments"
  ON public.loan_payments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own loan payments"
  ON public.loan_payments FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- GOALS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own goals"
  ON public.goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals"
  ON public.goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
  ON public.goals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
  ON public.goals FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- GOAL CONTRIBUTIONS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own goal contributions"
  ON public.goal_contributions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goal contributions"
  ON public.goal_contributions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goal contributions"
  ON public.goal_contributions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goal contributions"
  ON public.goal_contributions FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- GROUP EXPENSES TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own group expenses"
  ON public.group_expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own group expenses"
  ON public.group_expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own group expenses"
  ON public.group_expenses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own group expenses"
  ON public.group_expenses FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- INVESTMENTS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own investments"
  ON public.investments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own investments"
  ON public.investments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own investments"
  ON public.investments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own investments"
  ON public.investments FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- NOTIFICATIONS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TAX CALCULATIONS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own tax calculations"
  ON public.tax_calculations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tax calculations"
  ON public.tax_calculations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tax calculations"
  ON public.tax_calculations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tax calculations"
  ON public.tax_calculations FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TODO LISTS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own todo lists"
  ON public.todo_lists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared todo lists"
  ON public.todo_lists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_list_shares
      WHERE list_id = todo_lists.id
      AND shared_with_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own todo lists"
  ON public.todo_lists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own todo lists"
  ON public.todo_lists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update shared todo lists if editor"
  ON public.todo_lists FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_list_shares
      WHERE list_id = todo_lists.id
      AND shared_with_user_id = auth.uid()
      AND permission = 'edit'
    )
  );

CREATE POLICY "Users can delete own todo lists"
  ON public.todo_lists FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TODO ITEMS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own todo items"
  ON public.todo_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_items.list_id
      AND (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.todo_list_shares
          WHERE list_id = todo_lists.id
          AND shared_with_user_id = auth.uid()
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
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert todo items in shared lists if editor"
  ON public.todo_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.todo_list_shares
      WHERE list_id = todo_items.list_id
      AND shared_with_user_id = auth.uid()
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
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.todo_list_shares
          WHERE list_id = todo_lists.id
          AND shared_with_user_id = auth.uid()
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
      AND user_id = auth.uid()
    )
  );

-- =====================================================
-- TODO LIST SHARES TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view shares for own lists"
  ON public.todo_list_shares FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_list_shares.list_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own shares"
  ON public.todo_list_shares FOR SELECT
  USING (shared_with_user_id = auth.uid());

CREATE POLICY "Users can create shares for own lists"
  ON public.todo_list_shares FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_list_shares.list_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete shares from own lists"
  ON public.todo_list_shares FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.todo_lists
      WHERE id = todo_list_shares.list_id
      AND user_id = auth.uid()
    )
  );

-- =====================================================
-- EXPENSE BILLS TABLE POLICIES
-- =====================================================
CREATE POLICY "Users can view own expense bills"
  ON public.expense_bills FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expense bills"
  ON public.expense_bills FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expense bills"
  ON public.expense_bills FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own expense bills"
  ON public.expense_bills FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- STORAGE POLICIES (for file uploads)
-- =====================================================
-- Create storage bucket for expense bills
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-bills', 'expense-bills', false)
ON CONFLICT (id) DO NOTHING;

-- Allow users to upload files
CREATE POLICY "Users can upload own expense bills"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'expense-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to view own files
CREATE POLICY "Users can view own expense bills"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'expense-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow users to delete own files
CREATE POLICY "Users can delete own expense bills"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'expense-bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =====================================================
-- COMPLETED!
-- =====================================================
-- All tables are now protected with RLS
-- Users can only access their own data
-- =====================================================
