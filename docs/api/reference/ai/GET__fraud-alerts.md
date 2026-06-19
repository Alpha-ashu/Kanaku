# GET /api/v1/ai/fraud-alerts

> Fraud detection alerts

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/ai/fraud-alerts` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | AI |
| **operationId** | `getAIFraudAlerts` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Alerts

Schema: `Envelope`

```json
{
  "flags": [
    {
      "transactionId": "uuid",
      "reason": "Unusual merchant",
      "severity": "high",
      "amount": 5000
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
