# Kanaku — Known Limitations (Beta, 2026-07-19; mobile section added 2026-07-30)

Honest register of what is intentionally partial at beta. None of these block beta;
each has an owner-decision or a post-beta plan.

## 0. Mobile (Android & iOS)

Full detail — including the capability matrix and the outstanding store-submission
items — lives in [MOBILE_RELEASE_GUIDE.md](./MOBILE_RELEASE_GUIDE.md). In short:

- **Voice speech-to-text works on web and Android; iOS is pending.** The plugin
  (`@capacitor-community/speech-recognition`) ships no `Package.swift`, so it does not
  link into the SPM-based iOS project — switching iOS to CocoaPods would fix it, which is
  an owner decision. iOS degrades to the keyboard, as before.
- **SMS auto-detection is Android-only and permanently so** — iOS exposes no SMS inbox
  API. It also ships only in the `full` (sideload) flavor; the Play build is `nosms`
  because Play policy restricts SMS permissions to SMS-first apps.
- **Biometric unlock is implemented** (Face ID / Touch ID / fingerprint) and does not
  bypass the PIN — it unlocks a hardware-stored copy of the PIN that then runs through the
  normal server verification.
- **Push notifications are wired end-to-end but deliver nothing yet** — they need
  `google-services.json`, an Apple APNs key, and `FIREBASE_*` server env. The backend
  pipeline (outbox, FCM sender, retry, dead-token cleanup) already existed; the client
  registration that was missing is now in place.
- **iOS cannot be submitted yet** — but only for want of an Apple account. The app icon
  and splash are now generated from `logo.svg` (`node scripts/gen-app-icons.mjs`); what
  remains is Apple signing secrets (team id, distribution certificate, provisioning
  profile) and the export-compliance declaration. CI builds the simulator target only.
- **The Android toolchain is pinned** to AGP 8.13.0 / Gradle 8.14.3 / JDK 21 and must not
  be bumped ahead of Capacitor 8 — newer AGP fails to configure every plugin module.

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
**Update 2026-07-30:** loan payments and settlements now publish `LOAN_PAYMENT_CREATED`.
The remaining modules turned out **not** to be a wiring job: investments have no
`accountId` column at all, `POST /loans` accepts no account for disbursement, and goals
have no server-side contribution endpoint — so there is no cash account to post against in
any of them. Closing those needs schema and API changes, not publishers. Full analysis and
the pre-enablement checklist: [LEDGER_V2_AND_AA_STATUS.md](./LEDGER_V2_AND_AA_STATUS.md).

## 2. Account Aggregator (Setu) is dormant by design
`/aa` (9 endpoints, 5 tables) is mount-gated behind `ENABLED_MODULES=aa` (Phase 5,
regulated integration). Returns 404 in production until enabled.

**Update 2026-07-30:** the `AA_*` credentials are now declared in the env schema and
reported at startup, escalating to *required* when `ENABLED_MODULES` includes `aa` — a
half-configured AA deploy is visible at boot instead of failing at the first consent call.
Everything else remaining is external (Setu onboarding, encryption key, compliance
sign-off): [LEDGER_V2_AND_AA_STATUS.md](./LEDGER_V2_AND_AA_STATUS.md) §2.

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
