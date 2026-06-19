# GET /api/v1/auth/profile

> Get current user profile

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/auth/profile` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Auth |
| **operationId** | `authGetProfile` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `includePrivate` | boolean | no | Include email/role  |

## Request

_No request body._

## Responses

### 200 — Profile

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "asha@example.com",
    "firstName": "Asha",
    "lastName": "Sharma",
    "role": "user",
    "country": "India"
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
