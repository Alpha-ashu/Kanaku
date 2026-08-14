-- Migration: 20260813120000_restore_rls_initplan_optimization
--
-- Restores the `(select auth.uid())` InitPlan form on policies that were
-- reverted to a bare `auth.uid()` by hand.
--
-- On 2026-08-13 at 08:27 UTC a batch of ALTER POLICY statements was run from
-- the Supabase dashboard (visible in the Postgres logs, tagged
-- `-- source: dashboard`). Those statements rewrote seven tables' policies to
-- use bare `auth.uid()::text`, undoing the optimization that
-- 20260813000000_supabase_security_and_performance_remediation had applied
-- roughly twenty minutes earlier.
--
-- Why the wrapper matters: a bare `auth.uid()` is volatile from the planner's
-- point of view and is re-evaluated once PER ROW. Wrapping it in a scalar
-- subquery lets Postgres hoist it into an InitPlan and evaluate it ONCE per
-- statement. On the large per-user tables here (todo_items, recurring
-- executions) that is the difference between a constant and a per-row function
-- call on every scan. Behaviour is identical; only the plan changes.
--
-- This is a performance fix, not a correctness one -- the bare form still
-- isolates tenants correctly. It is written to be safe to re-run: each policy
-- is altered only when it actually exists, so a database that never received
-- the dashboard edit is left untouched.

DO $$
DECLARE
  -- (table, policy, using_expr, check_expr) -- NULL means "leave that clause alone".
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- recurring_transactions: userId is already text
      ('recurring_transactions', 'own recurring_transactions select', '"userId" = (select auth.uid())::text', NULL),
      ('recurring_transactions', 'own recurring_transactions insert', NULL, '"userId" = (select auth.uid())::text'),
      ('recurring_transactions', 'own recurring_transactions update', '"userId" = (select auth.uid())::text', '"userId" = (select auth.uid())::text'),
      ('recurring_transactions', 'own recurring_transactions delete', '"userId" = (select auth.uid())::text', NULL),

      ('todo_items', 'own todo_items select', '(user_id)::text = (select auth.uid())::text', NULL),
      ('todo_items', 'own todo_items insert', NULL, '(user_id)::text = (select auth.uid())::text'),
      ('todo_items', 'own todo_items update', '(user_id)::text = (select auth.uid())::text', '(user_id)::text = (select auth.uid())::text'),
      ('todo_items', 'own todo_items delete', '(user_id)::text = (select auth.uid())::text', NULL),

      ('todo_lists', 'own todo_lists select', '(user_id)::text = (select auth.uid())::text', NULL),
      ('todo_lists', 'own todo_lists insert', NULL, '(user_id)::text = (select auth.uid())::text'),
      ('todo_lists', 'own todo_lists update', '(user_id)::text = (select auth.uid())::text', '(user_id)::text = (select auth.uid())::text'),
      ('todo_lists', 'own todo_lists delete', '(user_id)::text = (select auth.uid())::text', NULL),

      -- shares stay readable by both sides of the share, writable only by the sharer
      ('todo_list_shares', 'own todo_list_shares select', '((shared_with_user_id)::text = (select auth.uid())::text) OR ((shared_by)::text = (select auth.uid())::text)', NULL),
      ('todo_list_shares', 'own todo_list_shares insert', NULL, '(shared_by)::text = (select auth.uid())::text'),
      ('todo_list_shares', 'own todo_list_shares update', '(shared_by)::text = (select auth.uid())::text', '(shared_by)::text = (select auth.uid())::text'),
      ('todo_list_shares', 'own todo_list_shares delete', '(shared_by)::text = (select auth.uid())::text', NULL),

      ('user_features', 'own user_features select', 'user_id::text = (select auth.uid())::text', NULL),
      ('user_features', 'own user_features insert', NULL, 'user_id::text = (select auth.uid())::text'),
      ('user_features', 'own user_features update', 'user_id::text = (select auth.uid())::text', 'user_id::text = (select auth.uid())::text'),
      ('user_features', 'own user_features delete', 'user_id::text = (select auth.uid())::text', NULL),

      ('user_learning', 'own user_learning select', 'user_id::text = (select auth.uid())::text', NULL),
      ('user_learning', 'own user_learning insert', NULL, 'user_id::text = (select auth.uid())::text'),
      ('user_learning', 'own user_learning update', 'user_id::text = (select auth.uid())::text', 'user_id::text = (select auth.uid())::text'),
      ('user_learning', 'own user_learning delete', 'user_id::text = (select auth.uid())::text', NULL),

      -- recurring_executions has no userId of its own; ownership comes from the parent rule
      ('recurring_executions', 'own recurring_executions select',
        'EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = recurring_executions."ruleId" AND rt."userId" = (select auth.uid())::text)', NULL),
      ('recurring_executions', 'own recurring_executions insert', NULL,
        'EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = recurring_executions."ruleId" AND rt."userId" = (select auth.uid())::text)'),
      ('recurring_executions', 'own recurring_executions update',
        'EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = recurring_executions."ruleId" AND rt."userId" = (select auth.uid())::text)',
        'EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = recurring_executions."ruleId" AND rt."userId" = (select auth.uid())::text)'),
      ('recurring_executions', 'own recurring_executions delete',
        'EXISTS (SELECT 1 FROM public.recurring_transactions rt WHERE rt.id = recurring_executions."ruleId" AND rt."userId" = (select auth.uid())::text)', NULL)
    ) AS t(tbl, pol, using_expr, check_expr)
  LOOP
    -- Skip anything that is not present on this database rather than failing the
    -- whole migration: these policies were created by ad-hoc scripts, so a fresh
    -- environment may legitimately not have them yet.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = spec.tbl AND policyname = spec.pol
    );

    IF spec.using_expr IS NOT NULL AND spec.check_expr IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                     spec.pol, spec.tbl, spec.using_expr, spec.check_expr);
    ELSIF spec.using_expr IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                     spec.pol, spec.tbl, spec.using_expr);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                     spec.pol, spec.tbl, spec.check_expr);
    END IF;
  END LOOP;
END $$;
