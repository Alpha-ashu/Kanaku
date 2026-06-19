# POST /api/v1/pin/verify-security

> Issue security token (biometric)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/pin/verify-security` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | PIN |
| **operationId** | `pinVerifySecurity` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Biometric

**Body schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

## Responses

### 200 — Security token

Schema: `Envelope`

```json
{
  "success": true,
  "securityToken": "short-lived"
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
