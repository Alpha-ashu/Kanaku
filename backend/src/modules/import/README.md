# import module

> Statement/CSV import and smart expense ingestion.

**Base path:** `/api/v1/import`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/import/upload` | auth, feature:accounts.importStatement | `uploadImport` |
| POST | `/import/confirm` | auth, feature:accounts.importStatement, validated | `confirmImport` |
| GET | `/import/:sessionId` | auth, feature:accounts.importStatement | `getImportSession` |

## Files

- `import.controller.ts`
- `import.routes.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `import/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
