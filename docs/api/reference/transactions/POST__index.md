# POST /api/v1/transactions

> Create transaction

Creates income, expense, or transfer. Updates account balance atomically. Dedup via `dedupHash`.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/transactions` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Transactions |
| **operationId** | `createTransaction` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Transaction

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `accountId` | string | yes | format: uuid |
| `type` | string | yes | enum: `income`, `expense`, `transfer`; e.g. `expense` |
| `amount` | number | yes | max 999999999; e.g. `450` |
| `category` | string | yes | maxLen 80; e.g. `Food & Dining` |
| `subcategory` | string | no | maxLen 80 |
| `description` | string | no | maxLen 200; e.g. `Lunch at cafe` |
| `merchant` | string | no | maxLen 120; e.g. `Swiggy` |
| `date` | string | yes | e.g. `2026-06-09` |
| `tags` | array<string> | no |  |
| `transferToAccountId` | string | no | format: uuid |
| `transferType` | string | no | enum: `self-transfer`, `other-transfer` |
| `expenseMode` | string | no | enum: `individual`, `group`, `loan` |
| `groupExpenseId` | string | no | format: uuid |
| `dedupHash` | string | no |  |

## Responses

### 201 — Created

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "expense",
    "amount": 450,
    "category": "Food & Dining"
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
