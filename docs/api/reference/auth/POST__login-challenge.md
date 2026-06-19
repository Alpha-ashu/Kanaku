# POST /api/v1/auth/login/challenge

> Request challenge code (2-phase login)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/auth/login/challenge` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Auth |
| **operationId** | `authChallenge` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Challenge request

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | format: email |
| `password` | string | yes |  |

## Responses

### 200 — Challenge issued

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "code": "abc123"
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
