# loans module

> Loans and EMI tracking.

**Base path:** `/api/v1/loans`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/loans` | auth | `LoanController.getLoans` |
| POST | `/loans` | auth, validated | `LoanController.createLoan` |
| GET | `/loans/:id` | auth, validated | `LoanController.getLoan` |
| PUT | `/loans/:id` | auth, validated | `LoanController.updateLoan` |
| DELETE | `/loans/:id` | auth, validated | `LoanController.deleteLoan` |
| POST | `/loans/:id/payment` | auth, validated | `LoanController.addLoanPayment` |

## Files

- `loan.controller.ts`
- `loan.routes.ts`
- `loan.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `loans/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
