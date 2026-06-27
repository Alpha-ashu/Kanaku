-- Registration remediation (Phase 1) — phone uniqueness for the profiles table.
--
-- DEFERRED: the profiles.id → User.id foreign key (decision: defer). It would
-- require converting profiles.id from uuid → text (User.id is text) AND
-- dropping/recreating the Supabase RLS policy `profiles_owner_policy`
-- (auth.uid() = id), which crosses into security-policy changes. New orphan
-- profiles are already prevented by the atomic registration transaction, so the
-- FK is defense-in-depth and is tracked as a separate, RLS-reviewed change.
--
-- Steps 1a–1b are DATA CLEANUP that MUST run before the unique index. On the
-- current production dataset they affect 0 rows (verified by read-only dry-run).

-- 1a. Normalize empty-string phones to NULL so they aren't unique-constrained.
UPDATE "public"."profiles" SET phone = NULL WHERE phone IS NOT NULL AND btrim(phone) = '';

-- 1b. De-duplicate phones: keep the earliest row per phone, NULL the rest, so the
--     unique index can be created without violating existing data.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at NULLS LAST, id) AS rn
  FROM "public"."profiles"
  WHERE phone IS NOT NULL
)
UPDATE "public"."profiles" p
SET phone = NULL
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 2. Phone uniqueness. Postgres allows multiple NULLs, so optional phones are fine.
CREATE UNIQUE INDEX "profiles_phone_key" ON "public"."profiles"("phone");
