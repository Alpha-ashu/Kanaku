# GET /api/v1/ai/insights

> Consolidated AI insights (all agents)

Health score, recommendations, fraud alerts, bill predictions. Requires `aiAutomation` feature.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/ai/insights` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | AI |
| **operationId** | `getAIInsights` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Insights

Schema: `Envelope`

```json
{
  "healthScore": 72,
  "recommendations": [
    {
      "title": "Reduce food spending",
      "priority": 9
    }
  ],
  "fraudAlerts": [],
  "upcomingBills": [
    {
      "vendor": "Netflix",
      "predictedDate": "2026-06-20",
      "amount": 649
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
