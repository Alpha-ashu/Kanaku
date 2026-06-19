# POST /api/v1/categorize

> Auto-categorize transaction

ML model predicts category from description, merchant, amount.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/categorize` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Categorization |
| **operationId** | `categorizeTransaction` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Input

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | yes | e.g. `Swiggy order #12345` |
| `merchant` | string | no |  |
| `amount` | number | no |  |

## Responses

### 200 — Prediction

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "category": "Food & Dining",
    "subcategory": "Restaurant",
    "confidence": 0.94
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
