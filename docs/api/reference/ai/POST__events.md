# POST /api/v1/ai/events

> Capture AI event

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/ai/events` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | AI |
| **operationId** | `captureAIEvent` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Event

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `eventType` | string | yes | e.g. `transaction_categorized` |
| `payload` | object | no |  |

## Responses

### 200 — Captured

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
