-- Migration: friend_unique_email_phone
-- Purpose:
--   Allow duplicate names (multiple friends can share the same display name),
--   while enforcing that email and phone number are strictly unique per user.

DROP INDEX IF EXISTS "Friend_userId_name_ci_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Friend_userId_email_ci_key"
  ON "public"."Friend" ("userId", LOWER(TRIM("email")))
  WHERE "deletedAt" IS NULL AND "email" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Friend_userId_phone_key"
  ON "public"."Friend" ("userId", TRIM("phone"))
  WHERE "deletedAt" IS NULL AND "phone" IS NOT NULL;
