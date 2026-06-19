# GET /api/v1/notifications

> List notifications

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/notifications` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Notifications |
| **operationId** | `getNotifications` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `page` | integer | no |  (default `1`) |
| `limit` | integer | no |  (max 100; default `20`) |
| `unreadOnly` | boolean | no |  (default `false`) |

## Request

_No request body._

## Responses

### 200 — Notifications

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "type": "PAYMENT_RECEIVED",
        "title": "Payment received",
        "isRead": false
      }
    ],
    "unreadCount": 3
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
