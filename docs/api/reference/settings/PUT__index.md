# PUT /api/v1/settings

> Update user preferences

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | `/api/v1/settings` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Settings |
| **operationId** | `updateSettings` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Settings

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `currency` | string | no | minLen 3; maxLen 3; e.g. `INR` |
| `theme` | string | no | enum: `light`, `dark`, `system` |
| `language` | string | no |  |
| `notificationsEnabled` | boolean | no |  |
| `budgetAlerts` | boolean | no |  |
| `biometricAuth` | boolean | no |  |
| `autoSync` | boolean | no |  |
| `monthlyBudget` | number | no | min 0 |
| `savingsTarget` | number | no | min 0 |
| `fiscalMonthStart` | integer | no | min 1; max 28 |

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
