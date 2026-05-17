# KANKU  Pending Tasks, Enhancements & Dependencies

> Last updated: 9 May 2026  
> Use this file as the living backlog. Move items to `DONE` when completed.

---

## Table of Contents
1. [Critical / Must-Do](#1-critical--must-do)
2. [Backend Hardening](#2-backend-hardening)
3. [Frontend Hardening](#3-frontend-hardening)
4. [Offline & Sync](#4-offline--sync)
5. [Testing](#5-testing)
6. [Performance](#6-performance)
7. [DevOps & Deployment](#7-devops--deployment)
8. [New Features](#8-new-features)
9. [Dependencies to Install](#9-dependencies-to-install)
10. [Dependencies to Remove / Audit](#10-dependencies-to-remove--audit)
11. [Environment Variables Checklist](#11-environment-variables-checklist)

---

## 1. Critical / Must-Do

| # | Task | File(s) | Priority |
|---|---|---|---|
| ~~C-1~~ | ~~Refactor all backend controllers to use `next(err)` + `AppError`~~ | `auth`, `pin`, `sync`, `transactions`, `accounts`, `loans`, `goals`, `bills`, `friends`, `investments`, `stocks`, `dashboard` |  Done |
| ~~C-2~~ | ~~Stricter rate limiter on all auth endpoints~~ | `backend/src/app.ts` |  Done  auth-specific limiter present on `/auth/login` & `/auth/register` |
| ~~C-3~~ | ~~PIN change required biometric/OTP verification~~ | `backend/src/modules/pin/` |  Done  refactored to `AppError` + `next` |
| ~~C-4~~ | ~~Duplicate token keys in `TokenManager`~~ | `frontend/src/lib/api.ts` |  Done |
| ~~C-5~~ | ~~Supabase RLS policies for every user-scoped table~~ | `supabase/` |  Done  Migration 014 created |
| C-6 | Replace `any` types in controller function signatures with typed `AuthRequest` + proper DTO interfaces | `backend/src/modules/*/**.controller.ts` |  Partial  Auth, Investments, Stocks, Friends done; remaining: loans, goals, bills, dashboard |

---

## 2. Backend Hardening

| # | Task | File(s) | Priority |
|---|---|---|---|
| ~~B-1~~ | ~~`requestId` middleware~~ | `backend/src/app.ts` |  Done  `crypto.randomUUID()`, `X-Request-Id` header |
| ~~B-2~~ | ~~`express-async-errors`~~ | N/A |  Done  `try/catch + next(err)` used instead |
| ~~B-3~~ | ~~Centralise Prisma error codes in `errorHandler`~~ | `backend/src/middleware/error.ts` |  Done  P2002, P2025, P2003 + connectivity errors all handled centrally |
| ~~B-4~~ | ~~Global body sanitisation middleware~~ | `backend/src/app.ts` |  Done |
| ~~B-5~~ | ~~`helmet.contentSecurityPolicy` tuned for Supabase URLs~~ | `backend/src/app.ts` |  Done |
| ~~B-6~~ | ~~Sync routes validated~~ | `backend/src/modules/sync/sync.routes.ts` |  Done |
| ~~B-7~~ | ~~`server.js` at root removed / clarified~~ | `backend/server.js` |  Confirmed  root `server.js` is a legacy CJS shim; TypeScript entry is `src/server.ts` |
| ~~B-8~~ | ~~Pagination on `GET /transactions`~~ | `backend/src/modules/transactions/` |  Done  page/limit params with max 200 |
| ~~B-9~~ | ~~HTTP request logging~~ | `backend/src/app.ts` |  Done  Winston structured logging on every request |
| ~~B-10~~ | ~~Stocks module error shape~~ | `api/stocks.ts` |  Done  `{ success, error, code }` envelope |

---

## 3. Frontend Hardening

| # | Task | File(s) | Priority |
|---|---|---|---|
| ~~F-1~~ | ~~Replace `any` in `api.ts` helper methods (`post`, `put`, `patch`, `parseResponseBody`)~~ | `frontend/src/lib/api.ts` |  Done  changed to `unknown`; catch blocks typed explicitly |
| ~~F-2~~ | ~~`safeExecute` uses raw `error.message`~~ | `frontend/src/lib/errorHandling.ts` |  Done  pipes through `resolveUserMessage()` friendly map |
| ~~F-3~~ | ~~`wrapAsyncFunction` exposes technical `error.message`~~ | `frontend/src/lib/errorHandling.ts` |  Done  uses `resolveUserMessage()` before creating `AppError` |
| ~~F-4~~ | ~~`setupGlobalErrorHandlers()` in entry point~~ | `frontend/src/index.tsx` |  Done |
| ~~F-5~~ | ~~Global `<ErrorBoundary>` wrapper~~ | `frontend/src/app/App.tsx` |  Done  `PageErrorBoundary` logs via `componentDidCatch`, shows friendly message |
| F-6 | `ProfileCache` 5-second TTL  consider TanStack Query | `frontend/src/lib/api.ts` |  Low |
| F-7 | Zod-based response schema validation on API responses | `frontend/src/lib/api.ts` |  Medium |
| ~~F-8~~ | ~~Toast duration constants~~ | `frontend/src/lib/errorHandling.ts` |  Done  `TOAST_DURATION` exported |
| F-9 | Loading skeleton/spinner for all data-fetching states | `frontend/src/components/` |  Low |
| ~~F-10~~ | ~~Offline indicator banner~~ | `frontend/src/components/OfflineBanner.tsx` |  Done  wired in `App.tsx` |

---

## 4. Offline & Sync

| # | Task | File(s) | Priority |
|---|---|---|---|
| ~~S-1~~ | ~~Dexie schema: `syncStatus` + `updatedAt` on all sync tables~~ | `frontend/src/lib/database.ts` |  Done  version 10 adds `syncStatus` index on accounts, transactions, loans, goals, investments, friends, group_expenses, toDoLists, toDoItems |
| S-2 | Implement `syncStatus: 'error'` path + `retryAsync` retry loop for failed writes | `frontend/src/services/` |  High |
| S-3 | Audit `sync.service.ts` conflict strategy (server-wins vs last-write-wins by `updatedAt`) | `backend/src/modules/sync/sync.service.ts` |  High |
| ~~S-4~~ | ~~`userId` in Dexie compound index (user-scoped sync queue)~~ | `frontend/src/lib/database.ts` |  Done  `syncQueue` table indexed on `userId` in version 10 |
| S-5 | Service Worker for background sync via Workbox | `frontend/src/` |  Medium |

---

## 5. Testing

| # | Task | File(s) | Priority |
|---|---|---|---|
| T-1 | Unit tests for `AppError` + `errorHandler`  test each normalisation path | `backend/tests/` |  Medium |
| T-2 | Unit tests for `ValidationErrorHandler.showErrors`  confirm no field names in toast | `frontend/` (vitest) |  Medium |
| T-3 | Integration tests for `POST /auth/login` + `POST /auth/register` with invalid inputs | `backend/tests/integration/auth.test.ts` |  Medium |
| T-4 | Frontend Vitest tests for `ErrorFactory.fromHTTPStatus` covering all status codes | `frontend/` (vitest) |  Low |
| T-5 | E2E tests (Playwright or Cypress) for login  registration  transaction CRUD | `tests/` |  Low |
| T-6 | Review & fix failing tests reported in `jest_results*.txt` before next release | `backend/jest_results*.txt` |  Medium |
| T-7 | Add test coverage thresholds in `jest.config.ts` + `vitest.config.ts` (target  80%) | Config files |  Low |

---

## 6. Performance

| # | Task | File(s) | Priority |
|---|---|---|---|
| ~~P-1~~ | ~~Database indexes on `userId` + `createdAt` for `transactions`, `accounts`, `loans`, `goals`~~ | `backend/prisma/schema.prisma` |  Done  `@@index([userId])`, `@@index([createdAt])`, `@@index([deletedAt])` on all core models |
| P-2 | TanStack Query for all server-state fetching | Frontend-wide |  Medium |
| P-3 | Route-level code splitting with `React.lazy` for Dashboard, Reports, Investments | `frontend/src/app/` |  Medium |
| P-4 | Bundle analysis  run `npx vite-bundle-visualizer` | Root |  Low |
| ~~P-5~~ | ~~`tesseract.js` lazy loaded only when receipt scanner is used~~ | `frontend/src/services/tesseractOCRService.ts` |  Done |

---

## 7. DevOps & Deployment

| # | Task | File(s) | Priority |
|---|---|---|---|
| ~~D-1~~ | ~~`.env.example` for frontend with all `VITE_*` variables~~ | Root `.env.example` |  Done |
| D-2 | Consolidate `docker-compose.yml` at root + `backend/` into one root-level file | Root `docker-compose.yml` |  Low |
| ~~D-3~~ | ~~GitHub Actions CI: lint  type-check  test on every PR~~ | `.github/workflows/ci.yml` |  Done  created with backend Jest + frontend Vitest jobs |
| ~~D-4~~ | ~~`prisma migrate deploy` in Dockerfile before server start~~ | `backend/Dockerfile` |  Done  `CMD` updated to `sh -c "npx prisma migrate deploy && npm start"`; Node upgraded to 20 |
| D-5 | Verify Vercel serverless functions in `api/` match Express response shapes | `api/`, `vercel.json` |  Medium |
| D-6 | Move Android keystore out of git to CI secrets / secrets manager | `android/finance-life-release.keystore` |  **Security risk  keystore tracked in git** |

---

## 8. New Features (Backlog)

| # | Feature | Notes | Priority |
|---|---|---|---|
| N-1 | Push notifications for bill due dates | `@capacitor/local-notifications` installed  wire to `bills` module |  Medium |
| N-2 | Export transactions as PDF / CSV | `jspdf` + `papaparse` installed  build export service |  Medium |
| N-3 | AI spending insights (monthly summary, anomaly alerts) | `@google/generative-ai` on backend  build `/api/v1/ai/insights` |  Medium |
| N-4 | Multi-currency support | Store currency per account, convert on display |  Low |
| N-5 | Recurring transaction scheduling | Auto-create via cron |  Low |
| N-6 | Dark / Light / System theme toggle | `next-themes` installed |  Low |
| N-7 | Biometric login (fingerprint / Face ID) | `@capacitor/biometric-auth` plugin |  Low |
| N-8 | Book Advisor feature (end-to-end, all roles) | `advisors/`, `bookings/` modules exist in backend  complete frontend UI |  High |
| N-9 | Admin dashboard  full feature set | Enable/disable users, manage advisor roles, audit logs |  High |
| N-10 | Shared expenses / groups frontend UI | `groups/` + `friends/` modules exist in backend |  Medium |

---

## 9. Dependencies to Install

> **Do not install anything unless you run the app and confirm it is missing.**

### Backend (`cd backend && npm install <package>`)

| Package | Why |
|---|---|
| `express-async-errors` | Auto-forward async errors to `next`  eliminates try/catch boilerplate |
| `morgan` + `@types/morgan` | HTTP access log (optional if Winston request logging is sufficient) |
| `uuid` + `@types/uuid` | Request ID generation (currently using `crypto.randomUUID()`  only needed if Node < 14.17) |

### Frontend (root `npm install <package>`)

| Package | Why |
|---|---|
| `@tanstack/react-query` + `@tanstack/react-query-devtools` | Server-state cache (replaces useEffect+useState fetch patterns) |
| `vite-bundle-visualizer` (dev) | Bundle size analysis |
| `@sentry/react` + `@sentry/vite-plugin` (dev) | Production error monitoring |
| `workbox-precaching` + `workbox-routing` | Full PWA service worker caching |
| `@vitest/coverage-v8` (dev) | Vitest code coverage |

### Copy-paste install commands

```powershell
# Backend
cd C:\Users\sashra19\Documents\Intellij\KANKU\backend
npm install express-async-errors

# Frontend (from root)
cd C:\Users\sashra19\Documents\Intellij\KANKU
npm install @tanstack/react-query
npm install -D @tanstack/react-query-devtools vite-bundle-visualizer @vitest/coverage-v8
```

---

## 10. Dependencies to Remove / Audit

| Package | Location | Reason |
|---|---|---|
| `sqlite3` | Root `package.json` | Frontend should not use SQLite  Dexie/IndexedDB used instead |
| `sqlite3` | `backend/package.json` | Backend uses Prisma + PostgreSQL  verify this is only for `dev.db` local mode |
| `bcrypt` + `bcryptjs` | Both `package.json` files | Both installed  standardise on `bcryptjs` (pure-JS, cross-platform) |
| `axios` | Root `package.json` | Frontend uses custom Fetch-based `HTTPClient` in `api.ts`  remove if truly unused |
| `react-slick` | Root `package.json` | `embla-carousel-react` also installed  remove whichever is unused |
| `regenerator-runtime` | Root `package.json` | Not needed with Vite + modern browser targets |
| `@types/helmet` | `backend/package.json` | `helmet` v8+ ships own types  `@types/helmet` may conflict |
| `check-*.js`, `test-*.js` | `backend/` root | Dev utility scripts  move to `backend/scripts/` or delete |

---

## 11. Environment Variables Checklist

### Backend (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` |  Yes | PostgreSQL connection string |
| `JWT_SECRET` |  Yes | Min 32 chars random string |
| `SUPABASE_URL` |  Yes | From Supabase project settings |
| `SUPABASE_ANON_KEY` |  Yes | Public anon key |
| `SUPABASE_SERVICE_KEY` |  Yes | **Never expose to frontend** |
| `SUPABASE_JWT_SECRET` |  Yes | From Supabase  Settings  API |
| `FRONTEND_URL` |  Yes | CORS allowed origin |
| `NODE_ENV` |  Yes | `development` / `production` |
| `PORT` |  Optional | Default `3000` |
| `REDIS_URL` |  Optional | For ioredis rate-limit store |
| `GEMINI_API_KEY` |  Optional | For `@google/generative-ai` AI features |
| `RECEIPT_OCR_ENDPOINT` |  Optional | Local OCR.space fallback endpoint |

### Frontend (`.env` at root)

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` |  Yes | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` |  Yes | Public anon key only |
| `VITE_API_URL` |  Yes | Backend base URL |
| `VITE_APP_ENV` |  Optional | `development` / `production` for feature flags |
| `VITE_ENABLE_DIRECT_CLOUD_SYNC` |  Optional | `true` to bypass backend and sync directly to Supabase |

---

## Done 

- [x] **AppError**  class with factory methods created (`backend/src/utils/AppError.ts`)  9 May 2026
- [x] **Central errorHandler**  handles Prisma errors (P2002 unique, P2025 not-found, P2003 FK, connectivity), Zod errors, malformed JSON  9 May 2026
- [x] **Frontend api.ts**  toasts replaced with `ErrorHandler.handle()` + friendly `USER_FRIENDLY_MESSAGES` map  9 May 2026
- [x] **ValidationErrorHandler**  `showErrors` no longer exposes raw field names  9 May 2026
- [x] **console.log cleanup**  `console.error/warn/info` used throughout frontend and backend  9 May 2026
- [x] **Skill docs**  `docs/skills/frontend.skill.md`, `backend.skill.md`, `database.skill.md`, `security.skill.md`  9 May 2026
- [x] **C-1**  Full backend controller refactor (auth, pin, sync, transactions, accounts, loans, goals, bills, friends, investments, stocks, dashboard)  9 May 2026
- [x] **C-2**  Auth rate limiter present on `/auth/login` + `/auth/register`  9 May 2026
- [x] **C-3**  PIN routes refactored with `AppError` + `next`, `requireUserId` guard  9 May 2026
- [x] **C-5**  Supabase RLS Migration 014 created for all PascalCase Prisma tables  9 May 2026
- [x] **B-1**  `requestId` middleware (`crypto.randomUUID()`, `X-Request-Id` header)  9 May 2026
- [x] **B-3**  Prisma error normalisation fully in central `errorHandler`  9 May 2026
- [x] **B-4**  Global body-sanitize middleware in `app.ts`  9 May 2026
- [x] **B-5**  `helmet` CSP configured for Supabase storage URLs  9 May 2026
- [x] **B-6**  Sync routes hardened with `AppError` validation + `requireUserId`  9 May 2026
- [x] **B-8**  Pagination (page/limit) implemented in `GET /transactions`  9 May 2026
- [x] **B-10**  `api/stocks.ts` standardised to `{ success, error, code }` envelope  9 May 2026
- [x] **F-1**  `any` replaced with `unknown` in `post`, `put`, `patch`, `parseResponseBody` in `api.ts`  9 May 2026
- [x] **F-2**  `safeExecute` uses `resolveUserMessage()`  no raw `error.message` to users  9 May 2026
- [x] **F-3**  `wrapAsyncFunction` uses `resolveUserMessage()`  no raw stack traces shown  9 May 2026
- [x] **F-4**  `setupGlobalErrorHandlers()` wired in `index.tsx` (actual entry point)  9 May 2026
- [x] **F-5**  `PageErrorBoundary` logs via `componentDidCatch`, shows friendly message  9 May 2026
- [x] **F-8**  `TOAST_DURATION` constants (`SHORT/NORMAL/ERROR`) exported from `errorHandling.ts`  9 May 2026
- [x] **F-10**  `OfflineBanner` component wired in `App.tsx`  9 May 2026
- [x] **S-1**  Dexie v10: `syncStatus` indexed on accounts, transactions, loans, goals, investments, friends  9 May 2026
- [x] **S-4**  `syncQueue` table in Dexie scoped by `userId` index  9 May 2026
- [x] **P-1**  Prisma schema: `@@index([userId])`, `@@index([createdAt])`, `@@index([deletedAt])` on all core models  9 May 2026
- [x] **P-5**  `tesseract.js` lazy-loaded only when receipt scanner is used  9 May 2026
- [x] **D-1**  Frontend `.env.example` with all `VITE_*` variables  9 May 2026
- [x] **D-3**  GitHub Actions CI workflow created (`.github/workflows/ci.yml`)  backend Jest + frontend Vitest  9 May 2026
- [x] **D-4**  `Dockerfile` updated: Node 20, `prisma generate`, `CMD` runs `prisma migrate deploy && npm start`  9 May 2026
- [x] **resolveUserMessage()**  new helper in `errorHandling.ts` maps HTTP status + API codes to friendly strings  9 May 2026
- [x] **Bug #1  Add Account fails (503)**  `saveAccountWithBackendSync` falls back to local Dexie + sync queue on 503/network errors  9 May 2026
- [x] **Bug #2  Dashboard empty**  Data preserved in Dexie; `markOptionalBackendUnavailable()` prevents repeat backend hits  9 May 2026
- [x] **Bug #3  Page refresh on navigation**  `handleUnhandledRejection` guard added (only reloads for Vite chunk failures, not API errors)  9 May 2026
- [x] **Bug #4  Receipt total mismatch**  `normalizeOcrResponse` fixed: `net_total`/`nett` excluded from grand-total candidates; validation non-circular; `ValidationWarning` UI improved  9 May 2026
- [x] **saveTransactionWithBackendSync**  offline fallback (local Dexie + sync queue) when backend is unavailable  9 May 2026
- [x] **updateAccountWithBackendSync**  offline fallback when backend PUT returns 503  9 May 2026
