# KANAKU: Modern Expense Tracker

> [!IMPORTANT]
> **AI DEVELOPER NOTICE**: Before making any changes, please read the [KANAKU_DEVELOPER_CONTEXT.md](./KANAKU_DEVELOPER_CONTEXT.md) for architecture rules and the design system guide.

KANAKUis a full-stack finance app with a React frontend, an Express/Prisma backend, Supabase integration, offline-first local storage, and AI-assisted import and receipt flows.

## Repo map

- [`frontend/`](./frontend/README.md): React app, IndexedDB/Dexie layer, scanners, importers, voice flow, and UI
- [`backend/`](./backend/README.md): Express API, auth, sync, Prisma models, sockets, and security middleware
- [`database/`](./database/README.md): raw SQL schemas and direct DB helper scripts
- [`api/`](./api/README.md): lightweight serverless endpoints
- [`supabase/`](./supabase/README.md): Supabase migrations, edge functions, and setup notes
- [`tests/`](./tests/README.md): fixtures, manual browser checks, runners, and scenario notes
- [`samples/`](./samples/README.md): place for demo receipts, imports, and document examples
- [`scripts/`](./scripts/README.md): top-level automation helpers
- [`docs/`](./docs/README.md): project structure, env reference, testing guide, and historical implementation docs
- [`resources/archive/frontend-experiments/`](./resources/archive/frontend-experiments/README.md): archived frontend backup files

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

