# GET /api/v1/admin/features

> Get feature flags (any authenticated user)

Used by frontend to gate UI features.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/admin/features` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Admin |
| **operationId** | `adminGetFeatureFlags` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Flags

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "accounts": true,
    "transactions": true,
    "aiInsights": true,
    "voiceAssistant": false
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
