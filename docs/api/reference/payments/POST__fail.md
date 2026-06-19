# POST /api/v1/payments/fail

> Record payment failure

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/payments/fail` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Payments |
| **operationId** | `failPayment` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Failure

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `paymentIntentId` | string | yes |  |
| `reason` | string | no |  |

## Responses

### 200 — Recorded

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
