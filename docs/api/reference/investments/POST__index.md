# POST /api/v1/investments

> Create investment

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/investments` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Investments |
| **operationId** | `createInvestment` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Investment

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | enum: `stocks`, `mutualFunds`, `gold`, `fd`, `rd`, `crypto`, `bonds`, `other`; e.g. `stocks` |
| `name` | string | yes | maxLen 120; e.g. `TATA MOTORS` |
| `symbol` | string | no | maxLen 20; e.g. `TATAMOTORS` |
| `units` | number | no | min 0; e.g. `50` |
| `purchasePrice` | number | no | min 0; e.g. `800` |
| `currentPrice` | number | no | min 0 |
| `purchaseDate` | string | no | format: date |
| `accountId` | string | no | format: uuid |
| `maturityDate` | string | no | format: date |
| `interestRate` | number | no | min 0 |
| `notes` | string | no | maxLen 300 |
| `clientRequestId` | string | no |  |

## Responses

### 201 — Created

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
