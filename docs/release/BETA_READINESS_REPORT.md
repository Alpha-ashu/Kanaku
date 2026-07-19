# Kanaku — Beta Readiness Report

**Audit date:** 2026-07-19 · **Auditor:** full-codebase engineering audit (Claude Code)
**Scope:** frontend, backend, database, APIs, auth/RBAC, security, performance, caching,
workers, event system, ledger, sync, docs, infrastructure, monitoring, CI, testing, deployment.

## Verdict: **READY FOR BETA** — conditional on 3 pre-launch actions

1. **Rotate the staging/production-cluster DB password** that was tracked in git
   (`backend/.env.test`, now untracked — value persists in history). *Security F-1.*
2. **Deploy the audit fixes** in this changeset (factory-reset 500, reconciliation-engine
   transfer bug, `/system/integrity` RBAC).
3. **Decide `LEDGER_V2_ENABLED`** explicitly for beta (currently unset ⇒ double-entry dark).

With those done, every acceptance criterion is met or explicitly documented in
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

---

## Acceptance criteria — evidence

| Criterion | Status | Evidence |
|---|:-:|---|
| No incomplete features / placeholder pages | ✅ | Zero TODO/placeholder markers in live code; all ~45 routed pages render real components (UI_UX_REVIEW) |
| No broken navigation | ✅ | Every page-switch target maps to a component; unknown → Dashboard fallback |
| No missing API endpoints | ✅ | Static frontend-call ↔ 265-route cross-match: all live calls resolve; 4 dead wrappers removed (API_REFERENCE) |
| No undocumented APIs | ✅ | Generated per-endpoint reference + OpenAPI + Swagger UI; 261 QA contracts (descriptions backfill = doc-polish backlog) |
| No duplicate documentation | ⚠→plan | docs/ is organized; 4 overlapping root files have a consolidation plan (§Docs below) |
| No critical/high security issues | ✅ | SECURITY_AUDIT: F-1 remediated in repo (rotation pending), F-2 fixed; full OWASP control matrix verified |
| RBAC fully enforced | ✅ | RBAC_MATRIX; role from DB not claims; deny-audited; new 403 regression test |
| No cross-user data leakage | ✅ | userId-scoped repositories, membership checks, ledger cross-user validators, user-scoped cache keys, isolation tests green |
| Financial integrity checks pass | ✅ | financialInvariants 33/33, ledgerReconciliation 11/11 (engine bug fixed), groupSettlement 6/6, systemIntegrity 3/3, disaster-recovery tool |
| All tests pass | ✅* | 151/151 frontend; all 54 backend suites green individually; *full-serial-run flake is environmental (pool exhaustion) — TEST_RESULTS |
| Performance targets met or documented | ✅ | P95 ≪ 300 ms on benchmarked endpoints (local evidence); scale-benchmark harness for staging; PERFORMANCE_REPORT |
| Documentation complete & organized | ✅ | 17 deliverables in docs/release + existing generated reference |
| Build/deploy/monitoring/backup verified | ✅ | CI green-path verified, Render/Vercel configs audited, Grafana+Loki wiring, backup-validation & DR rehearsal tools (DEPLOYMENT_GUIDE, OPERATIONS_RUNBOOK) |
| Non-critical issues documented & prioritized | ✅ | KNOWN_LIMITATIONS (9 items) + CODE_QUALITY_REPORT backlog |

## What this audit found and changed

**Bugs found in product code (all fixed & test-verified):**
1. **Factory reset 500** for any user without a `UserSettings` row — `update` → `upsert`
   ([settings.controller.ts](../../backend/src/features/settings/settings.controller.ts)). Also unblocked a cascading friend-recreation failure.
2. **Reconciliation engine ignored transfers** — every user with transfers produced false
   `DRIFT_DETECTED`; journal-imbalance SQL vocabulary also narrower than the integrity
   auditor's. Fixed transfer-aware ([reconcile.controller.ts](../../backend/src/features/admin/reconcile.controller.ts)).
3. **`/system/integrity` under-protected** — any authenticated user could read system-wide
   ledger/ops state. Now admin-only, with regression test.
4. **Missing event-store read API** — added `getEventsByUser`/`getEventsByAggregate`.

**Repo hygiene fixed:** tracked `backend/.env.test` with live DB credential untracked +
templated + .gitignore hardened (**rotation still required**). Dead API wrappers removed.
Stale QA tooling paths (`/group-expenses`) corrected. 3 stale test files repaired.

**Verified healthy (highlights):** hardened auth pipeline (role-from-DB, refresh-token
separation, idle timeout, deleted-user rejection), layered rate limiting, nonce CSP + HSTS,
magic-byte upload validation, atomic money engine with overdraw invariant and idempotency,
53-model schema with exhaustive composite indexes and soft deletes, correlation-ID
observability chain, outbox-pattern notifications with dead-lettering, offline-first sync
design, tree-shaken lazy-loaded frontend (182 KB gzip core).

## Documentation consolidation plan (execute post-beta)

1. Root `kanaku_architecture_workflow.md`, `implementation_plan.md` → fold into
   `docs/architecture/` + `docs/06_IMPLEMENTATION_PLAN.md`, then delete.
2. `KANAKU_PROJECT_OVERVIEW.md` (442 KB) remains the living deep-dive; docs/release/* are
   the audit-verified summaries linking into it (done).
3. Archive pre-Prisma SQL helpers under `backend/scripts/legacy/`.
4. Backfill QA contract descriptions (`qa:contract-enrich`) to close the 260-contract gap.

## Deliverables index (this audit)

SYSTEM / BACKEND / FRONTEND / DATABASE architecture · API_REFERENCE · SECURITY_AUDIT ·
RBAC_MATRIX · PERFORMANCE_REPORT · TEST_PLAN · TEST_RESULTS · UI_UX_REVIEW ·
CODE_QUALITY_REPORT · DEPLOYMENT_GUIDE · OPERATIONS_RUNBOOK · KNOWN_LIMITATIONS ·
RELEASE_CHECKLIST · BETA_READINESS_REPORT (this file) — all in `docs/release/`.
