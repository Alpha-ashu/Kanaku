# API Report Runner

Fires **every documented endpoint** against a running backend, captures the
**actual** response, optionally compares it to the database, and writes a
stakeholder-friendly Excel workbook.

```bash
npm run qa:api-report
```

Output (per run, timestamped):

- `quality/reports/api/api-report-<ts>.xlsx` — the report
- `quality/reports/api/api-report-<ts>.json` — machine-readable sidecar (diff runs)

## What the Excel contains

**Sheet `API Report`** — one row per endpoint:

| Column | Meaning |
|---|---|
| Feature | feature group (auth, accounts, …) |
| API Endpoint | path (`/api/v1/...`) |
| Method | GET/POST/PUT/PATCH/DELETE |
| Auth | documented auth requirement (from the contract) |
| API Request | the endpoint's contract JSON (`docs/api/contracts/<feature>/*.api.json`) |
| API Response Actual | the **real** response body captured from the live call |
| HTTP Status | actual status code |
| Result | PASS / AUTH / NOT FOUND / VALIDATION / RATE LIMIT / SERVER ERR / NO CONN / SKIP |
| API Count | array length of `data` for list (collection) GETs |
| DB Count | matching row count in the DB (Prisma) for that feature |
| Match | YES/NO — does API Count equal DB Count? |
| Latency(ms) | round-trip time |
| Notes | extra info |

**Sheet `Summary`** — base URL, authenticated user, totals per Result.

## How it works

1. Reads the endpoint list from `docs/api/contracts/api-index.json`.
2. Enriches request bodies with examples from the OpenAPI spec
   (`backend/src/docs/api-docs.ts`, dumped via `backend/scripts/dump-openapi.ts`).
3. Registers a fresh QA user (or uses `QA_EMAIL`/`QA_PASSWORD`), logs in via the
   SHA‑256 challenge flow, and seeds a couple of resources (an account, etc.) so
   path‑param endpoints have real IDs.
4. Calls every endpoint and records the actual status + body. A bearer token is
   always sent when available (the contract `auth` field is an unreliable
   auto‑generated default).
5. If `DATABASE_URL` is set, counts rows per feature table for the API‑vs‑DB
   comparison.

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `API_BASE_URL` | `http://localhost:3000` | backend root |
| `API_PREFIX` | `/api/v1` | API prefix |
| `QA_EMAIL` / `QA_PASSWORD` | _(register fresh)_ | use an existing account instead |
| `DATABASE_URL` | _(unset)_ | enables DB record‑count comparison (Prisma) |
| `QA_INCLUDE_DESTRUCTIVE` | `false` | also fire `DELETE` endpoints |
| `QA_ALLOW_REMOTE_WRITES` | `false` | permit writes against a non‑localhost host |
| `QA_ONLY` | _(all)_ | only run features whose name includes this substring |
| `QA_MAX` | _(all)_ | cap endpoint count (quick smoke run) |

```bash
# Full run against local backend, with DB comparison:
#   (PowerShell)  $env:DATABASE_URL=(your url); npm run qa:api-report
#   (bash)        DATABASE_URL=... npm run qa:api-report

# Smoke run, accounts only:
QA_ONLY=accounts QA_MAX=10 npm run qa:api-report
```

## Safety

- Needs the backend running (`npm run dev:backend`) and reachable at `API_BASE_URL`.
- `DELETE` is skipped unless `QA_INCLUDE_DESTRUCTIVE=1`.
- Session‑breaking endpoints (`/auth/logout`, `/auth/account` delete,
  `/settings/account` delete, `/auth/refresh`) are never auto‑fired.
- Against a non‑local host, writes are skipped unless `QA_ALLOW_REMOTE_WRITES=1`.
  **Never point this at production with writes enabled.**

## Expected non‑PASS results

Many non‑2xx rows are expected, not bugs:
- **VALIDATION (400/422):** write endpoints whose body isn't in the OpenAPI spec
  yet are called with an empty/example body. Fill the contract/spec to fix.
- **NOT FOUND (404):** path‑param endpoints called with a placeholder UUID (no
  seeded resource of that type).
- **AUTH (403):** admin/advisor‑only endpoints, correctly rejecting the `user`‑role
  QA account.

Focus review on **SERVER ERR (5xx)** and **Match = NO** rows.

> Reports are regenerated on demand and are git‑ignored (`quality/reports/api/`).
> To share a canonical snapshot, `git add -f` a specific `.xlsx`.
