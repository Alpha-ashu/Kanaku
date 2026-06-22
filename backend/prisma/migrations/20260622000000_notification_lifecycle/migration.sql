-- Notification delivery lifecycle (additive, non-destructive).
-- Adds queue-backed lifecycle fields alongside the existing deliveryStatus/channels
-- JSON so PostgreSQL remains the single source of truth for delivery.

-- 'sent' is the resting default: an in-app notification IS delivered once the row
-- exists. Only the dispatcher sets 'pending' (when it enqueues email/push), so
-- direct app-only creates are never stuck pending.
ALTER TABLE "public"."Notification"
  ADD COLUMN IF NOT EXISTS "status"       TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS "attempts"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "nextRetryAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill sentAt for existing rows (all default to 'sent' via the ADD COLUMN
-- above). Per-channel truth (email/push) remains in deliveryStatus.
UPDATE "public"."Notification"
  SET "sentAt" = "createdAt"
  WHERE "sentAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Notification_status_nextRetryAt_idx"
  ON "public"."Notification" ("status", "nextRetryAt");
