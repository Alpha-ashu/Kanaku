# Third-Party Integrations

This project currently spans a few external systems. Keep their ownership boundaries explicit so auth, storage, and AI logic do not drift.

## Supabase

Used for:

- hosted Postgres/Auth/Storage concerns
- RLS policies and SQL migrations
- some edge-function style helpers

Repo locations:

- [`supabase/`](../../supabase/README.md)
- [`database/supabase_schema.sql`](../../database/supabase_schema.sql)

## Prisma + PostgreSQL

Used for:

- backend runtime data access
- API-facing schema ownership
- migrations tied to the Express backend

Repo locations:

- [`backend/prisma/`](../../backend/prisma/)
- [`backend/src/db/`](../../backend/src/db/)

## OCR / Receipt extraction

Used for:

- receipt scanning
- local fallback OCR
- bill parsing and tax extraction

Repo locations:

- [`frontend/src/services/receiptScannerService.ts`](../../frontend/src/services/receiptScannerService.ts)
- [`frontend/src/services/cloudReceiptScanService.ts`](../../frontend/src/services/cloudReceiptScanService.ts)
- [`frontend/src/services/ocrService.ts`](../../frontend/src/services/ocrService.ts)

## AI parsing

Used for:

- receipt interpretation
- import normalization support
- voice parsing helpers

Repo locations:

- [`backend/src/modules/ai/`](../../backend/src/modules/ai/)
- [`frontend/src/services/`](../../frontend/src/services/)

## Market data / external finance APIs

Used for:

- stocks and market views

Repo locations:

- [`api/stocks.ts`](../../api/stocks.ts)
- frontend services that consume market data

## Storage / file access

Used for:

- receipt and bill attachments
- signed URL access for protected files

Repo locations:

- [`backend/src/utils/storage.ts`](../../backend/src/utils/storage.ts)
- receipt/document services in `frontend/src/services/`

## Integration rules

- Keep authz decisions on the backend.
- Keep service-role credentials off the client.
- When adding a new vendor, document env vars, runtime owner, failure mode, and test plan here.
