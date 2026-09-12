-- Migration: rls_backend_only_tables
-- Purpose:
--   Enable Row Level Security on the last two public tables that had it disabled.
--
-- Why this matters:
--   The frontend ships VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY (the anon key) in its
--   JavaScript bundle — that is by design, and safe only because every table is
--   protected by RLS. These two were not, so they were reachable through the
--   Supabase REST API by anyone holding that public key:
--
--     api_idempotency_keys — 755 rows carrying `user_id` and a `response` jsonb
--       column that caches full API response bodies (created transactions,
--       balances, account details). A cross-user financial data leak.
--     ApprovalRequest — requester/target user ids, free-text reason, jsonb payload.
--
--   Neither table is ever read by a client. Both are backend-internal: the
--   idempotency middleware and the approval workflow reach them through the
--   pooled Postgres connection, which is the table owner and therefore bypasses
--   RLS. Enabling RLS with no permissive policy is a deny-all for PostgREST
--   (anon/authenticated) while leaving the backend untouched.
--
--   RLS is deliberately NOT forced: FORCE would also apply to the owner and would
--   break the backend's own access.

ALTER TABLE "public"."api_idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ApprovalRequest"      ENABLE ROW LEVEL SECURITY;

-- Explicit deny-all policies. An RLS-enabled table with zero policies already
-- denies non-owner access; these make that intent legible to the next reader and
-- prevent a future "add a policy" from silently widening access.
DROP POLICY IF EXISTS "api_idempotency_keys_no_client_access" ON "public"."api_idempotency_keys";
CREATE POLICY "api_idempotency_keys_no_client_access"
  ON "public"."api_idempotency_keys"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "ApprovalRequest_no_client_access" ON "public"."ApprovalRequest";
CREATE POLICY "ApprovalRequest_no_client_access"
  ON "public"."ApprovalRequest"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
