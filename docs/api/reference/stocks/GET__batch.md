# GET /api/v1/stocks/batch

> Batch stock quotes (public)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/stocks/batch` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Stocks |
| **operationId** | `getBatchStockQuotes` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `symbols` | string | yes | Comma-separated tickers  |

## Request

_No request body._

## Responses

### 200 — Batch quotes

Schema: `Envelope`

```json
{
  "TATAMOTORS": {
    "lastPrice": 950,
    "change": 15
  },
  "INFY": {
    "lastPrice": 1650,
    "change": -5
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
