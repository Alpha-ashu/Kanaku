-- Booking reschedule negotiation.
--
-- `rescheduleBooking` could move a booking into status 'reschedule', but no
-- endpoint let the client accept or decline the proposed time, so the booking
-- dead-ended: cancel was the only way out. These columns carry the proposal's
-- author, its message (previously overloaded onto `rejectionReason`), a round
-- counter so the two sides cannot volley indefinitely, and an expiry so an
-- unanswered proposal releases the slot.
--
-- Additive and backward compatible: every column is nullable or defaulted, so
-- existing rows read as "no proposal outstanding" and an older API instance
-- running against this schema is unaffected.
ALTER TABLE "public"."BookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."BookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleProposedBy" TEXT;
ALTER TABLE "public"."BookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleMessage" TEXT;
ALTER TABLE "public"."BookingRequest" ADD COLUMN IF NOT EXISTS "rescheduleExpiresAt" TIMESTAMP(3);

-- Expiry sweeps scan for outstanding proposals; without this they seq-scan the
-- whole table. Partial, because only 'reschedule' rows are ever swept.
CREATE INDEX IF NOT EXISTS "BookingRequest_reschedule_expiry_idx"
  ON "public"."BookingRequest" ("rescheduleExpiresAt")
  WHERE "status" = 'reschedule';
