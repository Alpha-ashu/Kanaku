# POST /api/v1/devices

> Register or update device

Registers device for push notifications and sync.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/devices` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Devices |
| **operationId** | `registerDevice` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Device

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `deviceId` | string | yes | e.g. `device_abc123` |
| `deviceName` | string | no |  |
| `deviceType` | string | no |  |
| `osType` | string | no | enum: `ios`, `android`, `web` |
| `osVersion` | string | no |  |
| `fcmToken` | string | no |  |
| `apnsToken` | string | no |  |

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
