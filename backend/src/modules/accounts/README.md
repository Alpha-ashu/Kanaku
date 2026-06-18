# accounts module

> User bank/cash/credit accounts — CRUD with feature-gated create/edit/delete.

**Base path:** `/api/v1/accounts`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/accounts` | auth | `AccountController.getAccounts` |
| POST | `/accounts` | auth, feature:accounts.createAccount, validated | `AccountController.createAccount` |
| GET | `/accounts/:id` | auth, validated | `AccountController.getAccount` |
| PUT | `/accounts/:id` | auth, feature:accounts.editAccount, validated | `AccountController.updateAccount` |
| DELETE | `/accounts/:id` | auth, feature:accounts.deleteAccount, validated | `AccountController.deleteAccount` |

## Files

- `account.controller.ts`
- `account.repository.ts`
- `account.routes.ts`
- `account.service.ts`
- `account.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · ✅ service · ✅ repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `accounts/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
