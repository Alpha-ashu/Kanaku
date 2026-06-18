# Reason: legacy frontend experiments archived

- **Date archived:** 2026-06-19
- **Archived by:** enterprise restructure (root de-clutter)
- **Original location:** `resources/archive/frontend-experiments/`

## What this was
Backup/experimental copies of the Investments page (`Investments.new.tsx`, `Investments.old.tsx`, `Investments.old2.tsx`, `Investments.older.tsx`) plus a `patch.diff`. These were already an in-repo archive of superseded frontend work; the root-level `resources/` folder was cluttering the tree.

## Why archived
- Not imported by any code (`git grep "Investments.old"` → 0 functional references).
- The live Investments feature lives under `frontend/src/`.
- Consolidating all retired material under `archive-unused/` per the governance in [`../../README.md`](../../README.md).

## Restore command
```powershell
git mv archive-unused/frontend/legacy-experiments resources/archive/frontend-experiments
```

## Safe-to-delete after
2026-12-19 (6-month cooling-off per `archive-unused/README.md`).

