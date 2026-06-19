# GET /api/v1/sessions/{id}/messages

> Get chat messages

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/sessions/{id}/messages` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Sessions |
| **operationId** | `getSessionMessages` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Session UUID (format: uuid; e.g. `550e8400-e29b-41d4-a716-446655440000`) |

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `page` | integer | no |  (default `1`) |
| `limit` | integer | no |  (default `50`) |

## Request

_No request body._

## Responses

### 200 — Messages

Schema: `Envelope`

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "senderId": "uuid",
      "message": "Hello!",
      "timestamp": "2026-07-01T18:05:00Z"
    }
  ]
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
