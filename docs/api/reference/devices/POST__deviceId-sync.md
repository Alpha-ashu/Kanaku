# POST /api/v1/devices/{deviceId}/sync

> Update device sync timestamp

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/devices/{deviceId}/sync` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Devices |
| **operationId** | `updateDeviceSync` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `deviceId` | string | yes | Device ID  |

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Sync

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `lastSyncAt` | string | no | format: date-time |

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
