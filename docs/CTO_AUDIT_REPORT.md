# Kanaku — CTO Gap Audit & Action Plan
**Date:** 2026-06-19
**Auditor:** Acting CTO review
**Scope:** Full-stack fintech production readiness

---

## 0. Executive Summary

Kanaku is an unusually mature pre-production codebase for a personal-finance / expense-tracker app. The architecture (Express + Prisma + Postgres + Redis + Dexie + Capacitor + Setu AA + Supabase Auth + Socket.IO + Tesseract/Gemini hybrid OCR) is sound and the documentation in `KANAKU_PROJECT_OVERVIEW.md` is exceptional.

However, several **fintech-grade** controls that the docs **claim** are in place were **not actually implemented** in code. This audit closes the highest-severity of those gaps in code (Phases 1 & 2) and lists the remaining gaps that need to be addressed before public launch (Phases 3–4).

### Severity legend
- 🔴 **CRITICAL** — money / security / data-loss risk
- 🟠 **HIGH** — production reliability / compliance
- 🟡 **MEDIUM** — best practices / DX
- 🟢 **LOW** — polish / nice-to-have

---

## 1. What I Fixed in This Session (Phase 1 — code merged)

| # | Gap | Severity | Fix |
|---|---|---|---|
| 1 | No `Idempotency-Key` middleware (docs claim it exists). Network retry of POST `/transactions` could double-debit accounts. | 🔴 CRITICAL | New `backend/src/middleware/idempotency.ts` — Redis-backed, replays 2xx responses, rejects key reuse with different body (HTTP 409), fails open if Redis is down. Wired into POST `/transactions`, POST `/transactions/bulk`, POST `/loans/:id/payment`, POST `/loans`, POST `/goals`, POST `/goals/:id/members`. |
| 2 | `/health` leaked raw DB error messages + stack codes to unauthenticated callers (info disclosure). | 🔴 CRITICAL | `/health` reduced to `{ status, timestamp }`. New authenticated `/api/v1/health/deep` returns boolean `connected/error` + safe code only. |
| 3 | No request timeout — a stuck DB query can hold an Express worker forever, eventually causing a denial of service. | 🟠 HIGH | New `backend/src/middleware/timeout.ts`; 30 s prod / 60 s dev default, configurable via `REQUEST_TIMEOUT_MS`. Wired immediately after request-ID stamping. |
| 4 | Winston logger had **no PII / secret redaction**. Any `logger.info({ body })` would leak passwords, PINs, OTPs, JWTs, refresh tokens. | 🔴 CRITICAL | New `backend/src/utils/redact.ts` (deep redaction by key + token-shape heuristic) + new `redactFormat()` wired into `backend/src/config/logger.ts` so **every** structured log record is scrubbed before serialization. |
| 5 | `POST /api/v1/transactions/bulk` was referenced by the Voice flow (G.4) and listed in the API index, but **did not exist**. | 🟠 HIGH | New `transactionBulkCreateSchema` (zod, max 100 items), `transactionService.createTransactionsBulk` (per-item failure isolation, partial-success 207), new controller `createTransactionsBulk`, route mounted with idempotency. |

### Files touched

```
backend/src/middleware/idempotency.ts                (new)
backend/src/middleware/timeout.ts                    (new)
backend/src/utils/redact.ts                          (new)
backend/src/config/logger.ts                         (redact format)
backend/src/app.ts                                   (timeout, locked /health, deep /health route)
backend/src/features/transactions/transaction.routes.ts       (idempotency, bulk route)
backend/src/features/transactions/transaction.controller.ts   (bulk controller)
backend/src/features/transactions/transaction.service.ts      (bulk service)
backend/src/features/transactions/transaction.validation.ts   (bulk schema)
backend/src/features/loans/loan.routes.ts            (idempotency on create + payment)
backend/src/features/goals/goal.routes.ts            (idempotency on create + member-add)
docs/CTO_AUDIT_REPORT.md                             (this file)
```

No new dependencies were installed. All compile clean (`get_errors` returned zero).

---

## 1b. Phase 2 — Code merged in this session

| # | Gap | Severity | Fix |
|---|---|---|---|
| 7 | **C1 — Monetary precision**: `transaction.service.ts` used `Number()` + `Math.round(x*100)/100` which loses precision at scale and accumulates IEEE-754 error. | 🔴 CRITICAL | New `backend/src/utils/money.ts` (`parseMoney`, `add`, `sub`, `neg`, `roundMoney`, `serializeMoney`, `sum`) — `Prisma.Decimal` end-to-end. `transaction.service.ts`, `transaction.repository.ts` refactored to operate on `Map<string, Prisma.Decimal>` deltas. |
| 8 | **C2 — JWT secret fallback** silently allowed `SUPABASE_JWT_SECRET` to verify custom-issued tokens. | 🔴 CRITICAL | `backend/src/config/env.ts` now **hard-fails** boot in production without `JWT_SECRET`. `backend/src/middleware/auth.ts` no longer falls back to Supabase secret in production. Outside prod the fallback is preserved for local dev. Env validation also throws on missing/invalid AA root key in production. |
| 9 | **C4 — Audit logs were file-only**: `auditLogger.ts` only emitted Winston lines; the existing `AuditLog` Prisma model was unused. SOC-2 / RBI need durable rows. | 🔴 CRITICAL | `auditLogger.ts` rewritten — every `audit()` call now (a) logs Winston, (b) fire-and-forgets a row into the `AuditLog` model with PII-redacted `details`. New `auditFromRequest(req, event, extras)` helper auto-extracts userId/IP/UA. Expanded `AuditEventType` enum to cover admin, GDPR, AA, webhook-tampering events. |
| 10 | **C5 — AA data at rest had no encryption helper.** | 🔴 CRITICAL | New `backend/src/security/crypto.ts` — AES-256-GCM with per-user DEK derived via HKDF-SHA-256 from `AA_ENCRYPTION_ROOT_KEY` env. Self-describing payload format (`version|iv|tag|ciphertext`, base64), AAD support to bind ciphertext to (userId, recordId). Throws clear errors if root key missing. Wire AA services to call `encryptForUser` / `decryptForUser` before persist/read. |
| 11 | **H9 — Webhook signature verification** had no shared primitive — each handler would have rolled its own with risk of timing-attack bugs. | 🟠 HIGH | New `backend/src/security/webhookSignature.ts` — `verifyWebhookSignature(req, secret, opts)` with constant-time HMAC comparison, version-agnostic algorithm selection (sha1/256/512), encoding-agnostic (hex/base64), `extract` callback for vendor-specific prefixes (Stripe's `t=...,v1=...`). Env now declares `WEBHOOK_SETU_SECRET`, `WEBHOOK_RESEND_SECRET`, `WEBHOOK_MSG91_SECRET`. |
| 12 | **H3 — CSP was static** with `'unsafe-inline'` even in production. | 🟠 HIGH | `app.ts` now generates a per-request nonce, exposes it as `res.locals.cspNonce`, and switches CSP to `'nonce-${nonce}'` in production. Adds `defaultSrc 'self'`, `objectSrc 'none'`, `frameAncestors 'none'`, `baseUri 'self'`, `formAction 'self'`, explicit HSTS (2y, includeSubDomains, preload), `referrerPolicy: strict-origin-when-cross-origin`. |
| 13 | **H2 — No metrics endpoint** despite docs claiming Fly/Vercel observability. | 🟠 HIGH | New `backend/src/middleware/metrics.ts` — per-route counters, status-class breakdown, p50/p95/p99 latency (1024-sample reservoir), in-flight gauge. Wired as global middleware. New `GET /api/v1/health/metrics` (admin-only via `requireRole`) returns request metrics + cache metrics + circuit-breaker state. Shape is Prom-compatible for easy `prom-client` swap-in. |
| 14 | **H6 — No GDPR account-delete** endpoint. | 🟠 HIGH | New `settings.gdpr.controller.ts` — `DELETE /api/v1/settings/account` does a **30-day soft-delete** (status → `pending_deletion`), revokes all refresh tokens, blocks admin self-delete, returns `scheduledFor` so UI can show grace banner. `POST /api/v1/settings/account/cancel-deletion` reverts within the grace window. Audit-logged. |
| 15 | **H7 — No GDPR data-export** endpoint. | 🟠 HIGH | `GET /api/v1/settings/export` — consistent snapshot via `prisma.$transaction([...])` across **20 user-scoped tables**, sanitizes password hashes, streams as `application/json` with download disposition. Rate-limited to 5/hour. Audit-logged with row counts. |
| 16 | **C3 (foundation) — Refresh tokens in localStorage** vulnerable to XSS exfiltration. | 🔴 CRITICAL (partial) | New `backend/src/security/refreshCookie.ts` — `setRefreshCookie/clearRefreshCookie/readRefreshCookie` for `HttpOnly; Secure; SameSite=Strict` cookies scoped to `/api/v1/auth`. Frontend `apiClient` now sends `credentials: 'include'` so cookies travel. **Still TODO**: wire `auth.controller.login/refresh/logout` to actually set/clear the cookie instead of returning the refresh token in the body. |
| 17 | **H4 — No Dexie schema-version guard** between client and server. | 🟠 HIGH | Frontend `frontend/src/lib/syncSchemaGuard.ts` polls `/api/v1/sync/meta` on boot + every 15 min. If local schema < server's `minSupportedClientVersion`, halts sync and shows a non-dismissable "Reload required" toast. Backend `sync.routes.ts` adds public `GET /meta` returning `{ schemaVersion, minSupportedClientVersion, serverTime }`. |
| 18 | **Frontend — `Idempotency-Key` was never sent** so the new backend middleware would have been dormant for the existing app. | 🔴 CRITICAL | `frontend/src/lib/api.ts` `HTTPClient.request` now auto-injects `Idempotency-Key` for every `POST/PUT/PATCH/DELETE`. Callers can pass `idempotencyKey: '<dexie clientId>'` for true replay safety on local-first writes, or `idempotencyKey: null` to opt out. Auto-generated keys use `crypto.randomUUID()` with a v4 polyfill fallback. |

### Files touched (Phase 2)

```
backend/src/utils/money.ts                                  (new)
backend/src/security/crypto.ts                              (new)
backend/src/security/webhookSignature.ts                    (new)
backend/src/security/refreshCookie.ts                       (new)
backend/src/middleware/metrics.ts                           (new)
backend/src/features/settings/settings.gdpr.controller.ts   (new)

backend/src/config/env.ts                                   (prod JWT_SECRET + AA key + webhook secrets + REQUEST_TIMEOUT_MS + cookie config)
backend/src/middleware/auth.ts                              (no SUPABASE fallback in prod)
backend/src/utils/auditLogger.ts                            (DB persistence + auditFromRequest helper + extended event enum)
backend/src/app.ts                                          (nonce CSP, HSTS, metrics middleware + endpoint, crypto.configured in health)
backend/src/features/transactions/transaction.service.ts    (Decimal arithmetic)
backend/src/features/transactions/transaction.repository.ts (Prisma.Decimal deltas)
backend/src/features/settings/settings.routes.ts            (mount /export, /account, /account/cancel-deletion)
backend/src/features/sync/sync.routes.ts                    (public GET /meta)

frontend/src/lib/api.ts                                     (auto Idempotency-Key + credentials: include)
frontend/src/lib/syncSchemaGuard.ts                         (new)
```

All 25 touched files compile clean (`get_errors` returned zero). Zero new npm dependencies — everything uses primitives already in the lockfile (`crypto`, `Prisma.Decimal`, `winston`, `ioredis`, `helmet`, `jsonwebtoken`).

---

## 2. Remaining Gaps (Phase 3 — implement before public launch)

> Items already shipped in Phase 1 & Phase 2 have been removed from this list. The remainder is what still needs human attention.

### 🔴 CRITICAL

| # | Gap | File / Area | Recommended fix |
|---|---|---|---|
| C3 (finish) | Refresh-token cookie wiring — Phase 2 added the helpers but the **auth controller still issues/consumes refresh tokens via JSON body / `x-refresh-token` header**. Until that switches, `localStorage` remains exposed. | `backend/src/features/auth/auth.controller.ts` + `frontend/src/lib/api.ts` (`auth.login`, `auth.refresh`, `auth.logout`) | On `/auth/login` success: call `setRefreshCookie(res, refreshToken, 7*24*60*60)` and **omit** `refreshToken` from response body. On `/auth/refresh`: read via `readRefreshCookie(req)` instead of header. On `/auth/logout`: `clearRefreshCookie(res)`. On the frontend: stop calling `TokenManager.setRefreshToken` and delete the localStorage refresh keys on next migration. |
| C5 (apply) | Crypto helper exists (`security/crypto.ts`) but the **AA service still persists plaintext** in `AaFinancialData` / `AaTransaction`. | `backend/src/features/aa/*` | Wherever AA payloads are written, replace `data: { payload }` with `data: { payloadCiphertext: encryptForUser(userId, JSON.stringify(payload), { aad: 'aa.financial_data:' + recordId }) }`. Add a Prisma migration that renames the column or adds a new ciphertext column for migration safety. |
| C6 (NEW) | The **fallback `parsed.success ? parsed.data : process.env` cast** in `env.ts` still runs even in production after the new hard-fail check — because the `throw` only fires if env parses fail; existing typing is `any`. Make `env` strongly-typed (`z.infer<typeof envSchema>`) and forbid the loose fallback in production. | `backend/src/config/env.ts` | Replace `as any` with `z.infer<typeof envSchema>`; if `!parsed.success && NODE_ENV === 'production'` → already throws; otherwise log + use parsed defaults, but never expose the raw `process.env` as typed env. |

### 🟠 HIGH

| # | Gap | File / Area | Recommended fix |
|---|---|---|---|
| H1 | No global **error reporting** (Sentry / Datadog). Production crashes will only land in Fly logs. | `backend/src/server.ts`, `frontend/src/main.tsx` | `npm i @sentry/node @sentry/react` (later). Initialize in `server.ts` (`Sentry.init({ dsn, tracesSampleRate: 0.1 })`) and in `main.tsx` (`Sentry.init({ dsn })`). Wrap Express errorHandler with `Sentry.Handlers.errorHandler()`. |
| H5 | **No CSRF protection** on cookie-authenticated routes. Becomes mandatory the moment C3 cookies land. | `backend/src/app.ts` | `csurf` is deprecated; use `csrf-csrf` (later) or implement double-submit cookie pattern. Skip for Bearer-token routes (detect via `Authorization` header presence). |
| H8 | Bulk transaction endpoint runs items **sequentially in separate transactions** (Phase 1 implementation). Performance OK for ≤100 items; for CSV imports of thousands of rows, batch in a single `$transaction` per 50-item chunk. | `backend/src/features/transactions/transaction.service.ts` (`createTransactionsBulk`) | Add a fast path: detect import flow via metadata flag, chunk + batch insert with `createMany` + recalc balances post-insert. |
| H9 (apply) | HMAC helper exists; each webhook handler in `backend/src/features/webhooks/*` must call it. | `backend/src/features/webhooks/webhook.controller.ts` | At the top of each handler: `if (!verifyWebhookSignature(req, env.WEBHOOK_SETU_SECRET, { headerName: 'x-setu-signature' })) { audit({ event: 'security.webhook_invalid_signature', ip: req.ip }); return res.status(401).json({ error: 'invalid signature' }); }` |
| H10 (NEW) | The **soft-delete worker** that performs Phase 2's eventual hard-delete (after the 30-day grace window) does not exist yet. Users currently get a "scheduled for deletion" reply but the deletion never happens. | `backend/src/workers/` | New `accountDeletionWorker.ts` cron — every 6 h scans `User` where `syncToken LIKE 'delete_after:%'` AND timestamp `<= now()`, runs a Prisma transaction deleting cascade-children, then deletes the User row and Supabase Auth user. Emit `audit({ event: 'gdpr.account_delete_executed' })`. |

### 🟡 MEDIUM

| # | Gap | File / Area | Recommended fix |
|---|---|---|---|
| M1 | `ensureUserInDb` (in `auth.ts`) does an upsert on every cold cache hit. Under load this is wasted IO. | `backend/src/middleware/auth.ts` | Only upsert when token is from Supabase (first migration); otherwise trust the row exists or return 401. |
| M2 | The `dedupHash` is computed server-side from `userId+amount+date(YYYY-MM-DD)+description`. Two legitimate identical-day identical-amount transactions (e.g. two ₹100 coffees) get **silently swallowed** as duplicates. | `transaction.service.ts:133` | Either include `clientId` in the hash, or drop the body-hash dedup entirely now that idempotency middleware exists. |
| M3 | `frontend/src/contexts/AuthContext.tsx` race conditions documented in changelog reveal `Promise.race` with timeouts. Replace ad-hoc race logic with React Query / SWR for the role fetch — built-in dedupe, retry, suspense. | frontend | (later) install `@tanstack/react-query`. |
| M4 | No `npm audit` in CI. | `.github/workflows/ci.yml` | Add `npm audit --omit=dev --audit-level=high` step. |
| M5 | No **dependency vulnerability snapshot** committed. | repo root | Add `npm-shrinkwrap.json` for backend deploy artifact, or commit `package-lock.json` (likely already done). |
| M6 | `frontend/src/main.tsx` likely registers Service Worker without an update prompt. Stale SW = users stuck on old bundle after a deploy. | `frontend/src/sw.ts` (Workbox / vite-plugin-pwa) | Use `registerType: 'autoUpdate'` + toast “New version available — reload?”. |
| M7 | `LimitedModeBanner` mentioned but no centralized circuit-breaker UI: if backend is down, FE should switch to local-only mode + toast it. | `frontend/src/app/components/shared/LimitedModeBanner.tsx` | Hook to `useApi`'s health probe; show banner when DB/Redis flags degraded. |
| M8 | Backend tests are described as 30/30 passing **with `503` tolerance**. Useful for offline CI but masks real DB regressions. | `backend/tests/*` | Split into two CI jobs: `test:offline` (allows 503) and `test:online` (requires real Postgres; fails on 503). |

### 🟢 LOW

| # | Gap | Recommended fix |
|---|---|---|
| L1 | `/api-docs` is mounted but the spec generator may not be wired to all routes. | Verify Swagger UI renders every route; add OpenAPI tags per feature module. |
| L2 | `package.json` `overrides` block is enormous (40+ pins). Consider splitting non-security overrides into Renovate config. | Move to `.npmrc` + Renovate. |
| L3 | `frontend/src` does not have a documented folder-by-feature standard. New devs will struggle. | Author `docs/frontend.skill.md` (already exists) → reference `app/components/<feature>/` convention. |
| L4 | No `.editorconfig`. | Add a minimal one for CRLF/LF consistency on Windows + Mac team. |

---

## 3. Phase 3 — Pre-Launch Compliance Checklist

Before going public with real users' money:

- [ ] **PCI-DSS scoping**: Even though Kanaku does not store PANs, the AA flow may surface card numbers. Confirm with a QSA whether SAQ-A applies.
- [ ] **RBI compliance** (India): Account Aggregator integration is licensed via Setu — verify Setu's licence covers your use-case.
- [ ] **Data residency**: Fly Postgres region `sin` (Singapore) is OK for non-India users; for Indian PII, host in India (`bom`) or get cross-border-transfer consent.
- [ ] **VAPT report**: docs mention `VAPT_RESPONSE_06032026.md` — schedule the next external VAPT after this audit's fixes land.
- [ ] **Privacy policy + Terms of Service**: must mention Setu AA, Gemini AI data processing, and the local-first storage model.
- [ ] **DPO appointment** if you cross 100 K users.
- [ ] **Insurance**: cyber-liability cover sized to your TPV.

---

## 4. Phase 4 — Recommended 30/60/90 Roadmap

### Days 1–14 (Land Phase 2 deliverables on staging)
1. `npm install` on staging.
2. Generate root keys:
   - `JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")`
   - `AA_ENCRYPTION_ROOT_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`
   - `WEBHOOK_SETU_SECRET`, `WEBHOOK_RESEND_SECRET`, `WEBHOOK_MSG91_SECRET` from each vendor portal.
3. Set Fly secrets (`fly secrets set ...`).
4. `npx prisma generate` to refresh the client with money helpers' Decimal types.
5. Smoke-test:
   - `POST /api/v1/transactions` twice with the same `Idempotency-Key` → second returns `Idempotent-Replay: true`.
   - `GET /health` → minimal body; `GET /api/v1/health/deep` with admin token → full payload.
   - `GET /api/v1/health/metrics` → request counts + p95 latency.
   - `GET /api/v1/settings/export` → JSON file downloaded.
   - `DELETE /api/v1/settings/account` → returns `scheduledFor`; user can no longer log in.

### Days 14–30 (Finish CRITICAL)
6. Wire refresh-token cookies (C3 finish).
7. Apply `encryptForUser` to AA service writes/reads (C5 apply).
8. Wire `verifyWebhookSignature` into every handler in `features/webhooks/*` (H9 apply).
9. Strongly-type `env.ts` (C6).
10. Build the soft-delete worker (H10).

### Days 31–60 (Productionize)
11. Sentry (H1) — install + initialize on both ends.
12. CSRF middleware once cookies land (H5).
13. Chunked batch insert for `transactions/bulk` (H8).
14. React Query migration (M3).
15. Full test split: offline vs online (M8).
16. External VAPT re-run.

### Days 61–90 (Scale)
17. Read-replica routing for `/api/v1/dashboard` + report-heavy GETs.
18. Move Socket.IO to a dedicated process / Fly machine; sticky sessions.
19. BullMQ workers in their own process (`backend/src/workers/`).
20. Internationalisation + multi-currency real exchange-rate service.
21. Mobile: iOS Capacitor build → TestFlight.

---

## 5. Things the Codebase Already Gets Right (kudos)

- Strict middleware ordering in `app.ts` (helmet → CORS → rate-limit → JSON → sanitize → routes → errorHandler).
- Body sanitizer (`sanitize.ts`) strips HTML from every nested string field.
- Per-route rate limits on `/bills`, `/receipts`, `/sync` — not just global.
- Multi-strategy JWT verification with proper refresh-token rejection.
- `prisma.$transaction` wraps balance + transaction inserts (`transaction.repository.ts`).
- AppError class + unified error response shape.
- In-memory + Redis 2-tier rate limit fallback.
- Per-user role cache in localStorage to avoid auth roundtrips.
- Auto-retry / circuit-breaker for upstream AI calls.
- Exhaustive Mermaid sequence diagrams for every major flow.

This is a high-quality codebase — most teams at this stage have far worse foundations. The fixes above are the difference between "looks like a fintech" and "is one."

---

*— End of report. Apply Phase 2 changes in priority order; Phase 1 is already in your working tree and ready to ship after `npm install` + tests.*

