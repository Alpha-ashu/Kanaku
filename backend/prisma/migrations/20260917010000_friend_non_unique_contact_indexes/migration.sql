-- Migration: friend_non_unique_contact_indexes
-- Purpose:
--   Allow contacts to share emails/phones (e.g. household members, colleagues, personal numbers across profiles),
--   replacing unique constraints on Friend(userId, email) and Friend(userId, phone) with non-unique btree indexes.

DROP INDEX IF EXISTS "public"."Friend_userId_email_ci_key";
DROP INDEX IF EXISTS "public"."Friend_userId_phone_key";

CREATE INDEX IF NOT EXISTS "Friend_userId_email_idx"
  ON "public"."Friend" ("userId", LOWER(TRIM("email")))
  WHERE "deletedAt" IS NULL AND "email" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Friend_userId_phone_idx"
  ON "public"."Friend" ("userId", TRIM("phone"))
  WHERE "deletedAt" IS NULL AND "phone" IS NOT NULL;
