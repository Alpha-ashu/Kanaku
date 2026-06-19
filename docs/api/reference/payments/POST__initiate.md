# POST /api/v1/payments/initiate

> Initiate Stripe checkout

Returns Stripe checkout URL.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/payments/initiate` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Payments |
| **operationId** | `initiatePayment` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Initiate

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `bookingId` | string | yes | format: uuid |
| `successUrl` | string | no | format: uri |
| `cancelUrl` | string | no | format: uri |

## Responses

### 201 — Checkout created

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/..."
  }
}
```

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
