# Test layout

This folder keeps fixtures, scenarios, runners, and reports separated so test
assets don't pile up in one flat directory. The authoritative overview (every
command + the deliverable map) is in [`README.md`](./README.md).

## Layout

- `frontend/` — **frontend unit/service suites** (Vitest). Mirrors `src/` subpaths
  (`lib/`, `services/`, `strategies/`); tests import app code via the `@/` alias.
  Run: `npm --prefix frontend run test:unit`.
- `backend/` — **backend suites** (Jest): `tests/integration/` (DB-backed),
  `tests/setup.ts` + `tests/tsconfig.json`, and `unit/` (e.g. `unit/auth/input-hardening.test.ts`).
  Run: `npm --prefix backend test`.
- `diagnostics/` — relocated dev/DB probe scripts (`backend/`, `frontend/`), incl.
  `backend/test-db.mjs` (the `db:test:reset` command). Not part of any suite.
- `api/` — API contract testing: `e2e/` (Playwright request specs) + `runner/`
  (`run-api-report.mjs`, fires every endpoint → Excel).
- `e2e/` — UI Playwright specs + page objects (`pom/`).
- `automation/` — index of every automated suite across the stack + CI entry point.
- `security/` — security/abuse-case test index (suites under `backend/tests/integration/`).
- `database/` — schema, migration, and data-integrity test notes + index.
- `performance/` — load/latency/resource testing notes + budgets.
- `manual/` — human-driven plans and ad-hoc scripts (`manual/ocr/` OCR diagnostics).
- `fixtures/imports/`, `fixtures/auth/` — JSON payload samples for import/auth tests.
- `scenarios/` — human-readable scenario notes.
- `reports/` — generated output: `api/` (api-report, contract-completeness,
  regression) and `ui/` (automation-element-inventory, gap report).
- `archive/legacy-tests/` — retired runners and ad-hoc debug pages
  (see [`archive/legacy-tests/ARCHIVE.md`](./archive/legacy-tests/ARCHIVE.md)).

## How the runners find tests here

All suites now live under `quality/`; the runners are pointed at this hub:

- Vitest — `frontend/vitest.config.ts` `include: ['../quality/frontend/**']`; the `@`
  alias still resolves to `frontend/src`, so tests import app code as `@/…`.
- Jest — `backend/jest.config.ts` `roots: ['<rootDir>/../quality/backend']`,
  `setupFiles` + ts-jest `tsconfig` point at `../quality/backend/tests/…`. Tests import
  source as `../../../../backend/src/…`. `rootDir` stays `backend/` so coverage targets `src/`.
- Backend feature-matrix helpers stay in `backend/scripts/`.

## Sample data

- Canonical JSON import fixtures live in [`fixtures/imports/`](./fixtures/imports/).
- To version additional demo files, place them under [`fixtures/samples/`](./fixtures/samples/README.md).
