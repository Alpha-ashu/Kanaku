# POST /api/v1/admin/features/toggle

> Toggle feature flag (Admin only)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/admin/features/toggle` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Admin |
| **operationId** | `adminToggleFeature` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Toggle

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `feature` | string | yes |  |
| `enabled` | boolean | yes |  |
| `userTier` | string | no |  |

## Responses

### 200 — Updated

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
