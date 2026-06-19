# DELETE /api/v1/auth/devices/{deviceId}

> Revoke device

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | `/api/v1/auth/devices/{deviceId}` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Auth |
| **operationId** | `authRevokeDevice` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `deviceId` | string | yes | Device ID  |

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Device revoked

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
