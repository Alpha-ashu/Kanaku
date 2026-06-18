# Platform Â· Security â€” Stakeholder Index

> Front door to Kanaku's security posture. The actual code lives in
> [`backend/src/security/`](../../backend/src/security/README.md) and
> [`backend/src/middleware/`](../../backend/src/middleware/).

## Request pipeline (one diagram)

```
client â”€â”€â–¶ Helmet â–¸ CORS â–¸ RateLimit â–¸ Auth â–¸ RBAC â–¸ FeatureGate â–¸ SecurityGate â–¸ Validate â–¸ Sanitize â–¸ Audit â”€â”€â–¶ controller
```

## Controls catalog

| Concern | Code | Stakeholder doc |
|---|---|---|
| **Authentication** (Supabase + custom JWT) | `backend/src/middleware/auth.ts`, `backend/src/features/auth/` | [docs/security/](../../docs/security/) |
| **Authorization** (RBAC, ownership, approval) | `backend/src/middleware/rbac.ts` | [SECURITY.md](../../SECURITY.md) |
| **Feature gates** | `backend/src/middleware/featureGate.ts` | [docs/FEATURE_GATES_IMPLEMENTATION.md](../../docs/FEATURE_GATES_IMPLEMENTATION.md) |
| **Step-up / sensitive ops** | `backend/src/middleware/securityGate.ts` | â€“ |
| **Input validation (zod)** | `backend/src/middleware/validate.ts` + per-feature `*.validation.ts` | [api-docs/](../../api-docs/README.md) |
| **Sanitization** | `backend/src/utils/sanitize.ts` | â€“ |
| **Rate limiting** | `backend/src/middleware/rateLimit.ts` | â€“ |
| **Headers (Helmet, CSP)** | `backend/src/app.ts` | â€“ |
| **CORS** | `backend/src/app.ts` | â€“ |
| **Audit logging** | `backend/src/utils/auditLogger.ts` | [SECURITY_AUDIT_REPORT.md](../../SECURITY_AUDIT_REPORT.md) |
| **Secrets** | env + `platform/config/credentials.ts` | [SECURITY.md](../../SECURITY.md) |
| **Penetration tests** | `backend/tests/integration/security*.test.ts` | `npm run test:security` |

## Reports & audits

- [`SECURITY.md`](../../SECURITY.md) â€” policy & disclosure.
- [`SECURITY_AUDIT_REPORT.md`](../../SECURITY_AUDIT_REPORT.md) â€” latest audit.
- [`BACKEND_HARDENING_IMPLEMENTATION.md`](../../BACKEND_HARDENING_IMPLEMENTATION.md) â€” hardening log.
- [`docs/security/`](../../docs/security/) â€” deep-dive design docs.

