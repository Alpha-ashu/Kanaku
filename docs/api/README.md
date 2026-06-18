# Docs · API

Human-readable API documentation. Pairs with the machine-readable contracts.

| Resource | Location | Notes |
|---|---|---|
| **Machine-readable contracts** | [`../../api-docs/`](../../api-docs/README.md) | 238 endpoints, one JSON each, generated + idempotent |
| **Endpoint index** | [`../../api-docs/api-index.json`](../../api-docs/api-index.json) | full catalog |
| **Generated API catalog** | [`../../api-testing/API_CATALOG.md`](../../api-testing/API_CATALOG.md) | by `scripts/gen-catalogs.mjs` |
| **Per-feature API mapping** | [`../architecture/FEATURE_MAP.md`](../architecture/FEATURE_MAP.md) | which endpoints belong to which feature |
| **REST reference** | [`../API_REFERENCE.md`](../API_REFERENCE.md) | narrative reference |

All endpoints are versioned under **`/api/v1`**. To regenerate contracts after a route change: `pwsh -File scripts/generate-api-docs.ps1`.

