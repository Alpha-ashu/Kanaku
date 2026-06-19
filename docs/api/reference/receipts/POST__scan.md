# POST /api/v1/receipts/scan

> Synchronous receipt scan (deprecated)

Legacy sync OCR. Use /receipts/start for new integrations. Rate: 8/min.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/receipts/scan` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Receipts |
| **operationId** | `scanReceiptSync` |

## Path parameters

_None._

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `engine` | string | no |  (enum: `tesseract`, `cloud`, `auto`) |

## Request

**Content-Type:** `multipart/form-data`  ·  **Required:** yes

Receipt

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string | no | format: binary |

## Responses

### 200 — OCR result

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "merchant": "Swiggy",
    "total": 450,
    "date": "2026-06-09",
    "category": "Food & Dining"
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
