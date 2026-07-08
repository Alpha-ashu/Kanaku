-- Drop the deprecated PII columns from "User". These were superseded by the
-- `profiles` table (single source of truth for PII) on 2026-06-21; the app has
-- since written PII only to `profiles` (verified 2026-07-08: no Prisma read or
-- write of these columns — registration/profile flows insert them into
-- public.profiles via raw SQL, and User.create/upsert set only name/email/etc.).
--
-- IF EXISTS guards keep this idempotent and safe on databases where a prior
-- manual cleanup already removed a column.

ALTER TABLE "User" DROP COLUMN IF EXISTS "firstName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "salary";
ALTER TABLE "User" DROP COLUMN IF EXISTS "dateOfBirth";
ALTER TABLE "User" DROP COLUMN IF EXISTS "jobType";
