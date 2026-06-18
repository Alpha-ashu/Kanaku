# sync module

> Offline-first client↔server data synchronization.

**Base path:** `/api/v1/sync`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/sync/pull` | auth | `NextFunction` |
| POST | `/sync/push` | auth | `NextFunction` |
| POST | `/sync/register-device` | auth | `NextFunction` |
| GET | `/sync/devices` | auth | `NextFunction` |
| POST | `/sync/deactivate-device` | auth | `NextFunction` |

## Files

- `README.md`
- `sync.routes.ts`
- `sync.service.ts`

## Canonical-shape conformance

— controller · ✅ service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `sync/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
