# Quality · Database Testing

Schema, migration, and data-integrity checks.

- **Schema source of truth:** `backend/prisma/schema.prisma`
- **Generated schema catalog:** [`../../database/docs/SCHEMA.md`](../../database/docs/SCHEMA.md) (built by `scripts/gen-catalogs.mjs`)
- **Raw SQL:** [`../../database/`](../../database/README.md)

## Planned coverage
- Migration up/down idempotency (`prisma migrate`)
- Foreign-key + ownership constraint tests
- Money-column precision (no floats; integer minor units)
- Row-level security parity with app-layer ownership checks

> Add executable DB tests under `backend/tests/integration/` (they need the Prisma client + a test DB) and index them here.

