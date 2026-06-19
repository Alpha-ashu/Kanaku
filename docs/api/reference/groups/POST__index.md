# POST /api/v1/groups

> Create group expense

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/groups` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Groups |
| **operationId** | `createGroup` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Group

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | maxLen 120; e.g. `Goa Trip` |
| `description` | string | no |  |
| `totalAmount` | number | no | min 0 |
| `category` | string | no |  |
| `accountId` | string | no | format: uuid |
| `splitType` | string | no | enum: `equal`, `custom`, `percentage` |
| `members` | array<object> | no |  |

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
