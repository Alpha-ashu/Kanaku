# GET /api/v1/receipts/status/{jobId}

> Get receipt scan status

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/receipts/status/{jobId}` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Receipts |
| **operationId** | `getReceiptScanStatus` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `jobId` | string | yes | Job ID from /receipts/start  |

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Status

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "jobId": "job_abc123",
    "status": "completed",
    "result": {
      "merchant": "Swiggy",
      "total": 450,
      "date": "2026-06-09",
      "category": "Food & Dining"
    }
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
