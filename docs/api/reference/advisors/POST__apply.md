# POST /api/v1/advisors/apply

> Apply to become advisor

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/advisors/apply` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Advisors |
| **operationId** | `applyAsAdvisor` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Application

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `bio` | string | yes | maxLen 2000 |
| `specializations` | array<string> | yes |  |
| `qualifications` | array<string> | yes |  |
| `yearsExperience` | integer | no | min 0 |
| `languages` | array<string> | no |  |
| `hourlyRate` | number | no | min 0 |

## Responses

### 201 — Application submitted

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
