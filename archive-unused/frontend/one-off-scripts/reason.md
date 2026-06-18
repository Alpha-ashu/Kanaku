# Reason: frontend one-off scripts archived

- **Date archived:** 2026-06-19
- **Archived by:** Phase 6 sweep (ARCHITECTURE_RESTRUCTURE.md)
- **Original location:** `frontend/`

## Files

| File | What it was | Why archived |
|---|---|---|
| `remove_emojis.cjs` | One-off codemod to strip emojis from source files | Single-use task, completed long ago. Not referenced anywhere. |
| `remove_emojis.js` | Earlier variant of the same codemod | Superseded by `.cjs` version, then both became dead. |
| `remove_emojis2.cjs` | Second iteration of the same codemod | Same as above. |
| `test-parser.js` | Ad-hoc parser smoke script | Not in `package.json`, no imports, no references. Replaced by Vitest unit tests under `frontend/src/`. |
| `test-all.mjs` | Ad-hoc "run everything" script | Not invoked by CI or `package.json`. Real test runner is `vitest`. |
| `test-diag.mjs` | Ad-hoc diagnostics script | Not referenced anywhere. |
| `test-extract.cjs` | Ad-hoc extraction smoke script | Not referenced anywhere. |

## Verification

```text
$ git grep -F "remove_emojis"      → 0 results
$ git grep -F "test-parser"        → 0 results
$ git grep -F "test-all"           → 0 results
$ git grep -F "test-diag"          → 0 results
$ git grep -F "test-extract"       → 0 results
```

None appear in `frontend/package.json` `scripts` block.
None are imported by Vite, Vitest, or any TS/JS module.

## Restore command

```powershell
git mv archive-unused/frontend/one-off-scripts/<file> frontend/<file>
```

## Safe-to-delete after

2026-12-19 (6-month cooling-off per `archive-unused/README.md` policy).

