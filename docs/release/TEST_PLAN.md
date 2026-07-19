# Kanaku — Test Plan (Beta)

Central test hub: [quality/](../../quality/) (see `quality/TEST_LAYOUT.md`). This plan maps
every required test category to its concrete implementation and run command.

| Category | Implementation | Command | Status |
|---|---|---|---|
| Unit (frontend) | 19 vitest files: api client, login flow, sync, aggregation, OCR/receipt/voice parsers, strategies | `npm run test` | ✅ active, 151 tests |
| Unit/Integration (backend) | 54 jest suites in `quality/backend/tests/integration` — every module + auth + RBAC + ledger | `npm run test:backend` | ✅ active, 762 tests |
| API contract | 261 machine contracts + `qa:api-report` expected-vs-actual runner; OpenAPI snapshot diff (`apiContract.test.ts`) | `npm run qa:api-report` | ✅ active (contract descriptions being backfilled) |
| Security | `security.test.ts` (SQLi/XSS/authz), `ai-security`, `bills-security`, `auth-role-trust`, `pin-gate` + CodeQL in CI | `npm run test:security` | ✅ active |
| Financial invariants | `financialInvariants` (33 asserts), `ledgerReconciliation`, `groupSettlement`, `eventStore`, `balance-engine`, `systemIntegrity` | `npm run test:backend` | ✅ active |
| E2E UI | 17 Playwright specs (registration, loans, groups, investments, goals, transactions, todos, power-user, advisor flows, auto-lock, regression POM) | `npm run test:e2e` | ✅ active (needs dev servers + `npm run e2e:seed`) |
| Regression | `regression.test.ts` + `09-pom-regression.spec.ts` + `qa:regression` diff runner | `npm run test:regression` / `qa:regression` | ✅ active |
| Performance / load | `quality/performance/benchmark.cjs` (SLA-gated) + `scale_benchmark.cjs` (seed → read/write bench → concurrency → integrity) | `node quality/performance/scale_benchmark.cjs` | ✅ active |
| Stress / concurrency | `quality/database/concurrency-test.cjs` (parallel writes, lock detection) + scale-benchmark concurrency phase | direct node | ✅ active |
| Recovery / chaos | `quality/database/disaster_recovery.cjs` (backup → corrupt → restore → reconcile) + `backup-validation.cjs` | direct node | ✅ active |
| Database integrity | `ledger-integrity-check.cjs`, `index_audit.sql`, `migrationSafety.test.ts` | direct node / jest | ✅ active |
| Smoke / sanity | `smoke.test.ts`, `sanity.test.ts` | `npm run test:smoke` / `test:sanity` | ✅ active |
| Accessibility | not automated yet | — | ⚠ gap: add axe-core pass to Playwright (post-beta backlog) |
| Cross-browser | Chromium only in Playwright config | — | ⚠ gap: add firefox/webkit projects (post-beta backlog) |
| Responsive | 1280×800 viewport + manual matrix (`quality/manual/`) | — | ⚠ partial: add mobile-viewport Playwright project |

## Environments

| Env | Database | Used by |
|---|---|---|
| CI (GitHub Actions) | disposable Postgres 16 service container | backend unit subset, frontend vitest, lint, type-check, CodeQL, feature matrix |
| Local integration | `backend/.env.test` → **dedicated** test DB (never production; template in `.env.test.example`) | full jest suite |
| E2E | local dev servers (`npm run dev`) + seeded users | Playwright |

## Release gating (see RELEASE_CHECKLIST.md)

Blocking: type-checks, frontend build, backend integration suites, security suites,
financial-invariant suites, contract audit without missing-endpoint findings.
Non-blocking but tracked: lint warnings, accessibility/cross-browser gaps, full-suite
pool-exhaustion caveat (TEST_RESULTS.md).
