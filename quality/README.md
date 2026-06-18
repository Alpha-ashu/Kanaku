# Quality â€” Unified Testing Hub

> Single navigation point for **every** test artifact in Kanaku. The actual test
> files stay where their runners require them (moving them would break Playwright,
> Jest, Vitest, and the auto-generated `quality/api/` catalog). This hub maps them
> by **type** and by **feature** so anyone â€” QA, dev, or stakeholder â€” finds the
> right test in seconds.

## Why the test files aren't physically moved here

This was a deliberate engineering decision (see [`../ARCHITECTURE_RESTRUCTURE.md`](../ARCHITECTURE_RESTRUCTURE.md#decision-matrix)):

| Test location | Why it can't move into `quality/` |
|---|---|
| `quality/e2e/` | Pinned by `playwright.config.ts` (`testDir`, `outputDir`, 3 reporter paths). |
| `backend/tests/` | Jest `roots`/`testMatch` + `tests/tsconfig.json`. |
| `frontend/src/**/*.test.tsx` | Vitest co-locates with components by design. |
| `quality/api/` | **Auto-generated** by `scripts/gen-catalogs.mjs` at repo root every `npm run docs:catalogs`. |

So `quality/` is the **index**, not a second copy. This keeps one source of truth while giving the single, unified view the structure was missing.

## By type

| Type | Real location | Runner | Command |
|---|---|---|---|
| **Backend unit** | `backend/src/features/*/tests/`, `backend/tests/unit/` | Jest | `npm --prefix backend test` |
| **Backend integration** | `backend/tests/integration/` | Jest + supertest | `npm --prefix backend run test:integration` |
| **Security / pentest** | `backend/tests/integration/security*.test.ts` | Jest | `npm --prefix backend run test:security` |
| **Frontend unit** | `frontend/src/**/*.test.tsx` | Vitest | `npm --prefix frontend run test:unit` |
| **E2E** | [`./e2e/`](./e2e/) | Playwright | `npx playwright test` |
| **Manual** | [`./manual/`](./manual/) | human | â€“ |
| **Scenarios (feature-level)** | [`./scenarios/`](./scenarios/) | runners + human | â€“ |
| **API contract (catalog)** | [`./api/API_CATALOG.md`](./api/API_CATALOG.md) (generated) | â€“ | `npm run docs:catalogs` |
| **API contract (test cases)** | [`./api/`](./api/) (this hub) | Newman / custom | TBD |
| **DB schema / data** | _planned: `quality/database/`_ | psql + jest | â€“ |
| **Performance** | _planned: `quality/performance/`_ | k6 / autocannon | â€“ |

## By feature (fill as coverage lands)

| Feature | Unit | Integration | E2E | Manual | API contract |
|---|---|---|---|---|---|
| auth | âœ… | âœ… | âœ… | âœ… `quality/manual/` | ðŸŸ¡ `quality/api/auth/login.test.json` |
| transactions | âœ… | âœ… | âœ… | â€“ | â€“ |
| accounts | âœ… | âœ… | â€“ | â€“ | â€“ |
| bills | âœ… | âœ… (security) | â€“ | â€“ | â€“ |
| ai | âœ… | âœ… (security) | â€“ | â€“ | â€“ |
| â€¦ | â€“ | â€“ | â€“ | â€“ | â€“ |

## API contract test format

See [`api/auth/login.test.json`](./api/auth/login.test.json). Every file here pairs 1:1 with a contract in [`../docs/api/contracts/`](../docs/api/README.md).

## PR gate

A PR that adds or changes an endpoint **must** include:
1. `api-docs/<feature>/<action>.api.json` (contract)
2. `quality/api/<feature>/<action>.test.json` (test case)
3. A `backend/tests/integration/` test
4. (Frontend) Vitest coverage for new components/hooks

