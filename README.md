# KANAKU: Modern Expense Tracker

> [!IMPORTANT]
> **AI DEVELOPER NOTICE**: Before making any changes, please read the [KANAKU_DEVELOPER_CONTEXT.md](./KANAKU_DEVELOPER_CONTEXT.md) for architecture rules and the design system guide.

KANAKUis a full-stack finance app with a React frontend, an Express/Prisma backend, Supabase integration, offline-first local storage, and AI-assisted import and receipt flows.

## Repo map

> 🏛️ **See [`ARCHITECTURE_RESTRUCTURE.md`](./ARCHITECTURE_RESTRUCTURE.md) for the full enterprise architecture, feature map, governance rules, and migration phases.**

The repo root is organized into **11 purposeful top-level folders**:

**Execution layer**
- [`frontend/`](./frontend/README.md): React + Vite + Capacitor app (Dexie offline-first, scanners, importers, voice, UI)
- [`backend/`](./backend/README.md): Express API organized by feature in `backend/src/features/`, Prisma, sockets, security middleware
- [`api/`](./api/README.md): Vercel serverless endpoints (e.g. stock quotes)
- [`android/`](./android/), [`supabase/`](./supabase/README.md): mobile build + Supabase CLI project

> `frontend`/`backend`/`api` move under `apps/` via `scripts/migrate-to-apps-layout.ps1` (run in CI).

**platform/ — system services**
- [`platform/security/`](./platform/security/README.md), [`platform/shared/`](./platform/shared/README.md), [`platform/database/`](./platform/database/README.md), [`platform/config/`](./platform/config/credentials.ts) (+ Supabase)

**quality/ — all testing in one place**
- [`quality/`](./quality/README.md): `e2e/` (Playwright), `fixtures/` (+ `samples/`), `manual/`, `runners/`, `scenarios/`, `api/` (contract catalog + test cases), `automation/`, `database/`, `performance/`

**docs/ — all documentation**
- [`docs/api/`](./docs/api/README.md): human API docs + `contracts/` (238 machine-readable endpoint JSONs)
- [`docs/architecture/FEATURE_MAP.md`](./docs/architecture/FEATURE_MAP.md): feature traceability across all layers
- [`docs/onboarding/`](./docs/onboarding/README.md), [`docs/guidelines/`](./docs/guidelines/Guidelines.md), and the rest of [`docs/`](./docs/README.md)

**Support**
- [`scripts/`](./scripts/README.md): build/codegen/migration automation · [`tools/`](./tools/README.md): ad-hoc dev tooling
- [`archive-unused/`](./archive-unused/README.md): **safe cleanup bucket** — never delete, always archive with `reason.md`

## Current architecture

- Frontend reads and writes locally first through Dexie, then syncs with the backend.
- Backend is the authority for auth, role resolution, PIN state, sync identity, and protected mutations.
- Prisma owns the application data model in `backend/prisma/`.
- Supabase provides hosted Postgres/Auth/Storage concerns and SQL migrations in `supabase/`.
- AI-related ingestion currently includes receipt OCR, JSON import normalization, bank statement parsing, and voice-based transaction parsing.

## Quick start

```bash
npm install
npm run db:generate
npm run build
```

For day-to-day work:

```bash
npm run dev
npm run dev:backend
npm --prefix frontend run test:unit
npm --prefix backend test
```

## Test and sample data

- Import validation fixtures now live under [`tests/fixtures/imports/`](./tests/fixtures/imports/)
- Auth payload samples live under [`tests/fixtures/auth/`](./tests/fixtures/auth/)
- Manual browser/debug helpers live under [`tests/manual/`](./tests/manual/)
- External real receipt samples used during verification currently live outside the repo at `C:\Users\USER\OneDrive\Documents\sample`

## Docs to read first

- [Project Structure](./docs/project/PROJECT_STRUCTURE.md)
- [Environment Reference](./docs/project/ENVIRONMENT_REFERENCE.md)
- [Testing and Fixtures](./docs/testing/TESTING_AND_FIXTURES.md)
- [Third-Party Integrations](./docs/integrations/THIRD_PARTY_INTEGRATIONS.md)

## Notes

- Client-side env-based role assignment and local PIN authority have been removed; backend profile and PIN services are now authoritative.
- The repo still contains historical docs and some one-off backend helper files. The README files added in this pass are the current navigation layer.

