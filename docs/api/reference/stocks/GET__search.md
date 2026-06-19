# GET /api/v1/stocks/search

> Search stocks (public)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/stocks/search` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Stocks |
| **operationId** | `searchStocks` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `q` | string | yes | Company or ticker (minLen 1) |

## Request

_No request body._

## Responses

### 200 — Results

Schema: `Envelope`

```json
{
  "success": true,
  "data": [
    {
      "symbol": "TATAMOTORS",
      "name": "Tata Motors Ltd",
      "exchange": "NSE",
      "type": "equity"
    }
  ]
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
