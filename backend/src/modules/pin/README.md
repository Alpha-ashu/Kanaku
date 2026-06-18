# pin module

> App PIN setup and verification.

**Base path:** `/api/v1/pin`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/pin/create` | auth, validated | `NextFunction` |
| POST | `/pin/verify` | auth, validated | `NextFunction` |
| POST | `/pin/verify-security` | auth, validated | `NextFunction` |
| POST | `/pin/update` | auth, validated | `NextFunction` |
| GET | `/pin/status` | auth | `NextFunction` |
| GET | `/pin/key-backup` | auth | `NextFunction` |
| POST | `/pin/key-backup` | auth, validated | `NextFunction` |
| DELETE | `/pin/key-backup` | auth | `NextFunction` |
| GET | `/pin/expiring-soon` | auth | `NextFunction` |
| POST | `/pin/reset` | auth, validated | `NextFunction` |
| POST | `/pin/self-reset` | auth | `NextFunction` |

## Files

- `pin.routes.ts`
- `pin.service.ts`
- `pin.validation.ts`
- `README.md`

## Canonical-shape conformance

— controller · ✅ service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `pin/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
