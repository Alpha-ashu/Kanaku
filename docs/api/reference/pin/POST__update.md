# POST /api/v1/pin/update

> Change PIN (requires X-Security-Token header)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/pin/update` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | PIN |
| **operationId** | `pinUpdate` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

PIN change

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `currentPin` | string | yes |  |
| `newPin` | string | yes |  |

## Responses

### 200 — PIN updated

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
