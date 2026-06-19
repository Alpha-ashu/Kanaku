# GET /api/v1/admin/ai-features

> Get AI feature flags (any authenticated user)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/admin/ai-features` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Admin |
| **operationId** | `adminGetAIFeatureFlags` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — AI flags

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "aiAutomation": {
      "enabled": true,
      "healthScoring": true,
      "smartCategorization": true
    },
    "voiceAssistant": {
      "enabled": false
    },
    "ocrEngine": {
      "enabled": true
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
