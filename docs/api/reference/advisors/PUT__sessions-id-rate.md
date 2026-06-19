# PUT /api/v1/advisors/sessions/{id}/rate

> Rate session (Client)

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | `/api/v1/advisors/sessions/{id}/rate` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Advisors |
| **operationId** | `rateAdvisorSession` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Session UUID (format: uuid; e.g. `550e8400-e29b-41d4-a716-446655440000`) |

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Rating

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `rating` | number | yes | min 1; max 5; e.g. `4.5` |
| `feedback` | string | no | maxLen 1000 |

## Responses

### 200 — Rated

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
