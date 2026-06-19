# Claude Commands — Kanaku

This folder is the **agent context layer** for Claude / Copilot when working on Kanaku.
It bundles the highest-signal skill references, runbooks, and operational commands so the
assistant can act safely inside a financial-grade codebase.

---

## 🧱 Tech Stack (authoritative)

| Layer | Stack |
|---|---|
| Frontend | React 18 · TypeScript · Vite · TailwindCSS · Capacitor (Android/iOS) |
| Local store | Dexie (IndexedDB) — local-first, sync-pending model |
| Backend | Node.js · Express · TypeScript · Zod · Winston · Helmet · CORS · rate-limit |
| Database | PostgreSQL via Prisma ORM (singleton client, `$transaction` for monetary writes) |
| Identity | Supabase Auth (JWT) + custom backend JWT verification |
| Realtime / Sync | Supabase Realtime + Dexie cloud sync (user-scoped, delta-based) |
| Intelligence | Tesseract.js OCR + Gemini 1.5 Flash (wrapped in `withCircuitBreaker`) |
| Testing | Vitest (FE) · Jest (BE) · Playwright (E2E) |
| Hosting | Fly.io / Vercel · Docker · Capacitor for mobile |

All API routes live under **`/api/v1/...`**. All monetary logic is **server-authoritative**.

---

## 🚦 Start Here (read in this order)

1. [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) — repo map (`backend/`, `frontend/`, `api/`, `quality/`, `platform/`).
2. [`DEVELOPER_QUICK_REFERENCE.md`](DEVELOPER_QUICK_REFERENCE.md) — day-to-day commands.
3. [`ENVIRONMENT_REFERENCE.md`](ENVIRONMENT_REFERENCE.md) — env vars and where each is consumed.
4. [`ARCHITECTURE_DIAGRAMS.md`](ARCHITECTURE_DIAGRAMS.md) — request, sync, and auth flows.
5. [`MASTER_DOCUMENTATION.md`](MASTER_DOCUMENTATION.md) — full index across `/docs`.

---

## 🧠 Skills (source of truth when coding)

Each skill file encodes the conventions an agent must follow before editing that layer.

| Skill | When to use |
|---|---|
| [`backend.skill.md`](backend.skill.md) | Express routes, Prisma writes, Zod schemas, AppError flow, monetary transactions. |
| [`frontend.skill.md`](frontend.skill.md) | React 18 components, Dexie writes, sync-pending markers, Capacitor bridges. |
| [`database.skill.md`](database.skill.md) | Prisma schema, migrations, indexes, RLS, snake_case `@map` rules. |
| [`security.skill.md`](security.skill.md) | Helmet, CORS, rate limiting, JWT verification, ownership checks. |
| [`qa.skill.md`](qa.skill.md) | Vitest / Jest / Playwright patterns, fixtures in `quality/`. |
| [`reviewer.skill.md`](reviewer.skill.md) | PR review checklist (validation, auth, transactions, types). |

---

## 🛠 Runbooks & Commands

Short, copy-pasteable operational guides — run these instead of inventing new flows.

| File | Purpose |
|---|---|
| [`api-smoke.md`](api-smoke.md) | Smoke-test `/api/v1` endpoints after deploy. |
| [`db-health.md`](db-health.md) | Postgres connectivity, pool stats, migration drift. |
| [`prisma-migrate.md`](prisma-migrate.md) | Generate / apply / resolve Prisma migrations (matches `settings.local.json` allowlist). |
| [`docker-postgres-setup.md`](docker-postgres-setup.md) | Local Postgres via Docker Compose. |
| [`deploy-preflight.md`](deploy-preflight.md) | Pre-deploy checklist (Fly.io / Vercel). |
| [`receipt-test.md`](receipt-test.md) | Exercise OCR pipeline (Tesseract → Gemini). |
| [`sync-validate.md`](sync-validate.md) | Verify Dexie ↔ Supabase delta sync consistency. |
| [`security-audit.md`](security-audit.md) | Run the security audit suite. |
| [`role-audit.md`](role-audit.md) | Validate role / permission matrix. |
| [`feature-gates.md`](feature-gates.md) | Toggle / inspect feature gates. |
| [`advisor-flow.md`](advisor-flow.md) | Walk the advisor → client onboarding path end-to-end. |

---

## 📚 Reference Docs (mirrored from `/docs`)

Kept here so the agent can answer without leaving its context window.

- **API**: [`API_REFERENCE.md`](API_REFERENCE.md) · [`API_TESTING_GUIDE.md`](API_TESTING_GUIDE.md) · [`FEATURE_PAGE_API_REFERENCE.md`](FEATURE_PAGE_API_REFERENCE.md)
- **Architecture**: [`BACKEND_DATABASE_ARCHITECTURE.md`](BACKEND_DATABASE_ARCHITECTURE.md) · [`AA_OTP_ARCHITECTURE.md`](AA_OTP_ARCHITECTURE.md) · [`INTELLIGENCE_SYSTEMS.md`](INTELLIGENCE_SYSTEMS.md)
- **Features & Gates**: [`FEATURE_INVENTORY.md`](FEATURE_INVENTORY.md) · [`FEATURE_GATES_IMPLEMENTATION.md`](FEATURE_GATES_IMPLEMENTATION.md) · [`FEATURE_GATES_TEST_GUIDE.md`](FEATURE_GATES_TEST_GUIDE.md)
- **Roles / Terms**: [`ROLES_AND_PERMISSIONS.md`](ROLES_AND_PERMISSIONS.md) · [`TERMS_MASTER.md`](TERMS_MASTER.md) · [`TERMS_ADMIN.md`](TERMS_ADMIN.md) · [`TERMS_ADVISOR.md`](TERMS_ADVISOR.md) · [`TERMS_CLIENT.md`](TERMS_CLIENT.md) · [`TERMS_END_USER.md`](TERMS_END_USER.md)
- **Setup**: [`DATABASE_SETUP_GUIDE.md`](DATABASE_SETUP_GUIDE.md) · [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md)
- **Testing**: [`TESTING_AND_FIXTURES.md`](TESTING_AND_FIXTURES.md) · [`USER_LEVEL_TEST_SCENARIOS.md`](USER_LEVEL_TEST_SCENARIOS.md) · [`AUTOMATION_REGISTRY.md`](AUTOMATION_REGISTRY.md)
- **Integrations**: [`THIRD_PARTY_INTEGRATIONS.md`](THIRD_PARTY_INTEGRATIONS.md)
- **Status / Audits**: [`STATUS_REPORT.md`](STATUS_REPORT.md) · [`VAPT_RESPONSE_06032026.md`](VAPT_RESPONSE_06032026.md) · `FINTECH_ARCHITECTURE_AUDIT.ts` · `AUDIT_EXECUTIVE_SUMMARY.ts` · `IMPLEMENTATION_GUIDE_CRITICAL.ts` · `IMPLEMENTATION_SUMMARY.ts`
- **Overview**: [`KANAKU_STAKEHOLDER_OVERVIEW.md`](KANAKU_STAKEHOLDER_OVERVIEW.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## ✅ Pre-Flight Checklist (every change)

Before finalizing any code change, the agent must verify:

1. **Versioning** — new/changed routes are under `/api/v1/`.
2. **Validation** — every mutating route has `validate(zodSchema)` middleware.
3. **Auth & Ownership** — `authenticate` middleware + a `userId` ownership check before any read/write.
4. **Monetary Integrity** — balance updates + transaction inserts wrapped in `prisma.$transaction`.
5. **Offline-First** — frontend writes hit Dexie first and mark records `sync: 'pending'`; background retry exists.
6. **Sync Consistency** — Dexie ↔ cloud deltas remain user-scoped and idempotent.
7. **Types** — no `any` in new code; use Zod-inferred types or explicit interfaces / DTOs.
8. **Security Controls** — Helmet, CORS, rate limit, JWT verification untouched or strengthened.
9. **Logging** — `logger.*` only; no `console.log`; no secrets in logs.
10. **Response Shape** — `{ success, data, message }` for success; central `errorHandler` for errors.

---

## 🔐 Allowed Automation (`../settings.local.json`)

The agent is pre-authorized to run:

- `npm run:*` scripts
- `npx prisma@6.19.2` schema / migration commands against `backend/prisma/schema.prisma`
- `git add` / `git commit` / `git push`
- `taskkill /F /IM node.exe` for stuck dev servers

Anything outside this allowlist requires explicit user approval.

---

## 🗂 Historical / One-off Notes

Older implementation notes (`*_IMPLEMENTATION*.ts`, `*_AUDIT*.ts`, dated VAPT responses) are kept
for traceability. **Skill files above are the current source of truth** — prefer them over historical
docs when conventions disagree.
