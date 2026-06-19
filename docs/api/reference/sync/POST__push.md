# POST /api/v1/sync/push

> Push local changes to cloud

Upserts or deletes local device changes in the backend.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/sync/push` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Sync |
| **operationId** | `syncPush` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Push payload

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `deviceId` | string | yes | e.g. `device_abc123` |
| `entities` | array<object> | yes |  |

## Responses

### 200 — Push result

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "processed": 5,
    "failed": 0,
    "conflicts": []
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
