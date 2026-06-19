# POST /api/v1/goals

> Create savings goal

Duplicate names per user rejected.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/goals` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Goals |
| **operationId** | `createGoal` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Goal

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | maxLen 120; e.g. `Emergency Fund` |
| `targetAmount` | number | yes | e.g. `100000` |
| `targetDate` | string | yes | format: date; e.g. `2027-01-01` |
| `category` | string | no | maxLen 80 |
| `isGroupGoal` | boolean | no | default `false` |
| `clientRequestId` | string | no |  |

## Responses

### 201 — Created

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Emergency Fund",
    "targetAmount": 100000,
    "currentAmount": 0
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
