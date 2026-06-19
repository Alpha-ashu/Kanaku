# GET /health

> Health check

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/health` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | System |
| **operationId** | `getHealth` |

## Path parameters

_None._

## Query parameters

_None._

## Request

_No request body._

## Responses

### 200 — Service healthy

Schema: `Envelope`

```json
{
  "status": "ok",
  "timestamp": "2026-06-09T10:00:00Z",
  "services": {
    "redis": "connected",
    "database": {
      "status": "connected"
    }
  }
}
```

### 500 — Server error

Schema: `ApiError`

---
_Generated from the OpenAPI spec (`backend/src/docs/api-docs.ts`) by `scripts/gen-endpoint-docs.mjs`. Do not edit by hand — re-run `npm run docs:endpoints`._
