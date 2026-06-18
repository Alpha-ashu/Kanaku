# API Smoke Test

Run a quick smoke test against all critical API endpoints to verify the backend is functioning correctly. Requires the backend to be running locally (port 3000).

## Endpoints to test

**Auth:**
- `POST /api/auth/login` — test with valid test credentials
- `GET /api/auth/me` — test with returned JWT

**Core data:**
- `GET /api/transactions` — expect 200 with array
- `GET /api/accounts` — expect 200 with array
- `GET /api/budgets` — expect 200
- `GET /api/goals` — expect 200

**Advisor module:**
- `GET /api/advisors` — list advisors (public)
- `GET /api/bookings` — client bookings (authenticated)

**Admin (if admin token available):**
- `GET /api/admin/users` — expect 200

**Health:**
- `GET /health` — expect `{ status: "ok" }`

## Steps

1. Source the test credentials from `backend/.env.test` or `tests/fixtures/auth/`.
2. Login to get a JWT, then run all GET endpoints with `Authorization: Bearer <token>`.
3. For each endpoint: show status code, response time, and first 100 chars of body.
4. Flag any 4xx/5xx responses in red.
5. Report total pass/fail count.
