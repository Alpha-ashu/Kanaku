# otp module

> RBI-compliant OTP generation and verification.

**Base path:** `/api/v1/otp`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/otp/send` | auth, validated | `NextFunction` |
| POST | `/otp/verify` | auth, validated | `NextFunction` |

## Files

- `otp.routes.ts`
- `otp.service.ts`
- `otp.types.ts`
- `otp.validation.ts`
- `README.md`

## Canonical-shape conformance

— controller · ✅ service · — repository · ✅ validation · ✅ routes · ✅ types

---
_Auto-generated from `otp/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
