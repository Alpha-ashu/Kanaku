# settings module

> User preferences and app settings.

**Base path:** `/api/v1/settings`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/settings` | auth | `SettingsController.getSettings` |
| PUT | `/settings` | auth, validated | `SettingsController.updateSettings` |

## Files

- `README.md`
- `settings.controller.ts`
- `settings.routes.ts`
- `settings.validation.ts`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `settings/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
