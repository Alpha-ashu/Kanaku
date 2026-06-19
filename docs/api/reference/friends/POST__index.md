# POST /api/v1/friends

> Add contact

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/friends` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Friends |
| **operationId** | `createFriend` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Friend

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | maxLen 120; e.g. `Raj Kumar` |
| `phone` | string | no | maxLen 20 |
| `email` | string | no | format: email |
| `upiId` | string | no | maxLen 60 |
| `linkedUserId` | string | no | format: uuid |

## Responses

### 201 — Added

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
