# GET /api/v1/stocks/markets

> Get market indices (public)

NIFTY 50, SENSEX, global indices.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/stocks/markets` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Stocks |
| **operationId** | `getMarkets` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Markets

Schema: `Envelope`

```json
{
  "success": true,
  "data": [
    {
      "index": "NIFTY 50",
      "value": 24500,
      "change": 125,
      "changePercent": 0.51
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
