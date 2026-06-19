# POST /api/v1/sync/register-device

> Register sync device (idempotent)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/sync/register-device` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Sync |
| **operationId** | `syncRegisterDevice` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Registration

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `deviceId` | string | yes | e.g. `device_abc123` |
| `deviceName` | string | no |  |
| `deviceType` | string | no |  |
| `platform` | string | no | enum: `ios`, `android`, `web` |
| `appVersion` | string | no |  |

## Responses

### 200 — Registered

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
