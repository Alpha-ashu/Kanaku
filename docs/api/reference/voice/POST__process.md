# POST /api/v1/voice/process

> Parse voice transcript to financial intents

NLP parses text and extracts actions. Requires `voiceAssistant` feature.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/voice/process` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Voice |
| **operationId** | `processVoice` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `application/json`  ·  **Required:** yes

Transcript

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `transcript` | string | yes | minLen 1; maxLen 5000; e.g. `I spent 450 rupees on lunch at Swiggy today` |

## Responses

### 200 — Intents

Schema: `Envelope`

```json
{
  "success": true,
  "data": {
    "intents": [
      {
        "action": "add_expense",
        "amount": 450,
        "category": "Food & Dining",
        "merchant": "Swiggy"
      }
    ],
    "confidence": 0.92
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
