# recurring module

> Recurring transactions and schedules.

**Base path:** `/api/v1/recurring`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/recurring` | auth, validated | `RecurringController.getRecurringTransactions` |
| POST | `/recurring` | auth, validated | `RecurringController.createRecurringTransaction` |
| GET | `/recurring/:id` | auth, validated | `RecurringController.getRecurringTransaction` |
| PUT | `/recurring/:id` | auth, validated | `RecurringController.updateRecurringTransaction` |
| DELETE | `/recurring/:id` | auth, validated | `RecurringController.deleteRecurringTransaction` |
| PATCH | `/recurring/:id/toggle` | auth, validated | `RecurringController.toggleRecurringStatus` |

## Files

- `README.md`
- `recurring.controller.ts`
- `recurring.routes.ts`
- `recurring.validation.ts`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `recurring/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
