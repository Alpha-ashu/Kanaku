# Docs Â· API

Human-readable API documentation. Pairs with the machine-readable contracts.

| Resource | Location | Notes |
|---|---|---|
| **Endpoint reference (human-readable)** | [`./reference/`](./reference/README.md) | one Markdown file per endpoint with request/response + examples; from the OpenAPI spec via `npm run docs:endpoints` |
| **Coverage report** | [`./reference/COVERAGE.md`](./reference/COVERAGE.md) | spec vs live Express routes — lists any undocumented endpoints |
| **Machine-readable contracts** | [`./contracts/`](./contracts/README.md) | 238 endpoints, one JSON each, generated + idempotent |
| **Endpoint index** | [`../../docs/api/contracts/api-index.json`](../../docs/api/contracts/api-index.json) | full catalog |
| **Generated API catalog** | [`../../quality/api/API_CATALOG.md`](../../quality/api/API_CATALOG.md) | by `scripts/gen-catalogs.mjs` |
| **Per-feature API mapping** | [`../architecture/FEATURE_MAP.md`](../architecture/FEATURE_MAP.md) | which endpoints belong to which feature |
| **REST reference** | [`../API_REFERENCE.md`](../API_REFERENCE.md) | narrative reference |

All endpoints are versioned under **`/api/v1`**. To regenerate the human-readable reference after a route/spec change: `npm run docs:endpoints`. To regenerate the JSON contracts: `pwsh -File scripts/generate-api-docs.ps1`.

