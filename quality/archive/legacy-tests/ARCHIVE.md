# Legacy tests — archive

These files were retired when the Application Validation & Quality Framework was
consolidated under `quality/` + `docs/api/`. They are kept here for historical
reference only. **Nothing in this folder is on the active test or CI path**, and
none of it should be revived as-is.

If you need the behaviour they covered, use the maintained replacements:

| Archived | Was | Use instead |
|---|---|---|
| `runners/ENTERPRISE_TEST_SUITE.cjs` | ad-hoc full-stack smoke runner | `npm run qa:api-report` (API) + `npm run test:e2e` (UI) |
| `runners/PRODUCTION_100_PERCENT_TEST_SUITE.cjs` | "100% pass" smoke runner | `npm run qa:api-report` + `npm run qa:regression` |
| `runners/PRODUCTION_READY_TEST_SUITE.cjs` | release smoke runner | `npm run qa:api-report` + `npm run qa:regression` |
| `runners/test-runner.js`, `runners/test-runner-simple.js` | hand-rolled HTTP runners | `quality/api/runner/run-api-report.mjs` |
| `manual/*.html` (`debug-auth`, `test-crypto-fix`, `test-onboarding`, `test-suite`) | browser debug pages | `quality/e2e/` Playwright specs |
| `manual/test-auth.js`, `manual/test-supabase-console.js`, `manual/verify-realtime.js` | console snippets | `quality/api/e2e/` specs / `quality/scenarios/` |

## ⚠ Security note — hardcoded credentials

The archived `runners/*` scripts **hardcode a real account's email, password, and
PIN** (e.g. `PRODUCTION_100_PERCENT_TEST_SUITE.cjs`). That was one reason to pull
them off the active path. Two follow-ups (out of scope for the archival itself):

1. **Rotate** the credentials that appear in these files — assume they are compromised.
2. Never hardcode credentials in test runners. The maintained runner registers a
   fresh, isolated QA user every run (`quality/api/runner/run-api-report.mjs`), or
   reads `QA_EMAIL` / `QA_PASSWORD` from the environment.

_Archived 2026-06-20._
