# Tools

Developer tooling and one-off utilities.

> **Note:** build/codegen automation lives in [`../scripts/`](../scripts/) and **stays there** because `package.json` references it directly (`node scripts/dev-full.mjs`, `node scripts/gen-catalogs.mjs`, `scripts/generate-api-docs.*`, `scripts/rename-modules-to-features.ps1`, `scripts/migrate-to-apps-layout.ps1`). Moving `scripts/` would break those npm scripts.

Use `tools/` for **ad-hoc, non-pipeline** utilities that are not referenced by `package.json` or CI (debug helpers, local data inspectors, etc.). Anything that becomes part of the build/codegen pipeline graduates to `scripts/`.

| Category | Where |
|---|---|
| Build / codegen / dev pipeline | [`../scripts/`](../scripts/) |
| Migration codemods | `../scripts/*.ps1` (e.g. `migrate-to-apps-layout.ps1`) |
| Ad-hoc dev tools | here |
| Retired/experimental | [`../archive-unused/`](../archive-unused/README.md) |

