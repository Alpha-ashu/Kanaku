# Quality · Automation

Automated suites across the stack. Files stay with their runners; this indexes them.

| Layer | Runner | Location | Command |
|---|---|---|---|
| Backend unit + integration | Jest | `backend/tests/`, `backend/src/features/*/tests/` | `npm --prefix backend test` |
| Backend security/pentest | Jest | `backend/tests/integration/security*.test.ts` | `npm --prefix backend run test:security` |
| Frontend unit | Vitest | `frontend/src/**/*.test.tsx` | `npm --prefix frontend run test:unit` |
| End-to-end | Playwright | `tests/e2e/` | `npx playwright test` |

CI entry point: `.github/workflows/ci.yml`.

