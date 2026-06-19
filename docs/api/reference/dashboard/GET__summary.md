# GET /api/v1/dashboard/summary

> Financial dashboard summary

Net worth, income/expense totals, top categories, recent transactions, goals progress.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/dashboard/summary` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Dashboard |
| **operationId** | `getDashboardSummary` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Summary

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "netWorth": 125000,
    "totalIncome": 80000,
    "totalExpenses": 45000,
    "savingsRate": 43.75,
    "topCategories": [
      {
        "category": "Food & Dining",
        "amount": 8500
      }
    ],
    "goalsProgress": [
      {
        "id": "uuid",
        "name": "Emergency Fund",
        "progress": 25
      }
    ]
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
