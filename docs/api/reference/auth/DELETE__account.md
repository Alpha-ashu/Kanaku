# DELETE /api/v1/auth/account

> Delete own account (3/min rate limit)

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | `/api/v1/auth/account` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Auth |
| **operationId** | `authDeleteAccount` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Confirmation

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `confirmPhrase` | string | no | e.g. `DELETE MY ACCOUNT` |

## Responses

### 200 — Deleted

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
