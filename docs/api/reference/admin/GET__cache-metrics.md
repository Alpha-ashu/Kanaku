# GET /api/v1/admin/cache/metrics

> Cache metrics (Admin only)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/admin/cache/metrics` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Admin |
| **operationId** | `adminGetCacheMetrics` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `prefix` | string | no |   |

## Request

_No request body._

## Responses

### 200 — Metrics

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "hits": 12400,
    "misses": 1200,
    "hitRate": 0.91,
    "keys": 450
  }
}
```

### 400 — Validation error

Schema: `ApiError`

### 401 — Unauthorized

Schema: `ApiError`

### 403 — Forbidden

Schema: `ApiError`

### 404 — Not found

Schema: `ApiError`

### 429 — Rate limited

Schema: `ApiError`

### 500 — Server error

Schema: `ApiError`

---
_Generated from the OpenAPI spec (`backend/src/docs/api-docs.ts`) by `scripts/gen-endpoint-docs.mjs`. Do not edit by hand — re-run `npm run docs:endpoints`._
