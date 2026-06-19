# PUT /api/v1/accounts/{id}

> Update account

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | `/api/v1/accounts/{id}` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Accounts |
| **operationId** | `updateAccount` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Account UUID (format: uuid; e.g. `550e8400-e29b-41d4-a716-446655440000`) |

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Update

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no |  |
| `type` | string | no |  |
| `provider` | string | no |  |
| `country` | string | no |  |
| `currency` | string | no | minLen 3; maxLen 3 |

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
