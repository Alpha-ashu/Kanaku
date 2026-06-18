# bills module

> Secure bill/document uploads with file-type validation (lazy-loaded).

**Base path:** `/api/v1/bills`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/bills` | auth | `BillsController.getBills` |
| GET | `/bills/:id` | auth | `BillsController.getBill` |
| POST | `/bills` | auth | `—` |
| DELETE | `/bills/:id` | auth | `BillsController.deleteBill` |

## Files

- `bills.controller.ts`
- `bills.routes.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `bills/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
