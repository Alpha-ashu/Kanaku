# Reason: root .env.example archived
- Date: 2026-06-19
- Author: @Alpha-ashu
- What: The repo-root `.env.example` "mega-template" was archived. It duplicated
  backend and frontend variables into one file but NO process ever read a root `.env`.
- Verification (which file each process actually loads):
  - Backend API server: `backend/src/server.ts` -> `import 'dotenv/config'` with CWD=backend -> `backend/.env`
  - Prisma (db:migrate / db:seed): `cd backend && npx prisma ...` -> `backend/.env`
  - `backend/apply_schema.cjs`: now loads `backend/.env` (was `../.env`, fixed in this change)
  - `scripts/dev-full.mjs` (root `npm run dev`): `readEnvFile(resolve(backendDir, '.env'))` -> `backend/.env`
  - Frontend (Vite): `frontend/.env`
  - `docker-compose.yml`: hardcoded `environment:` values, reads no `.env`
- No information lost: the Docker vars it documented are already hardcoded in
  `docker-compose.yml`; the VITE_* vars live in `frontend/.env.example`.
- Canonical env files going forward:
  - `backend/.env`  (template: `backend/.env.example`)  <- DATABASE_URL / DB password lives HERE
  - `frontend/.env` (template: `frontend/.env.example`)
  - `backend/.env.test` (jest)
- Safe to delete after: 2026-12-19 (6-month cooling-off)
