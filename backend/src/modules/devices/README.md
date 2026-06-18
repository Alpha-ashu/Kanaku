# devices module

> Device registration and management for multi-device sync.

**Base path:** `/api/v1/devices`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/devices` | auth | `DeviceController.registerDevice` |
| GET | `/devices` | auth | `DeviceController.getDevices` |
| GET | `/devices/:deviceId` | auth | `DeviceController.getDevice` |
| POST | `/devices/:deviceId/sync` | auth | `DeviceController.updateSync` |
| PUT | `/devices/:deviceId/tokens` | auth | `DeviceController.updateNotificationTokens` |
| POST | `/devices/:deviceId/deactivate` | auth | `DeviceController.deactivateDevice` |
| DELETE | `/devices/:deviceId` | auth | `DeviceController.deleteDevice` |

## Files

- `device.controller.ts`
- `device.routes.ts`
- `device.service.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · ✅ service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `devices/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
