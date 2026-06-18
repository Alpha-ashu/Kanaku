# tax module

> Tax estimation and calculators.

**Base path:** `/api/v1/tax`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/tax` | auth, validated | `TaxController.getTaxCalculations` |
| POST | `/tax` | auth, validated | `TaxController.createTaxCalculation` |
| GET | `/tax/:id` | auth, validated | `TaxController.getTaxCalculation` |
| PUT | `/tax/:id` | auth, validated | `TaxController.updateTaxCalculation` |
| DELETE | `/tax/:id` | auth, validated | `TaxController.deleteTaxCalculation` |

## Files

- `README.md`
- `tax.controller.ts`
- `tax.routes.ts`
- `tax.validation.ts`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `tax/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
