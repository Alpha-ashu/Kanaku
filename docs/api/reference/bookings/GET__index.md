# GET /api/v1/bookings

> List bookings

Returns bookings for the authenticated user as client or advisor.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/bookings` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Bookings |
| **operationId** | `getBookings` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `status` | string | no |  (enum: `pending`, `accepted`, `rejected`, `cancelled`, `completed`) |
| `role` | string | no |  (enum: `client`, `advisor`) |

## Request

_No request body._

## Responses

### 200 — Bookings

Schema: `Envelope`

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sessionType": "video",
      "status": "pending",
      "proposedDate": "2026-07-01"
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
