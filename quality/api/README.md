# api-testing/

Centralized API visibility for KANAKU.

## Contents

| File | What |
|---|---|
| [`API_CATALOG.md`](./API_CATALOG.md) | Every endpoint by feature (method, path, guards, handler) — generated |

## Live, machine-readable spec

The backend serves an OpenAPI document and a testing guide (generated from the
running app — always current):

- `GET /api-docs/openapi.json` — OpenAPI 3 spec
- `GET /api-docs/testing-guide` — Markdown testing guide
- `GET /api-docs` — index

Source: [`backend/src/docs/api-docs.ts`](../backend/src/docs/api-docs.ts).

## Import into a client

- **Postman / Insomnia / Bruno:** Import → URL → `https://<host>/api-docs/openapi.json`
  (or `http://localhost:3000/api-docs/openapi.json` in dev).
- **Swagger UI:** point it at the same `openapi.json`.

## Auth

Most endpoints require `Authorization: Bearer <accessToken>`. Obtain tokens via
`POST /api/v1/auth/login`; refresh via `POST /api/v1/auth/refresh` (send the
refresh token in the `x-refresh-token` header). See
[`backend/src/modules/auth/README.md`](../backend/src/modules/auth/README.md).

## Suggested layout for saved collections

```
api-testing/
├── API_CATALOG.md
├── collections/        # exported Postman/Bruno/Insomnia collections
└── <feature>/          # per-feature saved requests (accounts, transactions, …)
```
