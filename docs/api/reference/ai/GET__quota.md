# GET /api/v1/ai/quota

> AI usage quota

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/ai/quota` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | AI |
| **operationId** | `getAIQuota` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Quota

Schema: `Envelope`

```json
{
  "used": 45,
  "limit": 200,
  "resetAt": "2026-07-01T00:00:00Z",
  "plan": "standard"
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
