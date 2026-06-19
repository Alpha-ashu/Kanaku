# GET /api/v1/transactions

> List transactions

Supports accountId, date range, category, pagination.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/transactions` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Transactions |
| **operationId** | `getTransactions` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `accountId` | string | no |  (format: uuid) |
| `startDate` | string | no | YYYY-MM-DD or ISO 8601 (e.g. `2026-01-01`) |
| `endDate` | string | no |  (e.g. `2026-12-31`) |
| `category` | string | no |  (e.g. `Food & Dining`) |
| `page` | integer | no |  (min 1; default `1`) |
| `limit` | integer | no |  (min 1; max 200; default `20`) |

## Request

_No request body._

## Responses

### 200 — Transactions

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "type": "expense",
        "amount": 450,
        "category": "Food & Dining",
        "date": "2026-06-09"
      }
    ],
    "totalCount": 142,
    "page": 1,
    "limit": 20
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
