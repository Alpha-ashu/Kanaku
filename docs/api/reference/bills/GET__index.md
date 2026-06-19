# GET /api/v1/bills

> List uploaded bills

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/bills` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Bills |
| **operationId** | `getBills` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Bills

Schema: `Envelope`

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "filename": "electricity-bill.pdf",
      "vendor": "BESCOM",
      "amount": 1250,
      "status": "processed"
    }
  ]
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
