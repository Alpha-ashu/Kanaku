# PUT /api/v1/advisors/availability/status

> Toggle availability (Advisor only)

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | `/api/v1/advisors/availability/status` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Advisors |
| **operationId** | `setAdvisorAvailabilityStatus` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Status

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `isActive` | boolean | yes |  |

## Responses

### 200 — Updated

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
