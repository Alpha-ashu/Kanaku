# auth module

> Authentication — login, registration, token issuance, device + OTP services (public).

**Base path:** `/api/v1/auth`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/auth/check-email` | public | `checkEmailAvailability` |
| POST | `/auth/register` | public | `register` |
| POST | `/auth/login/challenge` | public | `loginChallenge` |
| POST | `/auth/login` | public | `login` |
| POST | `/auth/refresh` | public | `refreshToken` |
| GET | `/auth/profile` | auth | `getProfile` |
| PUT | `/auth/profile` | auth | `updateProfile` |
| POST | `/auth/otp/send` | auth | `sendOtp` |
| POST | `/auth/otp/verify` | auth | `verifyOtpEndpoint` |
| GET | `/auth/devices` | auth | `getDevices` |
| DELETE | `/auth/devices/:deviceId` | auth | `revokeDevice` |
| DELETE | `/auth/account` | auth | `deleteAccount` |

## Files

- `auth.controller.ts`
- `auth.routes.ts`
- `auth.service.ts`
- `auth.types.ts`
- `device.service.ts`
- `otp.service.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · ✅ service · — repository · — validation · ✅ routes · ✅ types

---
_Auto-generated from `auth/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
