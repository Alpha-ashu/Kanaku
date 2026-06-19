# POST /api/v1/import/upload

> Upload bank statement (CSV/Excel) for preview

Parses statement with AI categorization. Max 10MB.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/import/upload` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Import |
| **operationId** | `uploadImport` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `multipart/form-data`  ·  **Required:** yes

Statement

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string | no | format: binary |

## Responses

### 201 — Preview

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "sessionId": "session_abc123",
    "transactions": [
      {
        "row": 1,
        "date": "2026-06-01",
        "description": "ATM Withdrawal",
        "amount": -2000,
        "suggestedCategory": "Cash"
      }
    ],
    "totalRows": 45,
    "validRows": 43
  }
}
```

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
