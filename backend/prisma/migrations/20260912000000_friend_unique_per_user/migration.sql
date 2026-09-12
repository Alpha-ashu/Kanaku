-- Migration: friend_unique_per_user
-- Purpose:
--   Make it impossible for two Friend rows to exist for the same user and name.
--
-- Why a database constraint and not an application check:
--   createFriend did `findFirst({ name, mode: 'insensitive' })` and then inserted.
--   That is a check-then-insert race: two concurrent requests both miss the check
--   and both insert. It was observed in practice — two "Prijith" rows created 3ms
--   apart for the same user. Only a unique index can serialise this; application
--   code cannot, no matter how careful the check.
--
-- Shape:
--   * Case-insensitive: LOWER(TRIM(name)) so "Arun" and "arun " collide.
--   * Scoped per user, so two different users may both have a friend named Arun.
--   * Partial (deletedAt IS NULL) so a soft-deleted friend does not block
--     re-adding that person later.
--
-- Additive only: creates an index, modifies no rows. Duplicates must already be
-- merged or this will fail — which is the intended safety behaviour.

CREATE UNIQUE INDEX IF NOT EXISTS "Friend_userId_name_ci_key"
  ON "public"."Friend" ("userId", LOWER(TRIM("name")))
  WHERE "deletedAt" IS NULL;
