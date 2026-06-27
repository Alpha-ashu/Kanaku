# Quality — Application Validation & QA Hub

The single source of truth for QA, automation testing, API validation, and bug
reporting across Kanaku. Every kind of test lives here or is indexed from here:
end-to-end **API** tests (bearer-token flows), **UI** tests, an **all-endpoint API
report**, a **UI element inventory**, **contract auditing**, and **regression diffs**.

## The 6 deliverables → where they live

| # | Capability | Command | Output / location |
|---|---|---|---|
| 1 | **UI automation inventory** (every interactive element + its `data-testid`) | `npm run qa:ui-inventory` | `reports/ui/automation-element-inventory.xlsx`, `ui-gap-report.md` |
| 2 | **API contract catalog** (240 endpoints) | `qa:contract-enrich` → `qa:contract-enrich-zod` → live capture → `qa:contract-finalize` | `../docs/api/contracts/` + `reports/api/contract-completeness.xlsx` (**239/239 complete**) |
| 3 | **Automated API validation runner** (fires every endpoint, captures actual response) | `npm run qa:api-report` | `reports/api/api-report-<ts>.xlsx` (+ `.json`) |
| 4 | **Excel validation report** (expected vs actual, API-vs-DB counts) | same as #3 | `reports/api/api-report-<ts>.xlsx` |
| 5 | **Bug-identification workflow** (read the Excel, no IDE) | open the report | see *Bug workflow* below |
| 6 | **Regression testing** (this run vs last, highlight new failures) | `npm run qa:regression` | `reports/api/regression-<ts>.xlsx` |

The requested `testing/{api,ui,docs,archive}` structure is satisfied in-place:

| Spec folder | Lives at |
|---|---|
| `api/contracts`, `api/schemas`, `api/requests` | `../docs/api/contracts/` (per-endpoint JSON) |
| `api/runner`, `api/reports` | `api/runner/`, `reports/api/` |
| `ui/elements`, `ui/selectors`, `docs/automation-inventory` | `reports/ui/` (generated) |
| `ui/pages`, `ui/runner` | `e2e/` (specs) + `e2e/pom/` (page objects) |
| `docs/endpoint-catalog`, `docs/feature-matrix` | `api/API_CATALOG.md`, `../docs/api/reference/`, `reports/api/contract-completeness.xlsx` |
| `archive/legacy-tests` | `archive/legacy-tests/` |

## Layout
```
quality/
  api/
    e2e/        real end-to-end API tests (Playwright request) + bearer-token helpers
    runner/     run-api-report.mjs — fires every endpoint, captures actual response → Excel
    API_CATALOG.md
  e2e/          UI tests (Playwright browser): *.spec.ts, test-data.ts, helpers.ts, pom/
  fixtures/     JSON payload samples (imports, auth)
  scenarios/    human-readable scenario notes
  reports/
    api/        api-report-*, contract-completeness, regression-*  (git-ignored)
    ui/         automation-element-inventory, ui-gap-report         (git-ignored)
  archive/legacy-tests/   retired runners + debug pages (ARCHIVE.md) — NOT on the active path
```
Report artifacts are regenerated on demand and git-ignored; snapshot one for
stakeholders with `git add -f reports/...`.

## Run
```bash
# 1. UI element inventory + gap report (no server needed)
npm run qa:ui-inventory
npm run qa:ui-fix                         # codemod: inject data-testid on every untagged element (→100%)

# 2. Fill the contract catalog to 100% (239/239)
npm run qa:contract-enrich       # from the OpenAPI spec (offline)
npm run qa:contract-enrich-zod   # request bodies from Zod validation schemas (offline)
# live capture (real responses): backend up, then
QA_CAPTURE_WRITES=1 npm run qa:api-report   # fresh throwaway user, create→read→update→delete
npm run qa:contract-audit -- --write-expected
npm run qa:contract-finalize     # documented defaults for endpoints that can't be exercised locally
npm run qa:contract-audit        # re-score

# 2/3/4. Fire every endpoint against a live backend → Excel (expected vs actual, API vs DB)
npm run dev:backend                       # backend on :3000
npm run qa:api-report                     # add DATABASE_URL=… to enable DB-count comparison

# 2. Score how complete the endpoint contracts are; optionally backfill expected responses
npm run qa:contract-audit
npm run qa:contract-audit -- --write-expected   # fill empty success bodies from the last api-report

# 6. Diff the two most recent api-report runs; non-zero exit on a new failure (CI gate)
npm run qa:regression

# Umbrella: inventory + contract audit in one shot
npm run qa:reports

# Existing E2E suites
npm run test:api                          # API E2E (needs backend)
npm run test:e2e                          # UI E2E (needs npm run dev)
```

## Bug workflow (deliverable #5 — no IDE required)

After `npm run qa:api-report`, open `reports/api/api-report-<ts>.xlsx`. Each row is
one endpoint: **Feature | Endpoint | Method | API Request | API Response Actual |
HTTP Status | Result | API Count | DB Count | Match**. Filter the **Result** column:

- `SERVER ERR` / `NO CONN` → a real bug. The **API Response Actual** column already
  holds the failing payload — paste it straight into a ticket.
- `Match = NO` → the endpoint returned a different record count than the database
  (e.g. API `netWorth: null` while the DB has data).

> Example bug: Dashboard `/api/v1/dashboard` — Expected `totalNetWorth = 5000`,
> Actual `totalNetWorth = null`, Result `FAIL`. A PM can file this from the Excel
> alone; a dev reproduces by calling the endpoint.

For UI automation gaps, open `reports/ui/automation-element-inventory.xlsx` and
filter **Status = MISSING** — every row is an interactive element that still needs a
`data-testid` (with the exact `File:Line` to fix). `ui-gap-report.md` is the same,
grouped by page.

## Regression workflow (deliverable #6)

On every deploy: run the API report, then `npm run qa:regression`. It compares the
two most recent runs and classifies each endpoint — **NEW FAILURE / FIXED / STATUS
CHANGED / NEW ENDPOINT / REMOVED** — writing `reports/api/regression-<ts>.xlsx` and
**exiting non-zero when there are new failures**, so it can gate CI. Compare any two
runs explicitly with `--base <old.json> --head <new.json>`.

## `data-testid` convention (UI automation)

Every interactive element must have a unique `data-testid`. Naming:
`<page>-<element>-<action>` (e.g. `goals-add-goal-button`, `goals-edit-name-input`);
dynamic rows use a template: `` `goals-edit-button-${goal.id}` ``. Coverage is
**100%** (`npm run qa:ui-inventory`); `npm run qa:ui-fix` re-tags any new untagged
elements. Composite wrappers (whose DOM is tagged inside their own file) are
excluded from the count and the inventory reports that exclusion explicitly.

## Bearer token (API E2E)

Login is a SHA-256 challenge-response; the `accessToken` it returns is the bearer
token. Details + example: [api/e2e/README.md](./api/e2e/README.md).

| Endpoint | Purpose |
|---|---|
| POST /api/v1/auth/register | create account (plain password) |
| POST /api/v1/auth/login/challenge | step 1 — SHA-256 password → code |
| POST /api/v1/auth/login | step 2 — `{ email, challengeCode }` → accessToken (bearer) |
| POST /api/v1/auth/refresh | new bearer token from refresh token |

Unique test data: `api/e2e/helpers/test-data.ts` (`uniqueUser`) and
`e2e/test-data.ts` (`uniqueUiUser`) return fresh credentials every call, so suites
are re-runnable with no DB cleanup.

## PR gate

A PR that adds/changes an endpoint must include:
1. `docs/api/contracts/<feature>/<action>.api.json` (contract — aim for 100% on `qa:contract-audit`)
2. `quality/api/e2e/<feature>/<action>.spec.ts` (API E2E test)
3. A `quality/backend/tests/integration/` test
4. (Frontend) new interactive elements carry a `data-testid` (`qa:ui-inventory` shows no new MISSING)
