-- =====================================================
-- Migration 014 Verification: PascalCase RLS
-- =====================================================

WITH target_tables AS (
  SELECT unnest(ARRAY[
    'Account', 'Transaction', 'Goal', 'Friend', 'Loan', 
    'Investment', 'Category', 'ExpenseBill', 'GoalContribution', 
    'LoanPayment', 'Notification', 'Todo', 'SyncQueue', 
    'UserPin', 'UserSettings', 'Device', 'ImportLog', 
    'AiScan', 'BookingRequest', 'AdvisorSession', 'Payment', 
    'ChatMessage', 'AdvisorAvailability', 'GroupExpenseMember',
    'User'
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
    COUNT(*) AS total_policies
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename
)
SELECT
  r.table_name,
  COALESCE(s.rls_enabled, false) AS rls_enabled,
  COALESCE(s.force_rls_enabled, false) AS force_rls_enabled,
  COALESCE(p.total_policies, 0) AS total_policies,
  (
    COALESCE(s.rls_enabled, false)
    AND COALESCE(s.force_rls_enabled, false)
    AND COALESCE(p.total_policies, 0) >= 1
  ) AS verification_passed
FROM target_tables r
LEFT JOIN security_state s ON s.table_name = r.table_name
LEFT JOIN policy_counts p ON p.table_name = r.table_name
ORDER BY r.table_name;
