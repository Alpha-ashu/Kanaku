# POST /api/v1/bookings

> Create booking request

Status starts as `pending`. Requires `bookAdvisor` feature.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/bookings` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Bookings |
| **operationId** | `createBooking` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Booking

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `advisorId` | string | yes | format: uuid |
| `sessionType` | string | yes | enum: `video`, `audio`, `chat`, `in-person`; e.g. `video` |
| `description` | string | no | maxLen 500 |
| `proposedDate` | string | yes | format: date; e.g. `2026-07-01` |
| `proposedTime` | string | yes | e.g. `18:00` |
| `duration` | integer | yes | min 15; e.g. `60` |
| `amount` | number | yes | min 0; e.g. `1499` |

## Responses

### 201 — Booking created

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "pending",
    "amount": 1499
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
