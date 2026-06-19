# GET /api/v1/pin/expiring-soon

> Check if PIN expiring soon

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/pin/expiring-soon` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | PIN |
| **operationId** | `pinExpiringSoon` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Expiry info

Schema: `Envelope`

```json
{
  "success": true,
  "isExpiringSoon": true,
  "daysRemaining": 5
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
