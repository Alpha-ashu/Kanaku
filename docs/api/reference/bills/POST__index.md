# POST /api/v1/bills

> Upload bill document (rate: 10/min)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/bills` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Bills |
| **operationId** | `uploadBill` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `multipart/form-data`  ·  **Required:** yes

Bill

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string | no | format: binary |

## Responses

### 201 — Uploaded

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "filename": "bill.pdf",
    "status": "processing"
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
