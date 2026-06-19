# POST /api/v1/pin/create

> Create PIN

Weak PINs (sequential, repeated, known) rejected with INVALID_PIN.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/pin/create` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | PIN |
| **operationId** | `pinCreate` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

PIN hash

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `pin` | string | yes |  |

## Responses

### 200 — PIN created

Schema: `Envelope`

### 400 — Weak PIN (INVALID_PIN)

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
