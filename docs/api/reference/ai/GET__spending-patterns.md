# GET /api/v1/ai/spending-patterns

> Spending pattern analysis

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/ai/spending-patterns` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | AI |
| **operationId** | `getAISpendingPatterns` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Patterns

Schema: `Envelope`

```json
{
  "insights": [
    {
      "type": "weekend_spike",
      "message": "You spend 40% more on weekends"
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
