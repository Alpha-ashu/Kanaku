# POST /api/v1/advisors/availability

> Set availability slot (Advisor only)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/advisors/availability` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Advisors |
| **operationId** | `setAdvisorAvailability` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Slot

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `dayOfWeek` | integer | yes | min 0; max 6; e.g. `1` |
| `startTime` | string | yes | e.g. `09:00` |
| `endTime` | string | yes | e.g. `17:00` |

## Responses

### 201 — Set

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
