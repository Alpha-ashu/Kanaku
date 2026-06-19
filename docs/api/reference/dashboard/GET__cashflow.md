# GET /api/v1/dashboard/cashflow

> Monthly cashflow breakdown

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/dashboard/cashflow` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Dashboard |
| **operationId** | `getDashboardCashflow` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `months` | integer | no |  (min 1; max 24; default `6`) |

## Request

_No request body._

## Responses

### 200 — Cashflow

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "months": [
      {
        "month": "Jun 2026",
        "income": 80000,
        "expenses": 45000,
        "savings": 35000
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
