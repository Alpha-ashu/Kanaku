# GET /api/v1/settings

> Get user preferences

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/settings` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Settings |
| **operationId** | `getSettings` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Settings

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "currency": "INR",
    "theme": "light",
    "notificationsEnabled": true,
    "autoSync": true
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
