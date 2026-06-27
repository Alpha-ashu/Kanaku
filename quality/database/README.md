# Quality · Database Testing

Schema, migration, and data-integrity checks.

- **Schema source of truth:** `backend/prisma/schema.prisma`
- **Migrations:** [`../../backend/prisma/migrations/`](../../backend/prisma/migrations/)
- **Generated schema catalog:** [`../../platform/database/docs/SCHEMA.md`](../../platform/database/docs/SCHEMA.md)
- **Raw SQL / seed:** [`../../platform/database/`](../../platform/database/README.md) (`init.sql`, `ai_schema.sql`, `supabase_schema.sql`)

## Planned coverage
- Migration up/down idempotency (`prisma migrate`)
- Foreign-key + ownership constraint tests
- Money-column precision (no floats; integer minor units)
- Row-level security parity with app-layer ownership checks

> Add executable DB tests under `quality/backend/tests/integration/` (they need the Prisma client + a test DB) and index them here. Reset the local test DB with `npm --prefix backend run db:test:reset` ([`../diagnostics/backend/test-db.mjs`](../diagnostics/backend/test-db.mjs)).

