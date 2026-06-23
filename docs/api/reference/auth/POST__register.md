# POST /api/v1/auth/register

> Register new user

Creates account. JWT returned in Authorization response header.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/auth/register` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Auth |
| **operationId** | `authRegister` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Registration

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | maxLen 120; e.g. `Asha Sharma` |
| `email` | string | yes | format: email; e.g. `asha@example.com` |
| `password` | string | yes | minLen 8; e.g. `StrongPass123!` |

## Responses

### 201 — Registered

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "asha@example.com",
      "name": "Asha Sharma",
      "role": "user"
    },
    "expiresAt": 1782126929095
  }
}
```

**Token delivery (platform-aware, see Project Overview §E.1):** access token in the
`Authorization` response header; refresh token via the `kanaku_rt` HttpOnly cookie
(web). **Native** clients (`X-Client-Platform: native` or Capacitor Origin)
additionally receive `data.accessToken` and `data.refreshToken` in the body for
device storage, since they can't read cross-origin headers/cookies.

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
