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
    "accessToken": "<jwt>",
    "expiresAt": 1782126929095,
    "user": {
      "id": "uuid",
      "email": "asha@example.com",
      "role": "user"
    }
  }
}
```

**Token delivery (platform-aware, see Project Overview §E.1):**
- `accessToken` — in the body **and** the `Authorization` response header (15 min).
- **Refresh token** — **web:** `Set-Cookie: kanaku_rt=… HttpOnly; Secure; SameSite=Strict`
  only (never in the body/JS). **Native** (request sends `X-Client-Platform: native`
  or a Capacitor Origin): also returned as `data.refreshToken` for device storage.
  The legacy `x-refresh-token` response header is no longer sent.

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
