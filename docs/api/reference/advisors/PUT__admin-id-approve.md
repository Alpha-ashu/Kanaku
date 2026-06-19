# PUT /api/v1/advisors/admin/{id}/approve

> Approve advisor (Admin/Manager)

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | `/api/v1/advisors/admin/{id}/approve` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Advisors |
| **operationId** | `approveAdvisorApplication` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Advisor UUID (format: uuid; e.g. `550e8400-e29b-41d4-a716-446655440000`) |

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Approved

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
