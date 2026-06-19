# POST /api/v1/learn

> Record categorization correction

Improves future accuracy.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/learn` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Categorization |
| **operationId** | `learnCategorization` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Correction

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | yes |  |
| `merchant` | string | no |  |
| `correctCategory` | string | yes | e.g. `Food & Dining` |
| `correctSubcategory` | string | no |  |

## Responses

### 200 — Recorded

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
