# transactions module

> Core income/expense transactions — CRUD with feature gates.

**Base path:** `/api/v1/transactions`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/transactions` | auth | `—` |
| POST | `/transactions` | auth | `—` |
| GET | `/transactions/:id` | auth | `—` |
| PUT | `/transactions/:id` | auth | `—` |
| DELETE | `/transactions/:id` | auth | `—` |
| GET | `/transactions/account/:accountId` | auth | `—` |

## Files

- `README.md`
- `transaction.controller.ts`
- `transaction.repository.ts`
- `transaction.routes.ts`
- `transaction.service.ts`
- `transaction.validation.ts`

## Canonical-shape conformance

✅ controller · ✅ service · ✅ repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `transactions/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
