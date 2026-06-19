# GET /api/v1/investments

> List investments

Stocks, mutual funds, gold, FD/RD, crypto.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/investments` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Investments |
| **operationId** | `getInvestments` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Investments

Schema: `Envelope`

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "stocks",
      "name": "TATA MOTORS",
      "units": 50,
      "purchasePrice": 800,
      "currentPrice": 950
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
