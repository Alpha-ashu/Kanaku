# GET /api/v1/stocks/stock

> Get stock quote (public)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/stocks/stock` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Stocks |
| **operationId** | `getStockQuote` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | yes |   |
| `exchange` | string | no |   |

## Request

_No request body._

## Responses

### 200 — Quote

Schema: `Envelope`

```json
{
  "symbol": "TATAMOTORS",
  "lastPrice": 950.5,
  "change": 15.3,
  "changePercent": 1.63,
  "volume": 2500000
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
