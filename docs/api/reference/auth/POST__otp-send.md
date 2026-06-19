# POST /api/v1/auth/otp/send

> Send OTP

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/auth/otp/send` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Auth |
| **operationId** | `authSendOtp` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

OTP request

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | no | enum: `email`, `phone` |

## Responses

### 200 — OTP sent

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
