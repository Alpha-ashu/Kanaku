# GET /api/v1/ai/recommendations

> AI recommendations (budget, goals, investments)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/ai/recommendations` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | AI |
| **operationId** | `getAIRecommendations` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Recommendations

Schema: `Envelope`

```json
{
  "recommendations": [
    {
      "title": "Increase SIP by ₹2,000",
      "category": "investments",
      "priority": 8
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
