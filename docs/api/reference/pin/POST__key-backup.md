# POST /api/v1/pin/key-backup

> Save key backup (requires X-Security-Token)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/pin/key-backup` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | PIN |
| **operationId** | `pinSaveBackup` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Backup

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `backup` | string | yes |  |

## Responses

### 200 — Saved

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
