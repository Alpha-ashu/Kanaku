# receipts module

> Receipt OCR scanning and parsing (lazy-loaded).

**Base path:** `/api/v1/receipts`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/receipts/start` | auth | `—` |
| GET | `/receipts/status/:jobId` | auth | `—` |
| POST | `/receipts/scan` | auth | `—` |

## Files

- `README.md`
- `receipt.controller.ts`
- `receipt.routes.ts`
- `receipt.validation.ts`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `receipts/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
