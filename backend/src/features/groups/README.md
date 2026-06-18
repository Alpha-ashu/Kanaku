# groups module

> Group expenses and shared-expense settlement.

**Base path:** `/api/v1/groups`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/groups` | auth | `GroupController.getGroups` |
| POST | `/groups/repair-all-members` | auth, admin | `GroupController.repairAllGroupMembers` |
| POST | `/groups` | auth, validated | `GroupController.createGroup` |
| GET | `/groups/:id` | auth, validated | `GroupController.getGroup` |
| PUT | `/groups/:id` | auth, validated | `GroupController.updateGroup` |
| POST | `/groups/:id/repair-members` | auth, validated | `GroupController.repairGroupMembers` |
| DELETE | `/groups/:id` | auth, validated | `GroupController.deleteGroup` |

## Files

- `group.controller.ts`
- `group.routes.ts`
- `group.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `groups/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
