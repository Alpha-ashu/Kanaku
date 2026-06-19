# Sprint Plan — 2026-07 · Security Hardening & Reliability Follow-ups

> **Status:** Planned (next sprint)
> **Owner:** Backend + Frontend
> **Created:** 2026-06-19
> **Precedence:** Law → Terms → `KANAKU_PROJECT_OVERVIEW.md` → `docs/RULEBOOK.md` → skill docs → this plan
> **Context:** Follow-up to the 2026-06-19 hardening drop (see `KANAKU_PROJECT_OVERVIEW.md` §A1).
> This sprint resolves the remaining items surfaced during the onboarding-500 / SQL-injection / AI-insights investigation.

---

## 1. Sprint Goal

Close out the security and reliability backlog from the onboarding incident:

1. Remediate the **21 Dependabot vulnerabilities** (10 high · 6 moderate · 5 low) on `main`.
2. Verify the shipped onboarding/profile/AI fixes in staging with regression coverage.
3. Reduce client API chatter at the **data-hook** level (not just the HTTP client).
4. Tighten **access-token hygiene** (the "bearer token" concern).
5. Extend **AI-insight test coverage** so insights are provably grounded in declared financials.

**Definition of Done (sprint):** every task below meets its acceptance criteria, `npm audit` shows 0 high/critical, all test suites green, docs updated, and a staging smoke pass is recorded.

---

## 2. Already Shipped (2026-06-19) — context, do **not** redo

| Area | Change | File(s) |
|---|---|---|
| Profile 500 | Clamp salary to `Decimal(12,2)` + `updateProfileSchema` zod validation on `PUT /auth/profile` | `auth.service.ts`, `auth.validation.ts`, `auth.routes.ts` |
| SQL-injection | `containsSqlInjection()` guard applied to profile + account fields | `sanitize.ts`, `account.validation.ts` |
| Money authority | Clamp `monthlyBudget` in settings blob | `settings.controller.ts` |
| AI insights | Declared-income + balance baseline; months-of-runway; DTI no longer misreports 1.00 | `ai/financial-baseline.ts`, `ai/agents.ts` |
| Client requests | Short-TTL GET response cache, flushed on mutations | `frontend/src/lib/api.ts` |
| Tests | Input-hardening unit tests | `auth/input-hardening.test.ts` |

---

## 3. Backlog

### KAN-S1 — Dependabot / CVE remediation (Priority: **High**)

**Problem:** GitHub reports 21 vulnerabilities on `main`. Direct dependencies (pinned latest)
are clean (verified 2026-06-19), so the alerts are **transitive**. The repo already pins many
fixes via `backend/package.json` → `overrides`; this task closes the remaining gaps.

**Tasks**
1. Generate the authoritative list:
   ```powershell
   cd backend ; npm audit --json > ../audit-backend.json ; npm audit
   cd ../frontend ; npm audit --json > ../audit-frontend.json ; npm audit
   ```
2. Cross-reference with the GitHub Dependabot tab:
   `https://github.com/Alpha-ashu/Kanaku/security/dependabot`.
3. For each advisory:
   - If a **direct** dep → bump to the patched minor/patch range.
   - If **transitive** → add/raise the pin in the `overrides` block (backend) or
     `resolutions`/`overrides` (frontend) to the minimum fixed version.
4. Re-run `npm install` + `npm audit` until **0 high/critical** remain; document any
   accepted moderate/low with justification.
5. Run full backend + frontend test suites to confirm no breakage from the bumps.

**Acceptance Criteria**
- `npm audit` (both packages) → 0 high, 0 critical.
- Dependabot open alert count reduced to documented residual only.
- All tests green; app boots in staging.
- `overrides`/`resolutions` additions commented with the advisory ID.

**Risk:** Major-version transitive bumps can break builds → pin to the **minimum** fixed
version, not `latest`. Test each batch.

---

### KAN-S2 — Verify shipped fixes in staging + regression coverage (Priority: **High**)

**Tasks**
1. Deploy `main` to staging.
2. Manual onboarding pass with an **oversized salary** (e.g. `100000000000`) → must return
   **400 VALIDATION_ERROR** (not 500), and a normal salary must persist and reflect after login.
3. Attempt SQL-ish input in salary / location / bank name / account name → rejected with 400.
4. Confirm AI insights for a funded-but-transaction-less user show a non-trivial health score,
   `DTI 0.00` (no loans), and an EMI suggestion derived from declared income.
5. Add an **integration test** `tests/integration/profile-overflow.test.ts`:
   - oversized salary → 400
   - SQL-injection in `firstName` / account `name` → 400
   - valid onboarding payload → 200 and round-trips on `GET /auth/profile`.

**Acceptance Criteria**
- New integration test passes (and degrades gracefully when DB is unavailable, matching the
  existing `if (!token) return;` pattern).
- Staging smoke checklist recorded in the PR.

---

### KAN-S3 — Reduce API chatter at the data-hook layer (Priority: **Medium**)

**Problem:** The HTTP client now de-dups + short-caches GETs, but components still each fetch
on mount. The network log showed `/ai/insights`, `/accounts`, `/notifications`,
`/auth/profile` firing repeatedly across route changes.

**Tasks**
1. Audit `frontend/src/hooks/` (`useApi`, `useRealtime`, etc.) and the Dashboard/Accounts/
   Transactions screens for redundant fetch-on-mount.
2. Introduce a lightweight shared query cache (either expand the `api.ts` response cache
   allowlist, or adopt a `useQuery`-style hook with `staleTime`) so revisiting a screen within
   the session reuses cached data and only refetches on:
   - explicit user refresh,
   - a relevant realtime/socket delta event,
   - or cache expiry.
3. Ensure realtime updates stay **user-scoped and delta-based** (per offline-first guardrails).
4. Measure before/after request counts on a cold load + 3 navigations.

**Acceptance Criteria**
- Cold-load + 3 navigations request count reduced ≥ 50% vs. baseline (target: no duplicate
  GET to the same endpoint within a navigation unless data changed).
- No stale data after a create/update/delete (cache invalidation verified).

---

### KAN-S4 — Access-token hygiene (the "bearer token" concern) (Priority: **Medium**)

**Context:** The Supabase JWT is *signed* (ES256), not encrypted — decoding the claims is
expected, not a leak. No secrets are in it, it is sent over HTTPS, and the refresh token is
already an HttpOnly cookie. This task reduces the blast radius further.

**Tasks**
1. Confirm/shorten the **access-token TTL** (target ≤ 15–30 min) with silent refresh
   (refresh path already exists in `api.ts`).
2. Verify no access token is persisted to `localStorage` in production paths; prefer the
   in-memory store + Supabase session (audit `TokenManager`).
3. Confirm backend rejects tokens with `role`/`isApproved` escalation by always re-loading the
   user on refresh (already done in `refreshToken`) — add a regression test.
4. Document the token model in `docs/02_Technical_Requirement_Document_TRD/` (signed-not-secret,
   TTLs, refresh rotation, HttpOnly cookie).

**Acceptance Criteria**
- Access-token TTL documented and enforced.
- Regression test proves a stale-role token cannot retain elevated access after a role change.
- No JWT written to non-essential storage keys in prod.

---

### KAN-S5 — AI-insight grounding test coverage (Priority: **Low/Medium**)

**Tasks**
1. Add unit tests for `ai/financial-baseline.ts` (mock Prisma):
   - transactions present → `incomeSource: 'transactions'`.
   - no transactions, declared salary present → `incomeSource: 'declared'`, monthly = salary/12.
   - account balances summed correctly across active, non-deleted accounts.
2. Add tests for `runFinancialHealthScoreAgent` and `runLoanApprovalAgent` asserting:
   - declared income lifts the health score above the empty-state floor,
   - DTI = `0.00` when no loans and no income history,
   - suggested EMI ≈ 30% of resolved monthly income.

**Acceptance Criteria**
- New AI unit tests pass without a live DB (Prisma mocked).
- Coverage for `ai/` agents does not regress below the 60% global threshold.

---

## 4. Suggested Sequencing

```
Day 1–2   KAN-S1 (CVE remediation)  ──►  KAN-S2 (staging verify + regression)
Day 3     KAN-S5 (AI unit tests)    ──►  KAN-S4 (token hygiene)
Day 4–5   KAN-S3 (hook-layer request reduction + measurement)
Day 5     Docs update + sprint review + staging smoke sign-off
```

---

## 5. Commands Cheat-Sheet

```powershell
# Audit
cd backend  ; npm audit
cd ../frontend ; npm audit

# Backend tests
cd backend ; npm test
npm run test:security
npm run test:coverage

# Frontend
cd frontend ; npm run type-check ; npm run test:unit

# Type-check backend without emit
cd backend ; npx tsc --noEmit -p tsconfig.json
```

---

## 6. Definition of Done (Rulebook §9 alignment)

- [ ] `npm audit` clean (0 high/critical) on backend + frontend.
- [ ] All changed/new `/api/v1` routes carry zod validation middleware.
- [ ] Monetary logic remains server-authoritative; balance/transaction coupling uses DB transactions.
- [ ] Ownership checks enforced on every read/write touched.
- [ ] No new `any` in changed TypeScript.
- [ ] Dexie ↔ cloud sync parity unaffected; offline-first write path intact.
- [ ] Tests green (unit + integration + security); staging smoke recorded.
- [ ] `KANAKU_PROJECT_OVERVIEW.md` and this sprint doc updated with outcomes.

