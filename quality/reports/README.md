# Quality — Test Records & Reports

This folder is the **system of record** for testing performed on Kanaku/Finora
from this point forward. Every meaningful testing effort — automated or manual,
across UI, API, backend, database, and security — gets a dated record here so
there is a durable, reviewable trail of *what was tested, what was sent/returned,
and what was fixed*.

## What gets recorded here

| Dimension | What to capture |
|---|---|
| **UI (automation)** | Playwright spec(s) run, pass/fail, screenshots/trace links under `../e2e/screenshots` and `../e2e/report` |
| **UI (manual)** | Steps performed, expected vs actual, screenshots |
| **API** | Endpoint, method, request payload (secrets redacted), HTTP status, response body shape |
| **Backend** | Service/controller behaviour verified, logs of interest |
| **Database** | Records asserted (table, key fields), before/after state |
| **Security** | Findings, severity, status (fixed / deferred), enumeration & token-handling notes |

## Conventions

- **One file per effort:** `YYYY-MM-DD-<short-topic>.md` (e.g. `2026-06-19-registration-auth-audit.md`).
- **Redact secrets:** never paste real tokens, passwords, API keys, or service-role
  keys. Show the *shape* (`accessToken: "<jwt>"`), not the value.
- **Link, don't duplicate:** point at the spec file, the screenshot, and the
  Playwright HTML report rather than pasting large blobs.
- **State outcomes honestly:** if a test was skipped or could not run (e.g. no live
  environment), say so — don't imply a pass.

## How to run the suites (see ../README.md for full detail)

```bash
# Frontend unit (Vitest) — fast, no servers needed
npm --prefix frontend run test:unit

# API end-to-end (needs backend at http://localhost:3000)
npm run dev:backend && npm run test:api

# UI end-to-end (needs full stack: npm run dev → http://localhost:9002)
npm run dev
npx playwright test quality/e2e/auth-duplicate-registration.spec.ts
npx playwright test quality/e2e/simultaneous-validation.spec.ts   # logs every /auth + /pin request/response

# Backend unit/integration + security
npm --prefix backend test
npm --prefix backend run test:security
```

## Index of records

| Date | Topic | Outcome |
|---|---|---|
| 2026-06-19 | [Registration & Auth audit](./2026-06-19-registration-auth-audit.md) | Duplicate-email bug fixed; unit test added; further findings logged |
