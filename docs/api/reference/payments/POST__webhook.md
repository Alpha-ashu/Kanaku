# POST /api/v1/payments/webhook

> Stripe webhook (public, no JWT)

Stripe signature verified internally.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/payments/webhook` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Payments |
| **operationId** | `paymentsWebhook` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

**Body schema:**

```json
{
  "type": "object"
}
```

## Responses

### 200 — Processed

### 400 — Invalid signature

---
_Generated from the OpenAPI spec (`backend/src/docs/api-docs.ts`) by `scripts/gen-endpoint-docs.mjs`. Do not edit by hand — re-run `npm run docs:endpoints`._
