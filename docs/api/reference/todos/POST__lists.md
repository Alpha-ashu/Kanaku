# POST /api/v1/todos/lists

> Create todo list

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/todos/lists` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Todos |
| **operationId** | `createTodoList` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

List

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | maxLen 200; e.g. `Monthly Bills` |
| `color` | string | no |  |
| `icon` | string | no |  |

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
