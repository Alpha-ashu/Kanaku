# GET /api/v1/advisors

> List approved advisors (public)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/advisors` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Advisors |
| **operationId** | `listAdvisors` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `specialization` | string | no |   |
| `language` | string | no |   |
| `minRating` | number | no |   |

## Request

_No request body._

## Responses

### 200 — Advisors

Schema: `Envelope`

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Priya Mehta",
      "specialization": [
        "tax"
      ],
      "rating": 4.8,
      "hourlyRate": 1500
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
