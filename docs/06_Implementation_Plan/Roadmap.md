# Implementation Plan / Roadmap — Kanaku

## Phase 1: Planning
- Finalize PRD (`../01_Product_Requirement_Document_PRD`).
- Approve UI/UX wireframes and flows.
- Lock data schema + API contracts.

## Phase 2: Development
- **Backend:** `/api/v1` routes, zod validation middleware, JWT auth, ownership checks.
- **Data:** Prisma models + migrations; atomic balance/transaction logic.
- **Frontend:** React + Dexie local-first writes; sync service with retry.
- **Receipts:** OCR pipeline + confirm-before-save.

## Phase 3: Testing
- Unit tests (Jest, backend).
- E2E (Playwright) for login, add transaction, offline→sync.
- Security review: Helmet/CORS/rate-limit, no secrets, validation coverage.

## Phase 4: Deployment
- Containerize (Docker), deploy API (Fly.io), frontend (Vercel).
- Smoke tests + health checks.
- Production release + monitoring.

## Pre-Flight Check (every change)
1. Dexie-to-cloud sync remains consistent.
2. Validation middleware exists on changed/new routes.
3. Endpoint pathing correctly versioned under `/api/v1`.

