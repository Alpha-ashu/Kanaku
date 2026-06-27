-- Registration remediation (Phase 1) — referential integrity for the
-- User ↔ profiles relationship and phone uniqueness.
--
-- Steps 1a–1c are DATA CLEANUP that MUST run before the constraints, or the
-- ALTER/CREATE statements would fail on pre-existing data.

-- 1a. Drop orphan profiles (no matching User) — the FK below would reject them.
DELETE FROM "public"."profiles" p
WHERE NOT EXISTS (SELECT 1 FROM "public"."User" u WHERE u.id = p.id);

-- 1b. Normalize empty-string phones to NULL so they aren't unique-constrained.
UPDATE "public"."profiles" SET phone = NULL WHERE phone IS NOT NULL AND btrim(phone) = '';

-- 1c. De-duplicate phones: keep the earliest row per phone, NULL the rest, so the
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

-- 2. Referential integrity: profiles.id references User.id (1:1 shared PK),
--    cascade on delete so removing a User removes its profile.
ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey"
  FOREIGN KEY ("id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Phone uniqueness. Postgres allows multiple NULLs, so optional phones are fine.
CREATE UNIQUE INDEX "profiles_phone_key" ON "public"."profiles"("phone");
