# Kanaku — Known Limitations (Beta, 2026-07-19)

Honest register of what is intentionally partial at beta. None of these block beta;
each has an owner-decision or a post-beta plan.

## 1. Double-entry Ledger V2 is partially wired (most important)
The full double-entry machinery exists and is tested (journal entries, invariant validator,
event dispatcher/store, snapshots, reconciliation, integrity audit) **but**:
- Event publishers are wired **only in the groups module** (expense created / settlement
  completed). Subscribers for goals/loans/investments exist with no publishers yet.
- The whole path is gated by `LEDGER_V2_ENABLED`, which is **not set in any tracked deploy
  config** — decide explicitly whether beta ships with it on (groups get journal entries)
  or off (pure single-entry).
- The **live** money path used by every module is the hardened single-entry engine
  (atomic transactions, row-lock balance updates, no-overdraw invariant, idempotency,
  Decimal math) — financial correctness does not depend on V2.
**Plan:** publish events from goals/loans/investments/transactions post-beta, then enable
V2 per-module via its existing sub-flags, using `migrationSafety` backfill for history.

## 2. Account Aggregator (Setu) is dormant by design
`/aa` (9 endpoints, 5 tables) is mount-gated behind `ENABLED_MODULES=aa` (Phase 5,
regulated integration). Returns 404 in production until enabled.

## 3. Test-infra: full-suite runs against remote staging DB are flaky
54-suite serial runs exhaust the pgbouncer session pool (15 clients). Every suite passes
individually; CI uses a local Postgres and is unaffected. Plan in TEST_RESULTS.md.

## 4. Single-instance assumptions
In-memory rate limits / auth-snapshot cache / Socket.IO rooms are per-process. Fine for the
current single-instance deployment; before scaling to N instances: Redis-backed rate
limiting, Socket.IO Redis adapter. (Response cache is already Redis-ready.)

## 5. Response-cache staleness window (cross-device only)
Cached GET reads can be ≤ TTL (30–180 s) stale on *other* devices between syncs; the acting
device is always fresh (offline-first writes + sync/socket events). Post-beta: explicit
invalidation on mutation (PERFORMANCE_REPORT §4).

## 6. Partial dark mode & a11y automation
Dark variants exist in ~14 live components (light-first product). No automated
accessibility (axe) or firefox/webkit E2E projects yet — backlog with TEST_PLAN gaps.

## 7. Legacy frontend tree pending deletion
133 unreachable modules (`src/pages/**`, legacy services) — no runtime effect (tree-shaken);
deletion PR planned with test relocation (CODE_QUALITY_REPORT Q-1).

## 8. Ops caveats
- Render free tier sleeps; external uptime ping is load-bearing for latency SLOs.
- `/metrics` is open when `METRICS_TOKEN` is unset — the release checklist makes setting it
  mandatory in production.
- Lint is non-blocking in CI until the Q-2 cleanup lands.
- Credential exposed in git history must be rotated (SECURITY_AUDIT F-1) — **do before beta**.

## 9. Voice / OCR accuracy
Voice commands and receipt OCR are heuristic (tesseract + parsers with per-merchant
strategies); review screens (VoiceReview, import confirm) put a human in the loop by design.
