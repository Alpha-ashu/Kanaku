# Docs Â· API

Human-readable API documentation. Pairs with the machine-readable contracts.

| Resource | Location | Notes |
|---|---|---|
| **Machine-readable contracts** | [`./contracts/`](./contracts/README.md) | 238 endpoints, one JSON each, generated + idempotent |
| **Endpoint index** | [`../../docs/api/contracts/api-index.json`](../../docs/api/contracts/api-index.json) | full catalog |
| **Generated API catalog** | [`../../quality/api/API_CATALOG.md`](../../quality/api/API_CATALOG.md) | by `scripts/gen-catalogs.mjs` |
| **Per-feature API mapping** | [`../architecture/FEATURE_MAP.md`](../architecture/FEATURE_MAP.md) | which endpoints belong to which feature |
| **REST reference** | [`../API_REFERENCE.md`](../API_REFERENCE.md) | narrative reference |

All endpoints are versioned under **`/api/v1`**. To regenerate contracts after a route change: `pwsh -File scripts/generate-api-docs.ps1`.

