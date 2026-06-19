# POST /api/v1/pin/verify

> Verify PIN

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/pin/verify` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | PIN |
| **operationId** | `pinVerify` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

PIN check

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `pin` | string | yes |  |
| `deviceId` | string | no |  |

## Responses

### 200 — Correct

Schema: `Envelope`

### 400 — Validation error

Schema: `ApiError`

### 401 — Wrong PIN

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
