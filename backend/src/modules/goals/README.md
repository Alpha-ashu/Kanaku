# goals module

> Savings goals — CRUD and contribution tracking.

**Base path:** `/api/v1/goals`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/goals` | auth | `GoalController.getGoals` |
| POST | `/goals` | auth, validated | `GoalController.createGoal` |
| GET | `/goals/:id` | auth, validated | `GoalController.getGoal` |
| PUT | `/goals/:id` | auth, validated | `GoalController.updateGoal` |
| DELETE | `/goals/:id` | auth, validated | `GoalController.deleteGoal` |
| GET | `/goals/:id/members` | auth, validated | `GoalController.getGoalMembers` |
| POST | `/goals/:id/members` | auth, validated | `GoalController.addGoalMember` |
| DELETE | `/goals/:id/members/:memberId` | auth | `GoalController.removeGoalMember` |

## Files

- `goal.controller.ts`
- `goal.routes.ts`
- `goal.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `goals/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
