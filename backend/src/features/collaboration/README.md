# collaboration module

> Unified invitation/notification system across Group Expenses, To-Do Lists, and Goals.

**Base path:** `/api/v1/collaborations`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/collaborations` | auth, validated | `CollaborationController.listCollaborations` |
| GET | `/collaborations/pending` | auth | `CollaborationController.listPendingCollaborations` |
| GET | `/collaborations/:id` | auth, validated | `CollaborationController.getCollaboration` |
| DELETE | `/collaborations/:id` | auth, validated | `CollaborationController.revokeCollaboration` |

## Files

- `collaboration.controller.ts`
- `collaboration.routes.ts`
- `collaboration.validation.ts`
- `invitation.service.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · ✅ service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `collaboration/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
