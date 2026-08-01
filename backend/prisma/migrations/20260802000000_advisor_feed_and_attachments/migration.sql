-- Advisor feed (posts + likes + follows) and consultation chat attachments.
--
-- The booking module shipped with a Discover feed, a Following tab and a
-- paperclip button that had no tables behind them: posts and follows were
-- component state, and the attach button only raised a toast. These are the
-- tables those surfaces always implied.

-- Files shared inside a consultation thread. The path is a private storage
-- object key; clients receive a short-lived signed URL, never the raw path.
ALTER TABLE "public"."ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentPath" TEXT;
ALTER TABLE "public"."ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
ALTER TABLE "public"."ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentType" TEXT;
ALTER TABLE "public"."ChatMessage" ADD COLUMN IF NOT EXISTS "attachmentSize" INTEGER;

CREATE TABLE IF NOT EXISTS "public"."AdvisorPost" (
    "id"        TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "category"  TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "content"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "AdvisorPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."AdvisorPostLike" (
    "id"        TEXT NOT NULL,
    "postId"    TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdvisorPostLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."AdvisorFollow" (
    "id"         TEXT NOT NULL,
    "advisorId"  TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdvisorFollow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdvisorPost_advisorId_idx" ON "public"."AdvisorPost"("advisorId");
CREATE INDEX IF NOT EXISTS "AdvisorPost_createdAt_idx" ON "public"."AdvisorPost"("createdAt");
CREATE INDEX IF NOT EXISTS "AdvisorPostLike_userId_idx" ON "public"."AdvisorPostLike"("userId");
CREATE INDEX IF NOT EXISTS "AdvisorFollow_followerId_idx" ON "public"."AdvisorFollow"("followerId");

-- One like per user per post, one follow edge per pair. Enforced in the
-- database so a double-tap or a retried request cannot inflate the counts.
CREATE UNIQUE INDEX IF NOT EXISTS "AdvisorPostLike_postId_userId_key" ON "public"."AdvisorPostLike"("postId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdvisorFollow_advisorId_followerId_key" ON "public"."AdvisorFollow"("advisorId", "followerId");

DO $$ BEGIN
    ALTER TABLE "public"."AdvisorPost"
        ADD CONSTRAINT "AdvisorPost_advisorId_fkey" FOREIGN KEY ("advisorId")
        REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."AdvisorPostLike"
        ADD CONSTRAINT "AdvisorPostLike_postId_fkey" FOREIGN KEY ("postId")
        REFERENCES "public"."AdvisorPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."AdvisorPostLike"
        ADD CONSTRAINT "AdvisorPostLike_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."AdvisorFollow"
        ADD CONSTRAINT "AdvisorFollow_advisorId_fkey" FOREIGN KEY ("advisorId")
        REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "public"."AdvisorFollow"
        ADD CONSTRAINT "AdvisorFollow_followerId_fkey" FOREIGN KEY ("followerId")
        REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
