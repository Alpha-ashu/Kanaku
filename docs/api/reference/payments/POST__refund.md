# POST /api/v1/payments/refund

> Refund payment (Stripe)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/payments/refund` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Payments |
| **operationId** | `refundPayment` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Refund

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `paymentId` | string | yes | format: uuid |
| `reason` | string | no | maxLen 300 |
| `amount` | number | no |  |

## Responses

### 200 — Refund initiated

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
