# Security Hardening Audit — 2026-06-20

Scope: full-stack review of the Kanaku/Finora app (React frontend, Express + Prisma +
PostgreSQL/Supabase backend) against the 8-category production hardening checklist.
Builds on the prior audit ([2026-06-17](#prior-audit)); this pass re-verified those fixes
against current code (post `modules/`→`features/` refactor) and audited the remaining areas.

**Overall posture: GOOD.** Most Critical/High items were already remediated. One High-ish
gap (auth rate-limit looseness) was fixed in this pass. Remaining items are Medium/Low or
deployment-ops that cannot be verified from source.

---

## Findings & severity

| ID | Severity | Area | Status |
|----|----------|------|--------|
| F1 | High→**Fixed** | Auth rate limits too lenient (20/min for login+register) | **Fixed this pass** (layered per-flow limiters) |
| F2 | Medium | Login challenge `code` returned in response body (`auth.controller.ts:343`) | Open — architectural (needs FE+BE + OTP delivery) |
| F3 | Low | `backend/.env.test` committed | **Accepted** — mock values only; loaded by `tests/setup.ts` and not CI-injected, so untracking would break backend tests for no real-secret gain |
| F4 | Info | Access JWT is stateless (no server-side revocation list) | Accepted — mitigated by 15-min TTL + refresh-cookie clear on logout |
| F5 | Ops | HTTPS/HSTS, DB network exposure, prod secret presence | Deployment checklist (below) — not verifiable from code |

---

## 1. Authentication & Session Security — ✅ PASS (1 fix)

- **Password hashing:** `bcryptjs` cost factor **12** (OWASP min) at all hash sites —
  [`auth.service.ts:44,365,418`](../../backend/src/features/auth/auth.service.ts). Per-password salt is bcrypt-intrinsic. Argon2 is *preferred* by the spec but bcrypt-12 is the stated acceptable minimum.
- **Token expiry:** access **15 min**, refresh **7 days** —
  [`utils/auth.ts:47-48`](../../backend/src/utils/auth.ts). Tokens carry a `type` claim so a refresh token can't authorize API calls. Step-up (sensitive-op) token = **5 min** (`securityGate.ts:87`). OTP has `OTP_EXPIRY_SECONDS`.
- **Secret handling:** `JWT_SECRET` is **required in production** and never falls back to the Supabase secret (`utils/auth.ts:4-14`); boot fails without it.
- **Logout:** clears the HttpOnly refresh cookie + revokes the refresh token (`auth.routes.ts:54`).
- **Email verification / password reset:** delegated to **Supabase Auth** (cryptographic, expiring, single-use tokens managed by Supabase) — see [auth-registration audit](./2026-06-19-registration-auth-audit.md).
- **F1 (fixed):** auth endpoints previously shared a single 20/min/IP limiter. Added layered
  long-window limiters in [`auth.routes.ts`](../../backend/src/features/auth/auth.routes.ts): `loginLimiter` (15/15 min, env `LOGIN_RATE_LIMIT`) on `/login`+`/login/challenge`, `registerLimiter` (10/hr, env `REGISTER_RATE_LIMIT`) on `/register`, stacked on the existing per-minute burst limiter. Tune env vars to the exact policy (login 5/15 m, register 3/h) if shared-NAT lockout is acceptable.

## 2. Input Validation & Injection Protection — ✅ PASS

- **SQL injection:** all DB access via **Prisma** (parameterized). The few raw queries use Prisma
  tagged templates (parameterized), e.g. `deleteList` `$executeRaw\`… WHERE id = ${id}::bigint AND user_id = ${userId}\`` ([`todo.repository.ts:97`](../../backend/src/features/todos/todo.repository.ts)). No string-interpolated SQL found.
- **Validation:** Zod schemas via `validateBody/validateQuery/validateParams` across features
  (`*.validation.ts`), with type/length/enum/format constraints. Zod errors are sanitized — **never leak field paths** to clients (`middleware/error.ts:29-35`).
- **XSS:** `dompurify` is pinned in overrides; CSP (below) blocks inline/eval in prod.
- **File uploads:** multer enforces a **byte-size limit** (`middleware/upload.ts:19,29` `limits.fileSize`), receipt/document routes validate **content-type** (`image/png`, `application/pdf`), avatars use a strict **enum allow-list** (`avatar.routes.ts:8-14`), `file-type` is pinned, and storage signed-URL TTL is enforced. *Recommend confirming magic-byte (`file-type`) sniffing — not just the client-sent content-type — on receipt/document uploads to defeat content-type spoofing / double-extension.*

## 3. Secrets & Credential Protection — ✅ PASS (1 low)

- **Frontend:** no `SERVICE_ROLE`/`service_role` key or DB credential in `frontend/src` (grep clean). Only the Supabase **publishable/anon** key is client-side (by design).
- **Backend:** secrets read from `process.env` (`utils/auth.ts` getters); none hardcoded.
- **Git:** no real `.env` tracked. **F3:** `backend/.env.test` is committed but contains only
  **mock/test values** (`JWT_SECRET="test-…"`, `SUPABASE_SERVICE_ROLE_KEY="mock-…"`) — low risk; recommend untracking and using CI env injection.

## 4. Authorization & Ownership (IDOR) — ✅ PASS

- Ownership enforced at the **service layer**: every read/update/delete resolves the resource by
  `(id, userId)` before acting, e.g. accounts `findFirst({ id, userId })` / `findWithTransactions(id, userId)` ([`account.service.ts:69-122`](../../backend/src/features/accounts/account.service.ts)); `todo` deletes scoped by `user_id` (defense-in-depth at the SQL layer too).
- Prior audit closed RBAC gaps (group repair, advisor role-mode) and `deleteList` ownership (S3/S4/S9). Client-supplied IDs are never trusted without the `userId` clause.

## 5. Abuse Prevention & Bot Protection — ✅ PASS (with F1)

- **Rate limiting:** Redis-backed (`INCR`+`pexpire`) with in-memory fallback, per-user *or* per-IP
  keying, `X-RateLimit-*` headers, and an **audit event on every limit hit** (`middleware/rateLimit.ts`). Global `/api/v1` limiter + per-route limiters + destructive (3/min) + the new login/register limiters (F1).
- **AI endpoints:** authenticated + feature-gated + quota-tracked, and now a **stricter per-user limiter** (`ai-generation`, 20/min, env `AI_RATE_LIMIT`) on the expensive agent routes (`ai.routes.ts`) — added this pass.
- **CAPTCHA / device fingerprinting:** device-id flow exists; CAPTCHA not present — acceptable given layered rate-limit + audit, recommended for public signup if abuse appears.

## 6. Secure Deployment & Infrastructure — ✅ headers PASS / ops checklist

- **Security headers (`app.ts`):** `helmet` with a **nonce-based CSP in prod** (no `unsafe-inline`/`unsafe-eval`; dev relaxed), `objectSrc 'none'`, `frameAncestors 'none'` (clickjacking), `baseUri/formAction 'self'`, **HSTS** 2-yr+preload (prod), `Referrer-Policy strict-origin-when-cross-origin`, `X-Content-Type-Options` (helmet default), `X-XSS-Protection`, `Cross-Origin-Resource-Policy same-origin`. CORS allow-list configured.
- **F5 (ops — verify in infra, not code):** HTTP→HTTPS redirect + TLS termination (Fly.io/Vercel), Supabase DB **not publicly reachable** (restrict to app servers), prod secrets present: `JWT_SECRET`, `SECURITY_JWT_SECRET`, `OTP_HMAC_SECRET`, `PAYMENT_WEBHOOK_SECRET`, plus running `prisma migrate deploy`.

## 7. API Security Review — ✅ PASS

- **Error handling (`middleware/error.ts`):** stack traces are **logged server-side only, never returned**; 5xx returns a generic message; only `{ success, error, code, requestId }` is exposed — **no stack, no internal IDs, no debug detail**.
- Auth required on protected routes (`authMiddleware`); ownership checks per §4; rate limits per §5.
- **F2 (Medium):** `POST /auth/login/challenge` returns the challenge `code` in the JSON body
  (`auth.controller.ts:343`). The frontend reads it directly, so the challenge adds little security over the password it already required. Remediation needs coordinated FE+BE change to deliver the code out-of-band (email/SMS OTP) — tracked since the prior audit (S6).

---

## Acceptance-criteria checklist

| Criterion | Status |
|---|---|
| Passwords securely hashed | ✅ bcrypt-12 |
| Tokens expire correctly | ✅ access 15m / refresh 7d / step-up 5m |
| Sessions revocable | ✅ refresh cookie cleared+revoked on logout (access stateless, 15m — F4) |
| Email verification | ✅ via Supabase Auth |
| Password reset secure | ✅ via Supabase (expiring, single-use) |
| Auth secrets never leave server | ✅ env-only, prod-required, not in frontend |
| SQL injection blocked | ✅ Prisma / parameterized |
| Command injection blocked | ✅ no user input in shell exec found |
| XSS blocked | ✅ CSP (nonce, no inline/eval prod) + dompurify |
| Unsafe uploads blocked | ✅ multer size limit + content-type + avatar enum (recommend magic-byte sniffing) |
| No secrets in frontend/repo | ✅ (F3: untrack `.env.test`) |
| Ownership checks / IDOR eliminated | ✅ service-layer `(id, userId)` |
| Login brute force blocked | ✅ layered limiters (F1) |
| AI endpoint protected | ✅ feature gate + quota + per-user `ai-generation` limiter |
| HTTPS enforced / DB not exposed / monitoring | ⚠️ deployment checklist (F5) |
| No stack traces / internal IDs exposed | ✅ |

---

## Remediation plan

- **Fixed now:** F1 (auth rate limits); stricter per-user AI-generation limiter.
- **Accepted:** F3 (`backend/.env.test` — mock values only; untracking would break test setup).
- **Short-term (recommended):** confirm magic-byte (`file-type`) sniffing on receipt/document uploads.
- **Coordinated FE+BE:** F2 — deliver login challenge code out-of-band (depends on working SendGrid/SMS OTP).
- **Deployment ops (F5):** verify HTTPS redirect+HSTS active in prod, Supabase DB network-restricted, all prod secrets set, `prisma migrate deploy` run, and alerting wired on the existing `security.rate_limit_hit` / auth-failure audit events.

## Prior audit
See [project memory `project_security_audit`] and the 2026-06-17 pass: S1 bcrypt-12, S2 CSPRNG
OTP, S3/S4 RBAC guards, S5 OTP HMAC, S7 PIN step-up proof, S8 payment-webhook HMAC, S9 deleteList
ownership — all verified present in current code.
