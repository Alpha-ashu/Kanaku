# sessions module

> Advisor↔client session lifecycle.

**Base path:** `/api/v1/sessions`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/sessions/:id` | auth, validated | `SessionController.getSession` |
| POST | `/sessions/:id/messages` | auth, validated | `SessionController.sendMessage` |
| GET | `/sessions/:id/messages` | auth, validated | `SessionController.getMessages` |
| POST | `/sessions/:id/start` | auth, validated | `SessionController.startSession` |
| POST | `/sessions/:id/complete` | auth, validated | `SessionController.completeSession` |
| POST | `/sessions/:id/cancel` | auth, validated | `SessionController.cancelSession` |

## Files

- `README.md`
- `session.controller.ts`
- `session.routes.ts`
- `session.validation.ts`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `sessions/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
