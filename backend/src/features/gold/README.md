# gold module

> Gold/precious-metal holdings and live rates.

**Base path:** `/api/v1/gold`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| GET | `/gold` | auth, validated | `GoldController.getGoldAssets` |
| POST | `/gold` | auth, validated | `GoldController.createGoldAsset` |
| GET | `/gold/:id` | auth, validated | `GoldController.getGoldAsset` |
| PUT | `/gold/:id` | auth, validated | `GoldController.updateGoldAsset` |
| DELETE | `/gold/:id` | auth, validated | `GoldController.deleteGoldAsset` |

## Files

- `gold.controller.ts`
- `gold.routes.ts`
- `gold.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `gold/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
