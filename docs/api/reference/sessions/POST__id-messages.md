# POST /api/v1/sessions/{id}/messages

> Send chat message

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/sessions/{id}/messages` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Sessions |
| **operationId** | `sendSessionMessage` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Session UUID (format: uuid; e.g. `550e8400-e29b-41d4-a716-446655440000`) |

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Message

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | yes | minLen 1; maxLen 2000; e.g. `Review my portfolio.` |

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
