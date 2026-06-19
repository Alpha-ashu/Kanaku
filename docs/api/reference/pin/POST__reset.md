# POST /api/v1/pin/reset

> Force reset PIN (Admin only)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/pin/reset` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | PIN |
| **operationId** | `pinAdminReset` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Target

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string | yes | format: uuid |

## Responses

### 200 — PIN reset

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
