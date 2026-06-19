# POST /api/v1/voice/learn

> Record voice correction

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/voice/learn` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Voice |
| **operationId** | `voiceLearn` |

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
| `originalSegment` | string | yes | e.g. `fifty rupees food` |
| `correctedType` | string | no | enum: `income`, `expense`, `transfer` |
| `correctedCategory` | string | no |  |
| `correctedAmount` | number | no |  |

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
