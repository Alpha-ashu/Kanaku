# Kanaku — Test Results (Beta Audit, executed 2026-07-19)

All numbers below are from runs executed during this audit on the Windows dev machine
against the `staging_kanakku` test database (Supabase pgbouncer, session pool = 15).

## Summary

| Gate | Result |
|---|---|
| Backend type-check (`tsc --noEmit`) | ✅ 0 errors |
| Frontend type-check (`tsc --noEmit --skipLibCheck`) | ✅ 0 errors |
| Frontend production build (Vite) | ✅ success |
| Frontend unit tests (vitest) | ✅ **151/151** passed (19 files, 8.5 s) |
| Backend integration suites — individually | ✅ every suite green after audit fixes (details below) |
| Backend full serial run (54 suites, one process) | ⚠️ environmental flakiness — see "Full-run caveat" |
| E2E (Playwright, 17 specs) | last recorded run 2026-07-15: 5/5 expected passed; full suite needs live servers (not run in this audit) |
| Lint | ✅ exit 0 with warnings — 105 errors/571 warnings backend (non-blocking in CI); cleanup tracked in CODE_QUALITY_REPORT |

## Backend integration — audit verification runs

| Suite group | Result |
|---|---|
| financialInvariants (33 invariant tests) | ✅ pass |
| ledgerReconciliation (11) | ✅ pass — after fixing reconcile-engine transfer bug + stale test leg types |
| eventStore | ✅ pass — after adding missing read accessors |
| groupSettlement (6) | ✅ pass |
| platformConsistency (3) | ✅ pass — after factory-reset upsert fix |
| clearData.e2e (factory reset hardening) | ✅ pass |
| migrationSafety (2) | ✅ pass — unblocked by reconcile fix |
| systemIntegrity (3, incl. new non-admin-403 test) | ✅ pass |
| notification-delivery | ✅ pass — after test type fix |
| security + bills-security + goals + loans + auth_comprehensive (109 tests) | ✅ 108 pass; 1 flake = DB pool exhaustion (see below), passes solo |
| debug, recurringBudget, sync-extended, profile-persistence | ✅ pass |

## Fixes made during this audit (all verified by re-running the suite)

**Product code:**
1. `settings.controller.ts` — factory reset crashed (500) for users without a `UserSettings`
   row (`update` → P2025). Now `upsert`. Verified by platformConsistency + clearData.e2e.
2. `admin/reconcile.controller.ts` — reconciliation engine ignored all transfer types when
   computing expected balances (false DRIFT_DETECTED for any user with transfers), and its
   journal-imbalance SQL used a narrower type vocabulary than `/system/integrity`. Now
   transfer-aware (all three type vocabularies) and aligned. Verified by ledgerReconciliation + migrationSafety.
3. `system/integrity.routes.ts` — endpoint restricted to admin role (security F-2).
4. `events/eventStore.ts` — added `getEventsByUser` / `getEventsByAggregate` read accessors.

**Test code:**
5. `notification-delivery.test.ts` — OutboxRow builder missing required `metadata` (TS error).
6. `systemIntegrity.test.ts` — updated to nested `data.ledger.*` response shape; admin token; added 403 regression test.
7. `ledgerReconciliation.test.ts` — transfer legs updated to the hardened
   `transfer_out`/`transfer_in` contract.

## Full-run caveat (environmental, documented — not a product defect)

Running all 54 suites serially in one jest process against the remote staging DB exhausts
the pgbouncer **session-mode pool (15 clients)** — first observed as 19–17 failed suites with
1,590 `EMAXCONNSESSION max clients reached` errors in one log. Every affected suite passes
when run individually or in small batches. Contributing factors: each suite instantiates the
app (own Prisma client), and open handles keep sessions alive ("Jest did not exit…").

**Remediation (tracked in BETA_READINESS_REPORT):**
- CI already runs against a dedicated local Postgres service — unaffected.
- For local full-suite runs: use a local Postgres or a direct (non-pooled) connection with a
  higher limit, e.g. `DATABASE_URL=…:5432/staging_kanakku?connection_limit=5` per worker,
  and add a global teardown that calls `prisma.$disconnect()`.

## How to reproduce

```bash
npm run test            # frontend unit (vitest)
npm run test:backend    # backend jest (needs backend/.env.test → dedicated test DB)
npm run test:security   # security-focused suites
npm run test:e2e        # Playwright (needs dev servers + seeded users)
npm run qa:api-report   # API contract conformance report
```
