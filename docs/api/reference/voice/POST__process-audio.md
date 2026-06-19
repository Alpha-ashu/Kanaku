# POST /api/v1/voice/process-audio

> Transcribe + process audio file

Uploads audio → transcribes → parses as voice command.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `/api/v1/voice/process-audio` |
| **Auth** | 🔒 Bearer token required |
| **Tags** | Voice |
| **operationId** | `processVoiceAudio` |

## Path parameters

_None._

## Query parameters

_None._

## Request

**Content-Type:** `multipart/form-data`  ·  **Required:** yes

Audio upload

**Body schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `audio` | string | no | format: binary |

## Responses

### 200 — Intents

Schema: `Envelope`

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
