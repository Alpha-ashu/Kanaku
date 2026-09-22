-- Add verifiedAt column to User for 90-day re-verification lifecycle
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
