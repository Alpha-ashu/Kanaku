# Fintech Security Audit

Run a targeted security review of this financial application. Focus on data protection, authentication integrity, and OWASP Top 10 compliance.

## Authentication & Session

1. **JWT handling** — Read `backend/src/utils/auth.ts`. Verify: token expiry set, refresh token rotation, no sensitive data in JWT payload.
2. **Password storage** — Grep for `bcrypt` usage; confirm salting rounds ≥ 12.
3. **OTP security** — Read `backend/src/modules/otp/`. Verify: time-limited (≤5 min), single-use, rate-limited.
4. **PIN security** — Read `backend/src/modules/pin/`. Verify PIN is hashed, not stored plaintext.

## Authorization (RBAC)

5. Read `backend/src/middleware/rbac.ts`. Confirm every route that accesses user data checks `req.user.id` matches resource owner.
6. Grep for `requireRole` — verify advisor routes, admin routes, and client routes all have it.
7. Check for horizontal privilege escalation: can User A access User B's transactions?

## Data Protection

8. **Input validation** — Check `backend/src/middleware/validate.ts`. Verify Zod/Joi schemas on all POST/PUT endpoints.
9. **SQL injection** — Prisma ORM is used (safe by default). Grep for raw SQL strings: `$queryRaw`, `$executeRaw` — review those specifically.
10. **XSS** — Check frontend for `dangerouslySetInnerHTML`. Grep `frontend/src/` for it.
11. **File upload** — Read `backend/src/utils/uploadPolicy.ts`. Verify file type allowlist, size limits, virus scan.
12. **Secrets** — Grep for hardcoded API keys: `sk_`, `pk_`, `AIza`, `secret`. Report any found.

## Infrastructure

13. **HTTPS** — Confirm `vercel.json` forces HTTPS; check Helmet config in `backend/src/app.ts`.
14. **Rate limiting** — Grep for `rateLimit` or `express-rate-limit`. Verify auth endpoints are rate-limited.
15. **CORS** — Check CORS config in `backend/src/app.ts`. Ensure it doesn't use `origin: '*'`.

## Output

Report each check as ✅ Pass / ⚠️ Warning / ❌ Fail with file:line references.
Prioritize ❌ failures as critical fixes.
