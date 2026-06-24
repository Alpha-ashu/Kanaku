# Test layout

This folder keeps fixtures, scenarios, runners, and reports separated so test
assets don't pile up in one flat directory. The authoritative overview (every
command + the deliverable map) is in [`README.md`](./README.md).

## Layout

- `api/` — API contract testing: `e2e/` (Playwright request specs) + `runner/`
  (`run-api-report.mjs`, fires every endpoint → Excel).
- `e2e/` — UI Playwright specs + page objects (`pom/`).
- `automation/` — index of every automated suite across the stack + CI entry point.
- `security/` — security/abuse-case test index (suites live with the backend runner).
- `database/` — schema, migration, and data-integrity test notes + index.
- `performance/` — load/latency/resource testing notes + budgets.
- `manual/` — human-driven plans and ad-hoc scripts (`manual/ocr/` OCR diagnostics).
- `fixtures/imports/`, `fixtures/auth/` — JSON payload samples for import/auth tests.
- `scenarios/` — human-readable scenario notes.
- `reports/` — generated output: `api/` (api-report, contract-completeness,
  regression) and `ui/` (automation-element-inventory, gap report).
- `archive/legacy-tests/` — retired runners and ad-hoc debug pages
  (see [`archive/legacy-tests/ARCHIVE.md`](./archive/legacy-tests/ARCHIVE.md)).

## Co-located suites (live with their runners, not here)

These run where their test runner is configured to find them; `quality/` indexes
them rather than relocating them (moving them would break Vitest/Jest resolution).

- Frontend unit/service tests — `frontend/src/**/*.test.{ts,tsx}` (`npm --prefix frontend run test:unit`)
- Backend integration tests — `backend/tests/integration/` (`npm --prefix backend test`)
- Backend colocated unit tests — e.g. `backend/src/features/auth/input-hardening.test.ts`
- Backend security suites — `backend/tests/integration/*security*.test.ts` (see [`security/`](./security/README.md))
- Backend feature matrix helpers — `backend/scripts/`

## Sample data

- Canonical JSON import fixtures live in [`fixtures/imports/`](./fixtures/imports/).
- To version additional demo files, place them under [`fixtures/samples/`](./fixtures/samples/README.md).
