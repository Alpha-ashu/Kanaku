# investments module

> Investment holdings (stocks, MFs, etc.) and valuation.

**Base path:** `/api/v1/investments`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/investments` | auth | `InvestmentController.getInvestments` |
| GET | `/investments/:id` | auth, validated | `InvestmentController.getInvestment` |
| POST | `/investments` | auth, validated | `InvestmentController.createInvestment` |
| PUT | `/investments/:id` | auth, validated | `InvestmentController.updateInvestment` |
| DELETE | `/investments/:id` | auth, validated | `InvestmentController.deleteInvestment` |

## Files

- `investment.controller.ts`
- `investment.routes.ts`
- `investment.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `investments/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
