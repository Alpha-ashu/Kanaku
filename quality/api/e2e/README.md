# Quality · API · End-to-End API Tests

Real HTTP tests that hit the running backend exactly like the frontend does —
**including how to get the bearer token**, the registration endpoint, the login
endpoint, token refresh, and protected-resource access. Built on Playwright's
API testing (`request`) so no browser is needed.

## Run

```bash
# 1. Start the backend (default http://localhost:3000)
npm run dev:backend

# 2. Run the API E2E suite
npm run test:api
# or against a deployed env:
API_BASE_URL=https://kanaku.fly.dev npm run test:api
```

A `global-setup` first pings `/health` and fails fast with a clear message if
the backend isn't reachable.

## How authentication works here (the bearer token)

Kanaku login is a **SHA-256 challenge-response**:

| Step | Endpoint | Body | Returns |
|---|---|---|---|
| Register | `POST /api/v1/auth/register` | `{ email, name, password }` (plain password) | `201 { data: { user } }` + `Authorization` header |
| 1. Challenge | `POST /api/v1/auth/login/challenge` | `{ email, password }` + header `x-pw-encoding: sha256` (password = SHA-256 hex) | `{ data: { challengeId, code } }` |
| 2. Login | `POST /api/v1/auth/login` | `{ email, challengeCode }` | `{ data: { accessToken, refreshToken, user } }` |
| Refresh | `POST /api/v1/auth/refresh` | `{ refreshToken }` | `{ data: { accessToken, ... } }` |
| Protected | any `/api/v1/*` | header `Authorization: Bearer <accessToken>` | resource |

> **`accessToken` from step 2 (or the refresh response) is the BEARER TOKEN.**
> The helper `ApiClient.login(email, password)` runs both steps and returns it.

```ts
const api = new ApiClient(request);
const user = uniqueUser();                 // fresh data every run
await api.register(user);                  // registration endpoint
const { accessToken } = await api.login(   // login endpoint -> bearer token
  user.email, user.password,
);
await api.authed('get', '/accounts', accessToken);   // protected call
```

## Layout

```
quality/api/e2e/
├── playwright.api.config.ts   # dedicated config (no browser)
├── global-setup.ts            # /health gate
├── helpers/
│   ├── env.ts                 # base URL + sha256
│   ├── test-data.ts           # uniqueUser() — unique data every run
│   └── api-client.ts          # register / challenge / login / refresh / authed
├── auth/
│   ├── register.spec.ts       # registration endpoint (+ all validation errors)
│   ├── login.spec.ts          # challenge -> login -> BEARER TOKEN (+ negatives)
│   ├── token-refresh.spec.ts  # refresh endpoint
│   └── auth-flow.e2e.spec.ts  # golden path: register -> bearer -> protected -> refresh
└── accounts/
    └── accounts.crud.spec.ts  # protected CRUD using the bearer token
```

## Unique test data

`uniqueUser()` (in `helpers/test-data.ts`) returns a brand-new email/mobile/
password on every call (timestamp + UUID), so the suite is **re-runnable**
without a clean DB and never hits "email already registered". Invalid variants
live in `invalidUsers` for negative cases.

## Adding a new endpoint test

1. Add a method to `ApiClient` (or use `authed(method, path, token, body)`).
2. Create `quality/api/e2e/<feature>/<action>.spec.ts`.
3. Use `uniqueUser()` for data; assert status + body shape.
4. Keep the matching contract in [`../../../docs/api/contracts/`](../../../docs/api/contracts/README.md).

