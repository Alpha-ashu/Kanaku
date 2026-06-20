# Quality · Automation

Automated suites across the stack. Files stay with their runners; this indexes them.

| Layer | Runner | Location | Command |
|---|---|---|---|
| Backend unit + integration | Jest | `backend/tests/`, `backend/src/features/*/tests/` | `npm --prefix backend test` |
| Backend security/pentest | Jest | `backend/tests/integration/security*.test.ts` | `npm --prefix backend run test:security` |
| Frontend unit | Vitest | `frontend/src/**/*.test.tsx` | `npm --prefix frontend run test:unit` |
| API E2E | Playwright (request) | `quality/api/e2e/` | `npm run test:api` |
| UI E2E | Playwright (browser) | `quality/e2e/` (+ `pom/`) | `npm run test:e2e` |
| API report (all endpoints → Excel) | Node | `quality/api/runner/` | `npm run qa:api-report` |
| Regression diff (run vs run) | Node | `scripts/qa-regression-diff.mjs` | `npm run qa:regression` |
| Contract completeness | Node | `scripts/audit-api-contracts.mjs` | `npm run qa:contract-audit` |
| UI element inventory | Node | `scripts/gen-ui-inventory.mjs` | `npm run qa:ui-inventory` |

CI entry point: `.github/workflows/ci.yml`. Retired runners live in
[`../archive/legacy-tests/`](../archive/legacy-tests/).

