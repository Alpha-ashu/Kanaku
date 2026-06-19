# POST /api/v1/notifications/send

> Send notification (Admin only)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/notifications/send` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Notifications |
| **operationId** | `adminSendNotification` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Notification

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string | yes | format: uuid |
| `type` | string | yes |  |
| `title` | string | yes |  |
| `body` | string | yes |  |
| `data` | object | no |  |

## Responses

### 201 — Sent

Schema: `Envelope`

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
