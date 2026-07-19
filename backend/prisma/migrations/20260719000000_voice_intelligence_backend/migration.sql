-- Voice Intelligence tables — backend-authoritative shape.
--
-- These tables were first introduced client-side by supabase/migrations/015
-- with UUID user columns and an FK to auth.users. The backend API is the
-- writer of record (POST /voice/process*, /voice/learn) and backend user ids
-- are TEXT (public."User".id), including non-UUID ids in test environments.
-- This migration converges every environment to the backend-owned shape:
--   * creates the tables when absent (fresh/test databases)
--   * where the Supabase variant pre-exists, drops the auth.users FK and
--     widens user columns to TEXT (data preserved — uuid casts to text)
--   * rewrites RLS policies with an explicit ::text cast so client-side
--     Supabase reads keep working after the type change.

-- ── voice_transcripts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."voice_transcripts" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"       TEXT NOT NULL,
    "memo_id"       TEXT,
    "original_text" TEXT NOT NULL,
    "cleaned_text"  TEXT,
    "actions_count" INTEGER NOT NULL DEFAULT 0,
    "processed_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "voice_transcripts_pkey" PRIMARY KEY ("id")
);

-- ── user_voice_learning ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."user_voice_learning" (
    "id"                 TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"            TEXT NOT NULL,
    "original_text"      TEXT NOT NULL,
    "corrected_type"     VARCHAR(30),
    "corrected_category" VARCHAR(100),
    "corrected_amount"   DECIMAL(15,2),
    "applied_count"      INTEGER NOT NULL DEFAULT 1,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "user_voice_learning_pkey" PRIMARY KEY ("id")
);

-- ── Converge pre-existing Supabase-created variants (uuid → text) ────────────
DO $$
BEGIN
  -- voice_transcripts.user_id / memo_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'voice_transcripts'
      AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE "public"."voice_transcripts" DROP CONSTRAINT IF EXISTS "voice_transcripts_user_id_fkey";
    ALTER TABLE "public"."voice_transcripts" DROP CONSTRAINT IF EXISTS "voice_transcripts_memo_id_fkey";
    ALTER TABLE "public"."voice_transcripts" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
    ALTER TABLE "public"."voice_transcripts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE "public"."voice_transcripts" ALTER COLUMN "user_id" TYPE TEXT USING "user_id"::text;
    ALTER TABLE "public"."voice_transcripts" ALTER COLUMN "memo_id" TYPE TEXT USING "memo_id"::text;
  END IF;

  -- user_voice_learning.user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_voice_learning'
      AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE "public"."user_voice_learning" DROP CONSTRAINT IF EXISTS "user_voice_learning_user_id_fkey";
    ALTER TABLE "public"."user_voice_learning" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
    ALTER TABLE "public"."user_voice_learning" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE "public"."user_voice_learning" ALTER COLUMN "user_id" TYPE TEXT USING "user_id"::text;
  END IF;
END $$;

-- ── Indexes / unique constraints (idempotent) ────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_voice_transcripts_user"
  ON "public"."voice_transcripts" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_user_voice_learning_user"
  ON "public"."user_voice_learning" ("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_voice_learning_user_id_original_text_key'
  ) THEN
    -- The Supabase variant created this as UNIQUE(user_id, original_text) with
    -- an auto-generated name; normalise to the Prisma-expected constraint name.
    BEGIN
      ALTER TABLE "public"."user_voice_learning"
        ADD CONSTRAINT "user_voice_learning_user_id_original_text_key"
        UNIQUE ("user_id", "original_text");
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      NULL; -- an equivalent unique index already covers the pair
    END;
  END IF;
END $$;

-- ── RLS: keep client-side reads working after the uuid→text change ───────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voice_transcripts') THEN
    ALTER TABLE "public"."voice_transcripts" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "voice_transcripts_user_only" ON "public"."voice_transcripts";
    CREATE POLICY "voice_transcripts_user_only" ON "public"."voice_transcripts"
      FOR ALL USING (auth.uid()::text = "user_id");
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_voice_learning') THEN
    ALTER TABLE "public"."user_voice_learning" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "user_voice_learning_user_only" ON "public"."user_voice_learning";
    CREATE POLICY "user_voice_learning_user_only" ON "public"."user_voice_learning"
      FOR ALL USING (auth.uid()::text = "user_id");
  END IF;
EXCEPTION WHEN undefined_function OR invalid_schema_name THEN
  -- auth.uid() only exists on Supabase-hosted databases; plain Postgres
  -- (CI service container, local dev, staging test DBs) has no auth schema
  -- and no RLS consumers — skip policies there.
  NULL;
END $$;
