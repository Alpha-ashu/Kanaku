# GET /api/v1/ai/health-score

> Financial health score (0-100)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/ai/health-score` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | AI |
| **operationId** | `getFinancialHealthScore` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Score

Schema: `Envelope`

```json
{
  "score": 72,
  "breakdown": {
    "savings": 80,
    "debt": 60,
    "spending": 70,
    "goals": 78
  },
  "trend": "improving"
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
