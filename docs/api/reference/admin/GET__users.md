# GET /api/v1/admin/users

> List all users (Admin only)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/admin/users` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Admin |
| **operationId** | `adminGetAllUsers` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `page` | integer | no |  (default `1`) |
| `limit` | integer | no |  (default `20`) |
| `role` | string | no |  (enum: `user`, `advisor`, `manager`, `admin`) |
| `status` | string | no |  (enum: `active`, `suspended`) |
| `search` | string | no |   |

## Request

_No request body._

## Responses

### 200 — Users

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "users": [],
    "total": 0,
    "page": 1
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
