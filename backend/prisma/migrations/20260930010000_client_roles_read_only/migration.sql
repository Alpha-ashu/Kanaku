-- Migration: 20260930010000_client_roles_read_only
--
-- Supabase exposes every table in `public` over PostgREST to the `anon` and
-- `authenticated` roles, and the web bundle carries the anon key. Migration
-- 20260813000000 gave each user table an owner policy `FOR ALL TO authenticated`
-- (USING and WITH CHECK auth.uid() = owner). Nothing in KANAKU writes through
-- that path — the API connects directly and bypasses RLS, and the frontend never
-- calls supabase.from(...) — so those write grants only ever served one purpose:
-- letting a user who holds a Supabase session (every Google sign-in does, with
-- auth.uid() = "User".id) rewrite their own rows with no server rule applied:
--
--   * "User".role = 'admin' / isApproved      -> privilege escalation
--   * "Account".balance, "Transaction"         -> ledger invariants bypassed
--   * "AdvisorApplication".status = 'APPROVED' -> self-approval
--   * "Device" trust flags, "UserPin", "otp_requests" (forged verification),
--     "AuditLog" (tampering), "BookingRequest"/"AdvisorSession"/"Payment" state
--
-- and `aa_consent_artifact` had `FOR ALL TO authenticated USING (true)`: any
-- signed-in user could read and modify every user's consent artifacts.
--
-- This migration keeps what the client legitimately needs (read-only access to
-- its OWN rows, which Supabase Realtime postgres_changes requires) and removes
-- everything else:
--
--   1. Every non-SELECT policy granted to anon/authenticated/public is dropped.
--      Explicit deny-all policies (USING false) are kept as they are.
--   2. A dropped `FOR ALL` owner policy is replaced by a `FOR SELECT` policy with
--      the SAME ownership predicate — unless the predicate is `true` (grants
--      every row) or the table holds credentials / security state, which the
--      client has no reason to read at all.
--
-- Policies only: no tables, columns or rows change, and the service role (API)
-- is unaffected. Idempotent — a second run finds nothing to drop.

DO $$
DECLARE
  r RECORD;
  -- Tables the client may not read even for its own rows: password / PIN hashes,
  -- refresh tokens, OTP state, device trust, the audit trail, idempotency and
  -- sync internals.
  no_client_read CONSTANT text[] := ARRAY[
    'User', 'UserPin', 'RefreshToken', 'AuditLog', 'OtpCode', 'otp_requests',
    'Device', 'SyncQueue', 'api_idempotency_keys', 'financial_events',
    'aa_consent_artifact'
  ];
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual
      FROM pg_policies
     WHERE schemaname = 'public'
       AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
       AND cmd <> 'SELECT'
       AND coalesce(qual, '') <> 'false'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    IF r.cmd = 'ALL'
       AND r.qual IS NOT NULL
       AND r.qual <> 'true'
       AND NOT (r.tablename = ANY (no_client_read)) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
        left(r.policyname, 58) || '_read', r.tablename, r.qual
      );
    END IF;
  END LOOP;

  -- A SELECT policy left behind on a credential table (none exist today) would
  -- still expose it; drop any so the table is service-role only.
  FOR r IN
    SELECT tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND cmd = 'SELECT'
       AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
       AND coalesce(qual, '') <> 'false'
       AND tablename = ANY (no_client_read)
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
