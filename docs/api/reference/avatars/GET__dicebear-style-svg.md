# GET /api/v1/avatars/dicebear/{style}/svg

> Get DiceBear avatar SVG (public)

XSS-sanitized SVG proxy. Cached 1 week.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `/api/v1/avatars/dicebear/{style}/svg` |
| **Auth** | 🔓 Public (no auth) |
| **Tags** | Avatars |
| **operationId** | `getDiceBearAvatar` |

## Path parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `style` | string | yes |  (enum: `avataaars`, `micah`, `lorelei`, `big-smile`, `bottts`) |

## Query parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `seed` | string | yes | Deterministic seed (maxLen 100) |

## Request

_No request body._

## Responses

### 200 — SVG image

### 400 — Invalid style/seed

### 502 — DiceBear upstream error

---
_Generated from the OpenAPI spec (`backend/src/docs/api-docs.ts`) by `scripts/gen-endpoint-docs.mjs`. Do not edit by hand — re-run `npm run docs:endpoints`._
