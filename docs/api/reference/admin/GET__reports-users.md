# GET /api/v1/admin/reports/users

> Users report (Admin only)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/admin/reports/users` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Admin |
| **operationId** | `adminGetUsersReport` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `startDate` | string | no |  (format: date) |
| `endDate` | string | no |  (format: date) |

## Request

_No request body._

## Responses

### 200 — Report

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
