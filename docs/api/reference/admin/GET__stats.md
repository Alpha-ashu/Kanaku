# GET /api/v1/admin/stats

> Platform statistics (Admin only)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/admin/stats` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Admin |
| **operationId** | `adminGetStats` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Stats

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "totalUsers": 5420,
    "activeUsers": 3100,
    "totalTransactions": 285000,
    "mrrINR": 450000
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
