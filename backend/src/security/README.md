# Security module

A single, discoverable home for the backend's security controls. The canonical
implementations live under [`../middleware/`](../middleware/) and
[`../utils/`](../utils/); [`index.ts`](./index.ts) re-exports them grouped by
concern so new code can `import { ... } from '../security'`.

> Located at `src/security/` (not `backend/security/`) so it compiles inside the
> backend's `rootDir: ./src` and is importable by the rest of the app.

## Controls catalog

| Concern | Control | Source |
|---|---|---|
| **Authentication** | Multi-strategy bearer verification (custom JWT → Supabase JWT → Supabase API), 60s user-snapshot cache, suspended-account block | [`middleware/auth.ts`](../middleware/auth.ts) |
| **Token / JWT** | Access (15m) + refresh (7d) JWTs, `type` claims, rotation on refresh, refresh-tokens rejected for API auth | [`utils/auth.ts`](../utils/auth.ts), [`modules/auth`](../modules/auth/README.md) |
| **Authorization (RBAC)** | `requireRole`, `requireApproved`, `ownerOnly` | [`middleware/rbac.ts`](../middleware/rbac.ts) |
| **Feature gates** | `requireFeature`, `requireAIFeature` (admin-controlled module/capability flags) | [`middleware/featureGate.ts`](../middleware/featureGate.ts) |
| **Step-up / sensitive ops** | `securityGate`, short-lived security tokens | [`middleware/securityGate.ts`](../middleware/securityGate.ts) |
| **Input validation** | Zod schemas via `validateBody` / `validateQuery` / `validateParams`; per-module `*.validation.ts` | [`middleware/validate.ts`](../middleware/validate.ts) |
| **Sanitization** | `sanitize` (HTML/script stripping), AI input/output guards, prompt-injection detection | [`utils/sanitize.ts`](../utils/sanitize.ts) |
| **Rate limiting** | Per-IP/per-user limiters (auth 20/min, destructive ops 3/min) | [`middleware/rateLimit.ts`](../middleware/rateLimit.ts) |
| **Security headers** | `helmet` (CSP, `crossOriginResourcePolicy`) + explicit `X-XSS-Protection`, `Cross-Origin-Resource-Policy` | [`app.ts`](../app.ts) |
| **CORS** | Origin allowlist (no-throw, omits headers for disallowed origins) | [`app.ts`](../app.ts) |
| **Audit logging** | `audit()` for security-relevant events (login_failed, etc.) | [`utils/auditLogger.ts`](../utils/auditLogger.ts) |

## Injection protection — audit (2026-06-18)

**SQL injection: no findings.**
- All data access goes through **Prisma** (parameterized).
- Raw queries use **tagged templates** (`prisma.$queryRaw\`...\``, `prisma.$executeRaw\`...\``) which Prisma parameterizes — values are never string-concatenated into SQL.
- `prisma.$executeRawUnsafe(...)` appears only in [`modules/ai/ai.engine.ts`](../modules/ai/ai.engine.ts) and [`modules/categorization/categorization.engine.ts`](../modules/categorization/categorization.engine.ts), and **only for static `CREATE TABLE IF NOT EXISTS` DDL with no user input** (DDL cannot be parameterized). These are safe; do not pass user input to `*Unsafe` APIs.

**XSS / HTML / script injection:** user input is run through `sanitize()` on write paths; the React frontend escapes by default; a CSP is set in `app.ts`.

**Rule of thumb:** never build SQL with string interpolation; use Prisma methods or tagged-template raw queries. Never pass user input to `$executeRawUnsafe` / `$queryRawUnsafe`.

## Input-validation coverage

Most modules validate via dedicated `*.validation.ts` + `validateBody`/`validateParams`. Status of the rest:

- **Validated inline (not via a `*.validation.ts` file):** `auth` (controller checks), `devices` (zod in controller), `voice` + `import` (zod in routes)
- **Edge validation added:** `advisors`, `bills`, `notifications`, `pin` (type + max-length, fields optional so each handler's specific error codes are preserved)
- **Read-only / low-risk:** `dashboard`, `stocks`
- **Special wire formats:** `webhooks` (provider-signed), `sync` (bulk payload), `avatars` (static)

Validation schemas use `.passthrough()` because the validate middleware replaces `req.*` with the parsed result — so they enforce types/lengths without dropping fields or rejecting otherwise-valid requests.

## Penetration / security tests

`npm run test:security` → [`tests/integration/security.test.ts`](../../tests/integration/security.test.ts), `ai-security.test.ts`, `bills-security.test.ts` (SQLi/XSS/authz probes).

## Ownership

Security-sensitive changes (auth, tokens, validation, raw SQL) require review. See repo-root [`SECURITY.md`](../../../docs/SECURITY.md) and `SECURITY_AUDIT_REPORT.md`.
