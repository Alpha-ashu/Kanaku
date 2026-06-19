# POST /api/v1/accounts

> Create account

Duplicate name+type per user rejected.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/accounts` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Accounts |
| **operationId** | `createAccount` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Account

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | maxLen 120; e.g. `HDFC Savings` |
| `type` | string | yes | enum: `bank`, `wallet`, `cash`, `credit`, `investment`, `other`; e.g. `bank` |
| `provider` | string | no |  |
| `country` | string | no |  |
| `balance` | number | no | min 0; e.g. `25000` |
| `currency` | string | no | minLen 3; maxLen 3; e.g. `INR` |
| `clientRequestId` | string | no |  |

## Responses

### 201 — Created

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "HDFC Savings",
    "type": "bank",
    "balance": 25000
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
