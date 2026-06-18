# Quality - Unified Testing Hub
Every kind of test for Kanaku in one place: end-to-end **API** tests (with
bearer-token auth flows), **UI** tests (multiple cases, unique data), manual
checks, scenarios, and pointers to the unit/integration suites that live with
their runners.
## Layout
```
quality/
  api/
    e2e/                  # >>> real end-to-end API tests (Playwright request) <<<
      auth/               #   register, login (bearer token), refresh, golden path
      accounts/           #   protected CRUD with the bearer token
      helpers/            #   uniqueUser() + ApiClient (register/login/refresh/authed)
      playwright.api.config.ts
      README.md           #   how the bearer token works, how to run
    auth/login.test.json  # declarative contract test-case sample
    API_CATALOG.md        # generated endpoint catalog (npm run docs:catalogs)
  e2e/                    # UI testing (Playwright browser)
    *.spec.ts             #   journeys incl. auth-registration.matrix.spec.ts
    test-data.ts          #   uniqueUiUser() - unique data every run
    helpers.ts, pom/      #   page objects + flow helpers
  manual/ scenarios/ runners/ fixtures/ automation/ database/ performance/
```
## Run
```bash
# API end-to-end (needs backend at http://localhost:3000)
npm run dev:backend
npm run test:api                 # all API E2E specs
npm run test:api -- auth         # just the auth endpoints
# UI end-to-end (needs frontend + backend: npm run dev)
npm run test:e2e
npx playwright test quality/e2e/auth-registration.matrix.spec.ts
# Against a deployed environment
API_BASE_URL=https://kanaku.fly.dev npm run test:api
```
## Where to get the bearer token (API E2E)
Login is a SHA-256 challenge-response; the accessToken it returns is the bearer
token. Details + example: [api/e2e/README.md](./api/e2e/README.md).
| Endpoint | Purpose |
|---|---|
| POST /api/v1/auth/register | create account (plain password) |
| POST /api/v1/auth/login/challenge | step 1 - SHA-256 password -> code |
| POST /api/v1/auth/login | step 2 - { email, challengeCode } -> accessToken (bearer) |
| POST /api/v1/auth/refresh | new bearer token from refresh token |
## Unique test data
quality/api/e2e/helpers/test-data.ts (uniqueUser) and quality/e2e/test-data.ts
(uniqueUiUser) return fresh email/mobile/password every call (timestamp + UUID).
Suites are re-runnable with no DB cleanup and never collide on "already registered".
## By type
| Type | Location | Runner | Command |
|---|---|---|---|
| API E2E | quality/api/e2e/ | Playwright (request) | npm run test:api |
| UI E2E | quality/e2e/ | Playwright (browser) | npm run test:e2e |
| Manual | quality/manual/ | human | - |
| Scenarios | quality/scenarios/ | runners + human | - |
| Backend unit/integration | backend/tests/, backend/src/features/*/tests/ | Jest | npm --prefix backend test |
| Security / pentest | backend/tests/integration/security*.test.ts | Jest | npm --prefix backend run test:security |
| Frontend unit | frontend/src/**/*.test.tsx | Vitest | npm --prefix frontend run test:unit |
| API contract catalog | quality/api/API_CATALOG.md | generated | npm run docs:catalogs |
| DB / performance | quality/database/, quality/performance/ | planned | - |
> Backend unit/integration tests stay under backend/ (Jest + tsconfig resolve
> them there); Vitest co-locates with components. This hub is where API/UI E2E +
> manual tests physically live and where everyone starts.
## Contracts pairing
Every API E2E test pairs with a contract under
[../docs/api/contracts/](../docs/api/contracts/README.md) (238 endpoints).
Security posture: [../platform/security/README.md](../platform/security/README.md).
## PR gate
A PR that adds/changes an endpoint must include:
1. docs/api/contracts/<feature>/<action>.api.json (contract)
2. quality/api/e2e/<feature>/<action>.spec.ts (E2E test)
3. A backend/tests/integration/ test
4. (Frontend) Vitest coverage for new components/hooks