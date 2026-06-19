# POST /api/v1/admin/ai/run/features

> Refresh AI features (Admin only)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/admin/ai/run/features` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Admin |
| **operationId** | `adminAIRunFeatures` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Config

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `userIds` | array<string> | no |  |

## Responses

### 200 — Refreshed

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
