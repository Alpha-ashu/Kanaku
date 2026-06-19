# POST /api/v1/sync/pull

> Pull delta changes from cloud

Returns records updated after `lastSyncedAt`. Used by Dexie offline-first sync engine.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/sync/pull` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Sync |
| **operationId** | `syncPull` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Pull params

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `deviceId` | string | yes | e.g. `device_abc123` |
| `lastSyncedAt` | string | no | format: date-time; e.g. `2026-06-08T10:00:00.000Z` |
| `entityTypes` | array<string> | no |  |

## Responses

### 200 — Delta data

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "accounts": [],
    "transactions": [
      {
        "id": "uuid",
        "updatedAt": "2026-06-09T10:00:00Z"
      }
    ],
    "syncedAt": "2026-06-09T10:01:00Z"
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
