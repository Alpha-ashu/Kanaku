# API Documentation (Contracts)

This directory is the **source of truth for HTTP API contracts** between the Kanaku frontend, mobile app, and backend.

- **One file per endpoint:** `api-docs/<feature>/<action>.api.json`
- **Format:** see [`_template.api.json`](./_template.api.json)
- **Sample:** [`auth/login.api.json`](./auth/login.api.json)
- **All endpoints live under `/api/v1`** — see [Security Requirements](../ARCHITECTURE_RESTRUCTURE.md#7-governance-rules-must-follow--add-to-pr-checklist).

## Why JSON (not OpenAPI yet)?

Lightweight, diff-friendly, machine-readable for test generators, human-readable for stakeholders. A future `scripts/build-openapi.ts` can aggregate these into a single `openapi.yaml`.

## Rules

1. Every backend route in `backend/src/features/*/*.routes.ts` **must** have a matching file here.
2. Request/response schemas must mirror the zod schema in `backend/src/features/<feature>/*.validation.ts`.
3. Document **all** non-2xx responses your handler can return (401, 403, 422, 429, 500).
4. Include the **auth requirement** (`public` / `bearer` / `bearer+stepUp`).
5. Reference the controller file so reviewers can jump to the implementation.

## Backfill Status

✅ **238 endpoints auto-generated across 36 modules** by `scripts/generate-api-docs.ps1` (or the Node twin `scripts/generate-api-docs.cjs`). See [`api-index.json`](./api-index.json) for the full machine-readable list.

Every auto-generated file carries a `"generator": { "auto": true, "version": 1, "generatedAt": "..." }` block. **Hand-edited files are detected** (missing `generator` field) and **never overwritten** by re-runs — the workflow is:

1. Add or change a route in `backend/src/features/<feature>/*.routes.ts`.
2. Re-run `pwsh -File scripts/generate-api-docs.ps1` (or `node scripts/generate-api-docs.cjs`).
3. New endpoints get a stub doc with `description: "TODO: ..."` — fill in the description, request/response shapes, and `sideEffects`.
4. Once you hand-edit a file, **delete the `generator` field** so re-runs skip it.

### What the generator infers (best-effort)
- HTTP method + path (regex over `router.<method>(...)`)
- Auth: `authMiddleware`/`requireRole`/`requireApproved` → `bearer`; `securityGate(` → `bearer+stepUp`; else `public`
- Rate limit: `destructiveLimiter` → 3/min, `authLimiter` → 20/min, else default
- Validation schemas: looks for `validateBody`/`validateParams`/`validateQuery` on the route line
- Handler name: last bare identifier in the route's argument list
- Path params from `:name` segments

### What humans still must add
- Real `description`
- Real request body / query / response shapes (tie to the zod schema)
- `sideEffects.emitsSocket`, `sideEffects.transactional`, `sideEffects.audited`
- Any non-standard error codes the handler emits

