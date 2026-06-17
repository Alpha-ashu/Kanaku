-- Step-up security hardening: record the last successful PIN verify/create so
-- the verify-security endpoint can require a recent proof before issuing a
-- security token. Nullable, backward compatible (expand-only).
ALTER TABLE "public"."UserPin"
  ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);
