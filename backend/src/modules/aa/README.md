# aa module

> RBI Account Aggregator (Setu) integration — consent flows and financial-data fetch.

**Base path:** `/api/v1/aa`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/aa/consent` | auth, validated | `NextFunction` |
| GET | `/aa/consent/status/:consentHandle` | auth, validated | `NextFunction` |
| GET | `/aa/consent/artifact/:consentId` | auth, validated | `NextFunction` |
| POST | `/aa/data/session` | auth, validated | `NextFunction` |
| GET | `/aa/data/fetch/:sessionId` | auth, validated | `NextFunction` |
| GET | `/aa/consents` | auth | `NextFunction` |
| POST | `/aa/consent/revoke/:consentId` | auth, validated | `NextFunction` |
| GET | `/aa/financial-summary` | auth | `NextFunction` |
| POST | `/aa/notification` | auth, validated | `NextFunction` |

## Files

- `aa.routes.ts`
- `aa.service.ts`
- `aa.types.ts`
- `aa.validation.ts`
- `README.md`

## Canonical-shape conformance

— controller · ✅ service · — repository · ✅ validation · ✅ routes · ✅ types

---
_Auto-generated from `aa/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
