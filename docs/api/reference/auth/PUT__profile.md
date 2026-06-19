# PUT /api/v1/auth/profile

> Update profile

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | `/api/v1/auth/profile` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Auth |
| **operationId** | `authUpdateProfile` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Profile fields

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | no |  |
| `lastName` | string | no |  |
| `country` | string | no |  |
| `city` | string | no |  |
| `phone` | string | no |  |
| `occupation` | string | no |  |
| `monthlyIncome` | number | no |  |
| `avatarStyle` | string | no |  |
| `avatarSeed` | string | no |  |

## Responses

### 200 — Profile updated

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
