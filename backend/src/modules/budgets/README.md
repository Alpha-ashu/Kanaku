# budgets module

> Budgets and budget-alert thresholds.

**Base path:** `/api/v1/budgets`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/budgets` | auth, validated | `BudgetController.getBudgets` |
| POST | `/budgets` | auth, validated | `BudgetController.createBudget` |
| GET | `/budgets/:id` | auth, validated | `BudgetController.getBudget` |
| PUT | `/budgets/:id` | auth, validated | `BudgetController.updateBudget` |
| DELETE | `/budgets/:id` | auth, validated | `BudgetController.deleteBudget` |
| POST | `/budgets/:id/recalculate` | auth, validated | `BudgetController.recalculateBudgetSpent` |

## Files

- `budget.controller.ts`
- `budget.routes.ts`
- `budget.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `budgets/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
