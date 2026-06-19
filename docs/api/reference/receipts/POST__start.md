# POST /api/v1/receipts/start

> Start async receipt OCR scan

Queues image for OCR. Poll /receipts/status/:jobId. Rate: 10/min.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/receipts/start` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Receipts |
| **operationId** | `startReceiptScan` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `multipart/form-data`  ·  **Required:** yes

Receipt

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string | no | format: binary |

## Responses

### 201 — Queued

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "jobId": "job_abc123",
    "status": "queued"
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
