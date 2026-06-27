# Quality · Automation

Every automated suite across the stack now lives under `quality/`; the runners are
pointed at this hub (see [`../TEST_LAYOUT.md`](../TEST_LAYOUT.md)). This indexes them.

| Layer | Runner | Location | Command |
|---|---|---|---|
| Backend integration + unit | Jest | `quality/backend/tests/integration/`, `quality/backend/unit/` | `npm --prefix backend test` |
| Backend security/pentest | Jest | `quality/backend/tests/integration/*security*.test.ts` (index: [`../security/`](../security/README.md)) | `npm --prefix backend run test:security` |
| Frontend unit/service | Vitest | `quality/frontend/**/*.test.{ts,tsx}` | `npm --prefix frontend run test:unit` |
| API E2E | Playwright (request) | `quality/api/e2e/` | `npm run test:api` |
| UI E2E | Playwright (browser) | `quality/e2e/` (+ `pom/`) | `npm run test:e2e` |
| API report (all endpoints → Excel) | Node | `quality/api/runner/` | `npm run qa:api-report` |
| Regression diff (run vs run) | Node | `scripts/qa-regression-diff.mjs` | `npm run qa:regression` |
| Contract completeness | Node | `scripts/audit-api-contracts.mjs` | `npm run qa:contract-audit` |
| UI element inventory | Node | `scripts/gen-ui-inventory.mjs` | `npm run qa:ui-inventory` |

CI entry point: `.github/workflows/ci.yml`. Retired runners live in
[`../archive/legacy-tests/`](../archive/legacy-tests/).

