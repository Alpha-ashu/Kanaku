-- =====================================================
-- Migration 010 Verification: Core finance RLS enforcement
-- =====================================================
-- Run this after 010_enforce_rls_core_finance_tables.sql
-- in Supabase SQL Editor.
-- =====================================================

-- 1) Confirm RLS and FORCE RLS are enabled on critical tables.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'accounts',
    'transactions',
    'friends',
    'group_expenses',
    'loans',
    'investments',
    'goals'
  )
ORDER BY c.relname;

-- 2) Confirm ownership policies exist for each required table.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'accounts',
    'transactions',
    'friends',
    'group_expenses',
    'loans',
    'investments',
    'goals'
  )
ORDER BY tablename, cmd, policyname;

-- 3) Compact pass/fail summary for quick review.
WITH required_tables AS (
  SELECT unnest(ARRAY[
    'accounts',
    'transactions',
    'friends',
    'group_expenses',
    'loans',
    'investments',
    'goals'
  ]) AS table_name
),
security_state AS (
  SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS force_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
),
policy_counts AS (
  SELECT
    tablename AS table_name,
    COUNT(*) FILTER (WHERE cmd = 'SELECT') AS select_policies,
    COUNT(*) FILTER (WHERE cmd = 'INSERT') AS insert_policies,
    COUNT(*) FILTER (WHERE cmd = 'UPDATE') AS update_policies,
    COUNT(*) FILTER (WHERE cmd = 'DELETE') AS delete_policies
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
)
SELECT
  r.table_name,
  COALESCE(s.rls_enabled, false) AS rls_enabled,
  COALESCE(s.force_rls_enabled, false) AS force_rls_enabled,
  COALESCE(p.select_policies, 0) AS select_policies,
  COALESCE(p.insert_policies, 0) AS insert_policies,
  COALESCE(p.update_policies, 0) AS update_policies,
  COALESCE(p.delete_policies, 0) AS delete_policies,
  (
    COALESCE(s.rls_enabled, false)
    AND COALESCE(s.force_rls_enabled, false)
    AND COALESCE(p.select_policies, 0) >= 1
    AND COALESCE(p.insert_policies, 0) >= 1
    AND COALESCE(p.update_policies, 0) >= 1
    AND COALESCE(p.delete_policies, 0) >= 1
  ) AS verification_passed
FROM required_tables r
LEFT JOIN security_state s ON s.table_name = r.table_name
LEFT JOIN policy_counts p ON p.table_name = r.table_name
ORDER BY r.table_name;
