-- India-first currency defaults: new Account / Payment / UserSettings rows
-- default to INR instead of USD. Existing rows are untouched — their currency
-- was either chosen by the user or already backfilled from their country.
ALTER TABLE "public"."Account" ALTER COLUMN "currency" SET DEFAULT 'INR';
ALTER TABLE "public"."Payment" ALTER COLUMN "currency" SET DEFAULT 'INR';
ALTER TABLE "public"."UserSettings" ALTER COLUMN "currency" SET DEFAULT 'INR';
