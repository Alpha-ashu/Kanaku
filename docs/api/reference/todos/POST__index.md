# POST /api/v1/todos

> Create todo (legacy)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/todos` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Todos |
| **operationId** | `createTodo` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Todo

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | maxLen 200; e.g. `Pay electricity bill` |
| `dueDate` | string | no | format: date |
| `priority` | string | no | enum: `low`, `medium`, `high` |

## Responses

### 201 — Created

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
