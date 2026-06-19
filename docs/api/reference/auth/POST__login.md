# POST /api/v1/auth/login

> Login with email + password

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/auth/login` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Auth |
| **operationId** | `authLogin` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Credentials

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | format: email; e.g. `asha@example.com` |
| `password` | string | yes | e.g. `StrongPass123!` |
| `challengeCode` | string | no |  |

## Responses

### 200 — Login ok

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "asha@example.com",
      "role": "user"
    }
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
