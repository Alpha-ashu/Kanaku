# dashboard module

> Cross-feature dashboard aggregation.

**Base path:** `/api/v1/dashboard`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/dashboard/summary` | auth | `getDashboardSummary` |
| GET | `/dashboard/cashflow` | auth | `getCashflow` |

## Files

- `dashboard.controller.ts`
- `dashboard.routes.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `dashboard/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
