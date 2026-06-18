# categorization module

> Transaction auto-categorization and learning (also mounts /learn).

**Base path:** `/api/v1/categorize`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/categorize` | auth, validated | `CategorizationController.categorize` |

## Files

- `categorization.controller.ts`
- `categorization.engine.ts`
- `categorization.routes.ts`
- `categorization.validation.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · — types

---
_Auto-generated from `categorization/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
