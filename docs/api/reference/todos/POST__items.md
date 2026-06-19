# POST /api/v1/todos/items

> Create todo item

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/todos/items` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Todos |
| **operationId** | `createTodoItem` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Item

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `listId` | string | yes | format: uuid |
| `title` | string | yes | maxLen 500; e.g. `Pay internet bill` |
| `dueDate` | string | no | format: date |
| `priority` | string | no | enum: `low`, `medium`, `high` |
| `amount` | number | no | min 0 |

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
