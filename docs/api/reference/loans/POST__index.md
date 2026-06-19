# POST /api/v1/loans

> Create loan

Sets outstandingBalance = principalAmount on creation.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/loans` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Loans |
| **operationId** | `createLoan` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Loan

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | enum: `borrowed`, `lent`; e.g. `borrowed` |
| `name` | string | yes | maxLen 120; e.g. `Home Loan` |
| `principalAmount` | number | yes | e.g. `500000` |
| `interestRate` | number | no | min 0; e.g. `8.5` |
| `emiAmount` | number | no | min 0; e.g. `4800` |
| `dueDate` | string | no | format: date; e.g. `2026-07-05` |
| `frequency` | string | no | enum: `monthly`, `quarterly`, `yearly`, `weekly`, `one-time` |
| `contactPerson` | string | no | maxLen 120 |
| `clientRequestId` | string | no |  |

## Responses

### 201 — Created

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "borrowed",
    "principalAmount": 500000,
    "outstandingBalance": 500000,
    "status": "active",
    "payments": []
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
