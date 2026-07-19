# Kanaku — Security Audit (Beta Release, 2026-07-19)

Scope: full backend source review (auth, RBAC, isolation, input handling, uploads,
headers, rate limits, secrets), frontend auth/token handling, repo hygiene, CI.
Method: manual code review of every route file + middleware, pattern greps, and the
repo's own security test suites (`security.test.ts`, `ai-security.test.ts`,
`bills-security.test.ts`, `auth-role-trust.test.ts`, `pin-gate.test.ts`).

## Verdict

**No unresolved critical or high findings in application code.** One high-severity
repo-hygiene issue (committed credential) was found and remediated during the audit —
**password rotation is still required** (see F-1). One medium API exposure was fixed (F-2).

---

## Findings

### F-1 (HIGH, remediated in repo — ACTION REQUIRED: rotate credential)
`backend/.env.test` was tracked in git containing a real Postgres password for the
`staging_kanakku` database on the **same Supabase cluster/user as production**.
- Remediation done: file untracked (`git rm --cached`), `.gitignore` hardened,
  `backend/.env.test.example` template added.
- **Still required:** rotate the database password in Supabase (the old value remains
  in git history), and consider `git filter-repo` history scrub if the repo is ever shared.
- Related hardening recommendation: both `.env` and `.env.test` use `sslmode=no-verify`;
  switch to verified TLS (`sslmode=require` + CA) for production connections.

### F-2 (MEDIUM, fixed)
`GET /api/v1/system/integrity` (system-wide ledger audit, DB lock counts, worker/memory
state, journal-entry IDs across all tenants) was accessible to **any authenticated user**.
- Fix: now `requireRole('admin')` ([integrity.routes.ts](../../backend/src/features/system/integrity.routes.ts)).
- Regression test added: non-admin → 403 (`systemIntegrity.test.ts`).

### F-3 (LOW, fixed)
Frontend API wrappers pointed at four nonexistent endpoints (`/auth/verify-email`,
`/auth/change-password`, `/goals/:id/contributions`, `POST /reports/export`) — unused, but
an invitation for future 404 wiring. Removed/redirected to real endpoints in
[api.ts](../../frontend/src/lib/api.ts); QA scale-benchmark's `/group-expenses` calls fixed to `/groups`.

### F-4 (LOW, open — deploy-time checklist item)
`GET /metrics` is unauthenticated when `METRICS_TOKEN` is unset (documented behavior for
local dev). **Release checklist requires METRICS_TOKEN in production** (RELEASE_CHECKLIST.md).

### F-5 (INFO, open)
`ACCEPT_SUPABASE_JWT` defaults to true (BFF rollout switch). Once all clients use
backend-issued JWTs, set `ACCEPT_SUPABASE_JWT=false` to shrink the token surface.

### F-6 (INFO, open)
In-memory rate limiting and auth snapshot cache are per-process; under multi-instance
horizontal scaling, limits multiply by instance count. Move to Redis-backed counters
before scaling beyond one API instance.

---

## Control verification matrix

| Threat | Control (verified in code) | Status |
|---|---|---|
| SQL injection | Prisma parameterized queries everywhere; no string-built SQL with user input (raw queries are static aggregates); regression test in `security.test.ts` | ✅ |
| XSS | Global body sanitizer strips HTML/script (app.ts B-4); nonce-based CSP in production (no `unsafe-inline`); React output encoding | ✅ |
| CSRF | Bearer-token auth (no ambient session cookie for API); refresh cookie is HttpOnly + used only by `/auth/refresh`; CORS origin allowlist with credentials | ✅ |
| Clickjacking | `frameAncestors 'none'` (CSP) | ✅ |
| SSRF | No user-supplied URL fetch paths in backend; external calls are fixed-host (SendGrid, Supabase, stock API) behind circuit breakers | ✅ |
| Command injection / RCE | No `child_process` with user input; uploads processed in-memory via sharp/tesseract | ✅ |
| Directory traversal | Uploads stored via `makeStoragePath` (crypto-random names); `/uploads` static serving only; blocked extension list | ✅ |
| JWT manipulation | `jwt.verify` with required secret (prod fails fast without `JWT_SECRET`); refresh tokens rejected for API auth (`type: 'refresh'` check); role/approval **re-read from DB**, never trusted from claims (`auth.ts`, regression-tested in `auth-role-trust.test.ts`) | ✅ |
| Privilege escalation via Supabase metadata | Shadow-user provisioning always creates role `user`, unapproved; elevation only via admin server flows | ✅ |
| Broken auth / session | Login challenge flow, account lockout status check, idle-session timeout (server-side), refresh rotation, per-device sessions with revocation (`/auth/devices`) | ✅ |
| IDOR / cross-tenant | Every repository query scoped `{ userId }` (verified accounts, transactions, goals, loans, bills, todos); shared resources (groups/goals/todo-shares) check creator-or-participant membership; ledger validator enforces `assertAccountOwned` / `assertSameUser`; `bills-security.test.ts` covers foreign `transactionId` | ✅ |
| Mass assignment | zod schemas on mutation bodies (strict field lists); controllers map fields explicitly | ✅ |
| Prototype pollution | JSON body limit 1 MB; sanitizer rebuilds objects key-by-key; no unsafe deep-merge of request bodies found | ✅ |
| Brute force / credential stuffing | Layered rate limits: login, register, OTP, refresh, destructive ops + global 60 rpm/IP in prod; account lock status honored | ✅ |
| Replay | Idempotency keys on financial mutations; OTP single-use with status tracking; webhook HMAC over raw body | ✅ |
| Rate-limit bypass | Keyed by IP + user identity (authenticatedRateLimit) | ✅ (see F-6 for multi-instance caveat) |
| DoS | 1 MB body cap, request timeout middleware, upload size caps (5–10 MB), circuit breakers, connection pool limits | ✅ |
| Sensitive data exposure | Helmet headers, HSTS 2y preload, `x-powered-by` disabled, minimal public health probe, error handler hides internals, PII-drop migration (`20260708_drop_user_pii`), field encryption module (`security/crypto.ts`), log redaction of session IDs | ✅ |
| Open redirect | No redirect endpoints taking user URLs | ✅ |
| Header/log injection | Request/correlation/session IDs format-validated (`^[A-Za-z0-9_-]{8,128}$`) before echo/log | ✅ |

## Input validation

Three layers verified: (1) frontend form validation; (2) backend zod schemas per route
(`<module>.validation.ts`, 37 modules) + global sanitizer; (3) database constraints
(Decimal types for money, unique constraints, FK integrity, enum types for ledger fields).
Backend never trusts frontend validation — all mutation routes revalidate.

## Security testing

`npm run test:security` (security, ai-security, bills-security) — passing in isolated runs;
see [TEST_RESULTS.md](TEST_RESULTS.md). CodeQL workflow active in CI.
