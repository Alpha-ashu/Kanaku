# Quality · Security Testing

Index of security/abuse-case coverage. The executable security suites run on the
backend Jest runner (they need the Prisma client + a test DB) and now live under
`quality/backend/`; Jest is pointed here via `backend/jest.config.ts`
(`roots: ['<rootDir>/../quality/backend']`). This page is the authoritative map.

## Automated suites

| Suite | Location | Command |
|---|---|---|
| Core security (authz, ownership, injection, rate limits) | `quality/backend/tests/integration/security.test.ts` | `npm --prefix backend run test:security` |
| AI endpoint security | `quality/backend/tests/integration/ai-security.test.ts` | `npm --prefix backend run test:ai:security` |
| Bills/payments security | `quality/backend/tests/integration/bills-security.test.ts` | (part of `test:security`) |
| Auth input hardening (unit) | `quality/backend/unit/auth/input-hardening.test.ts` | `npm --prefix backend test` |
| Critical-path security gate | the three above + `transactions.test.ts` | `npm --prefix backend run test:security:critical` |

## Code under test (security modules)

| Concern | Source |
|---|---|
| Crypto / SHA-256 challenge-response, refresh cookie | `backend/src/security/crypto.ts`, `refreshCookie.ts` |
| Idle-session policy, PIN unlock | `backend/src/security/idleSession.ts`, `pinUnlock.ts` |
| Webhook signature verification | `backend/src/security/webhookSignature.ts` |
| Route security gate (phase/module + auth) | `backend/src/middleware/securityGate.ts` |
| Frontend security helpers / context | `frontend/src/lib/security.ts`, `frontend/src/contexts/SecurityContext.tsx` |

## Dependency / supply-chain audit

- `platform/security/DEPENDENCY_AUDIT.md`, `platform/security/README.md`

## Manual / on-demand review

- Pending-diff security review: the `/security-review` skill
  (`docs/skills/security.skill.md`).

## Adding a security test

1. Add the test to `quality/backend/tests/integration/<feature>-security.test.ts` (or extend
   `security.test.ts`).
2. If it should gate CI, add it to the relevant `test:security*` script in
   `backend/package.json`.
3. Add a row to the table above.
