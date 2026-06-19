# POST /api/v1/loans/{id}/payment

> Record EMI / loan payment

Atomically creates payment and reduces outstanding balance. Marks completed at 0.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/loans/{id}/payment` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Loans |
| **operationId** | `addLoanPayment` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Loan UUID (format: uuid; e.g. `550e8400-e29b-41d4-a716-446655440000`) |

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Payment

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | number | yes | e.g. `4800` |
| `accountId` | string | no | format: uuid |
| `notes` | string | no | maxLen 200; e.g. `June EMI` |

## Responses

### 201 — Payment recorded

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "loanId": "uuid",
    "amount": 4800,
    "date": "2026-06-09T00:00:00Z"
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
