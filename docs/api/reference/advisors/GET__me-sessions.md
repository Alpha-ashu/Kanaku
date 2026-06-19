# GET /api/v1/advisors/me/sessions

> My sessions (Advisor only)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/advisors/me/sessions` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Advisors |
| **operationId** | `getAdvisorSessions` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Sessions

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
