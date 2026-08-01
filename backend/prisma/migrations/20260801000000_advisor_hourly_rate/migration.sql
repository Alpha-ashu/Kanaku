-- Advisor consultation rate.
--
-- The booking screen has always displayed a per-hour fee and the BookingRequest
-- row has always stored an `amount`, but there was nowhere to record what an
-- advisor actually charges — the client was rendering hardcoded demo prices and
-- sending them back as the booking amount. The rate now lives with the rest of
-- the advisor's profile data, is captured at application time, and is nullable
-- so existing approved advisors stay valid until they set one.
ALTER TABLE "public"."AdvisorApplication" ADD COLUMN IF NOT EXISTS "hourlyRate" DECIMAL(10,2);
