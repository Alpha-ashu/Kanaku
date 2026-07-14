# Kanakku Application — Complete Architecture Workflow

> **Living Document** — Generated 2026-07-14 | Based on full codebase analysis  
> Covers: Frontend ↔ Backend ↔ Database communication, security layers, identified gaps, and fixes

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack Map](#2-tech-stack-map)
3. [Complete Request Lifecycle](#3-complete-request-lifecycle)
4. [Authentication Architecture](#4-authentication-architecture)
5. [Security Layers — Where Each Check Lives](#5-security-layers)
6. [Data Persistence Flow](#6-data-persistence-flow)
7. [Sync Architecture](#7-sync-architecture)
8. [Caching Architecture](#8-caching-architecture)
9. [Frontend State Management](#9-frontend-state-management)
10. [Root Cause Analysis — All 5 Problems](#10-root-cause-analysis)
11. [Security Vulnerability Assessment](#11-security-vulnerability-assessment)
12. [Missing Gaps & Fixes Required](#12-missing-gaps--fixes-required)
13. [Performance Analysis](#13-performance-analysis)
14. [Test Accounts](#14-test-accounts)
15. [Verification Checklist](#15-verification-checklist)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KANAKKU SYSTEM ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────┐       ┌─────────────────────┐                       │
│  │   FRONTEND (Vite)   │       │   BACKEND (Express)  │                       │
│  │   React + TypeScript│◄─────►│   Node.js + Prisma   │                       │
│  │   Dexie (IndexedDB) │       │   TypeScript         │                       │
│  │   Supabase Client   │       │   In-Memory Cache    │                       │
│  └─────────────────────┘       └─────────┬───────────┘                       │
│           │                              │                                     │
│           │ Supabase Auth SDK             │ Prisma ORM                         │
│           ▼                              ▼                                     │
│  ┌─────────────────────┐       ┌─────────────────────┐                       │
│  │   SUPABASE AUTH     │       │   POSTGRESQL (DB)   │                       │
│  │   JWT Issuance      │       │   Primary + Replica  │                       │
│  │   Row Level Security│       │   Audit Log Table   │                       │
│  └─────────────────────┘       └─────────────────────┘                       │
│                                                                               │
│  Deployment: Vercel (Frontend) | Render/Fly.io (Backend) | Supabase (DB)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack Map

| Layer | Technology | File / Location |
|-------|-----------|-----------------|
| **Frontend Framework** | React 18 + Vite | `frontend/src/` |
| **Frontend Language** | TypeScript | throughout |
| **UI State** | React Context + useState/useEffect | `frontend/src/contexts/` |
| **Local Database** | Dexie.js (IndexedDB) | `frontend/src/lib/database.ts` |
| **API Client** | Custom fetch wrapper | `frontend/src/lib/api.ts` |
| **Auth Provider** | Supabase Auth + Custom JWT | `frontend/src/contexts/AuthContext.tsx` |
| **Socket Client** | Custom Socket.IO client | `frontend/src/lib/socket-client.ts` |
| **Backend Framework** | Express.js | `backend/src/app.ts` |
| **Backend Language** | TypeScript | throughout |
| **ORM** | Prisma v5 | `backend/src/db/prisma.ts` |
| **Database** | PostgreSQL (via Supabase) | `backend/src/db/` |
| **Auth** | Supabase Auth + Custom JWT (dual) | `backend/src/middleware/auth.ts` |
| **Cache** | In-memory TTL Map (Redis-free) | `backend/src/cache/redis.ts` |
| **Rate Limiting** | In-memory + Redis fallback | `backend/src/middleware/rateLimit.ts` |
| **RBAC** | Role-based middleware | `backend/src/middleware/rbac.ts` |
| **Feature Flags** | DB-backed + in-memory cache | `backend/src/middleware/featureGate.ts` |
| **Idempotency** | Cache-based replay | `backend/src/middleware/idempotency.ts` |
| **Audit Logging** | Prisma interceptor + AuditLog table | `backend/src/db/prisma.ts` |
| **Observability** | Prometheus + Grafana | `platform/observability/` |

---

## 3. Complete Request Lifecycle

### 3.1 Standard API Request Flow

```
USER ACTION (Click / Form Submit)
         │
         ▼
[FRONTEND: Component]
  └─ Validates input locally
  └─ Calls api.{feature}.{action}()
         │
         ▼
[FRONTEND: api.ts — TokenManager]
  └─ Retrieves access token from memory/localStorage
  └─ Adds: Authorization: Bearer <token>
  └─ Adds: X-Request-Id: <uuid>
  └─ Adds: Idempotency-Key (for mutations)
  └─ Adds: X-Client-Platform: native (mobile only)
         │
         ▼
[NETWORK: HTTPS to Backend]
  └─ TLS 1.2/1.3 encrypted
  └─ Vercel proxy → Render/Fly.io backend
         │
         ▼
[BACKEND MIDDLEWARE CHAIN — app.ts]
  │
  ├─ [1] Request ID stamp (X-Request-Id header)
  ├─ [2] requestContext (AsyncLocalStorage — tracks user/IP/agent per request)
  ├─ [3] requestTimeout (hard kill after REQUEST_TIMEOUT_MS)
  ├─ [4] metricsMiddleware (p50/p95/p99 latency counters)
  ├─ [5] helmet (CSP, HSTS, X-Frame-Options, etc.)
  ├─ [6] CORS (allowlist check: isAllowedOrigin)
  ├─ [7] express.json (body parse, 1MB limit, rawBody for HMAC)
  ├─ [8] Global body sanitization (strip HTML/script tags)
  ├─ [9] rateLimit (IP-based, 60 req/min global)
  ├─ [10] Route-specific rate limit (auth=20/min, bills=10/min, etc.)
         │
         ▼
[BACKEND: authMiddleware — auth.ts]
  │
  ├─ Extract Bearer token from Authorization header
  ├─ TRY 1: Custom JWT verification (jwt.verify with JWT_SECRET)
  │    └─ Check: type !== 'refresh' (prevent refresh token API abuse)
  │    └─ getUserAuthSnapshot: DB lookup → in-memory cache (60s TTL)
  │    └─ Check: USER_NOT_FOUND → 401 (deleted account)
  │    └─ Check: isAccountLocked → 403 (suspended)
  │    └─ Attach req.userId, req.user (role from DB, never from token claims)
  │    └─ idleSessionRejected check
  │
  ├─ TRY 2: Supabase JWT verification (jwt.verify with SUPABASE_JWT_SECRET)
  │    └─ Fast local verify — no network call
  │    └─ getUserAuthSnapshot → same cache path
  │    └─ Role from DB snapshot ONLY (user_metadata not trusted)
  │
  └─ TRY 3: Supabase API verification (sb.auth.getUser — network call)
       └─ Last resort: handles edge cases
       └─ Provisions shadow user row if first-time Supabase user
       └─ idleSessionRejected check
         │
         ▼
[BACKEND: requireRole / requireFeature / requireApproved]
  └─ RBAC: role must be in allowedRoles array
  └─ Feature gate: DB-backed flag + 30s in-memory cache
  └─ requireApproved: advisors must be approved
         │
         ▼
[BACKEND: Route Handler / Controller]
  └─ Input validation (Zod schema or custom)
  └─ Business logic (Service layer)
         │
         ▼
[BACKEND: Service Layer]
  └─ Domain validation (ownership, constraints)
  └─ Idempotency check (dedupHash for transactions)
  └─ Calls Repository
         │
         ▼
[BACKEND: Repository / Prisma]
  └─ DB TRANSACTION BEGIN
  └─ Insert/Update/Delete in atomic block
  └─ Balance delta applied with row lock
  └─ Audit interceptor fires on EVERY write (AUDIT_MODELS)
  └─ AuditLog.create (best-effort, never blocks user op)
  └─ DB TRANSACTION COMMIT
  └─ Cache invalidated: cacheDeleteByPrefix()
  └─ Event emitted: eventBus.emit(TRANSACTION_CREATED)
         │
         ▼
[BACKEND: Response]
  └─ 200/201 with structured JSON
  └─ Error handler shapes all errors consistently
         │
         ▼
[FRONTEND: api.ts receives response]
  └─ Parses JSON
  └─ On 401: dispatches KANAKU_SESSION_EXPIRED event (not hard redirect)
  └─ On success: returns typed ApiResponse<T>
         │
         ▼
[FRONTEND: State Update]
  └─ Component updates local state
  └─ Dexie (IndexedDB) updated for offline cache
  └─ UI re-renders with new data
         │
         ▼
USER SEES UPDATED DATA
```

---

## 4. Authentication Architecture

### 4.1 Login Flow (Step-by-Step)

```
USER enters email + password
         │
         ▼
POST /api/v1/auth/login/challenge
  └─ Rate-limited: 5 attempts/min/IP (loginLimiter)
  └─ Returns short-lived challenge token (no password transmitted raw)
         │
         ▼
POST /api/v1/auth/login
  └─ Sends challenge response
  └─ Backend verifies: bcrypt.compare(password, hash)
  └─ On success: generateTokens() → access + refresh JWTs
  └─ Sets HttpOnly SameSite=Strict cookie (web clients)
  └─ Returns access token in body (native/mobile clients)
  └─ Sends login alert email (if new device detected)
  └─ establishes idle session (server-side activity tracking)
         │
         ▼
[FRONTEND: TokenManager.storeTokens()]
  └─ Access token → memory (never localStorage for security)
  └─ Refresh token → HttpOnly cookie (web) / device storage (native)
         │
         ▼
[FRONTEND: AuthContext — onAuthStateChange fires]
  └─ Decodes JWT (client-side, no verification — for UI only)
  └─ Sets user, session state
  └─ setDataReady(false) — blocks financial data access
  └─ setDataSyncing(true)
  └─ Fires: permissionService.fetchUserPermissions()
         │
         ▼
[FRONTEND: Data Sync Gate]
  └─ After PIN unlock (if enabled):
     └─ syncFromSupabase() with force=true
     └─ Timeout: 12s first attempt, 30s retry
     └─ syncUserDataFromCloud() — pulls all tables
     └─ syncProfileFromBackend() — fetches profile
  └─ setDataReady(true) — unlocks financial pages
         │
         ▼
USER SEES DASHBOARD WITH DATA
```

### 4.2 Token Refresh Flow

```
Access token expiry (JWT exp claim)
         │
         ▼
[FRONTEND: api.ts intercepts 401]
  └─ Checks if already refreshing (queues duplicate requests)
  └─ POST /api/v1/auth/refresh
       └─ Sends: refresh token (cookie or X-Refresh-Token header)
       └─ Backend: verifyRefreshToken()
       └─ Issues new access + refresh tokens
       └─ Sets new HttpOnly cookie
  └─ Replays queued requests with new token
         │
         ▼
On refresh failure:
  └─ Dispatches: KANAKU_SESSION_EXPIRED event
  └─ TokenManager.clearTokens()
  └─ backendService.clearToken()
  └─ socketClient.disconnect()
  └─ clearLocalUserData() — clears Dexie
  └─ clearLocalAuthPresentationState()
  └─ setUser(null) → Login screen shown
```

### 4.3 Session Lifecycle State Machine

```
[SIGNED OUT]
     │ Login success
     ▼
[AUTHENTICATED - dataReady=false, dataSyncing=true]
     │ permissionService.fetchUserPermissions() resolves
     │ (+ PIN unlock if enabled)
     │ syncFromSupabase() completes
     ▼
[AUTHENTICATED - dataReady=true]   ←─── All pages functional
     │
     ├─ PIN lock (inactivity)
     │    ▼
     │  [PIN LOCKED - dataReady=false]
     │    │ PIN entered
     │    ▼
     │  [AUTHENTICATED - dataReady=true]
     │
     ├─ Token refresh success → continue
     │
     ├─ Idle timeout (server-side)
     │    ▼
     │  [SESSION_IDLE_TIMEOUT 401]
     │    ▼
     │  [SIGNED OUT] ─ loop back to Login
     │
     └─ Token expired + refresh fails
          ▼
        [SIGNED OUT]
```

---

## 5. Security Layers

### 5.1 Security Check Map — Where Each Vulnerability is Caught

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    SECURITY ENFORCEMENT POINTS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  LAYER 0 — NETWORK / TLS                                                    │
│  ✓ HTTPS enforced (Vercel + Render TLS termination)                         │
│  ✓ HSTS header: max-age=63072000 (2 years), includeSubDomains, preload      │
│  Location: backend/src/app.ts → helmet() config                             │
│                                                                               │
│  LAYER 1 — HTTP HEADERS (Helmet)                                             │
│  ✓ Content-Security-Policy (CSP) — prevents XSS script injection            │
│  ✓ X-Frame-Options / frameAncestors: none — prevents clickjacking           │
│  ✓ Cross-Origin-Resource-Policy: same-origin                                │
│  ✓ Referrer-Policy: strict-origin-when-cross-origin                         │
│  ✓ X-Powered-By DISABLED — prevents server fingerprinting                   │
│  ✓ CSP nonce per request — no unsafe-inline in production                   │
│  Location: backend/src/app.ts (lines 74–111)                                │
│                                                                               │
│  LAYER 2 — CORS                                                              │
│  ✓ Origin allowlist (isAllowedOrigin function)                              │
│  ✓ Credentials: true (for HttpOnly cookie)                                  │
│  ✓ Allowed headers explicitly listed                                         │
│  Location: backend/src/app.ts (lines 113–134) + backend/src/config/cors.ts │
│                                                                               │
│  LAYER 3 — RATE LIMITING                                                    │
│  ✓ Global API: 60 req/min/IP (production)                                  │
│  ✓ Auth routes: 20 req/min/IP                                               │
│  ✓ Login challenge: 5 req/min/IP (brute-force protection)                  │
│  ✓ OTP: 5 req/10min/IP                                                      │
│  ✓ Register: 10 req/hour/IP                                                 │
│  ✓ Refresh: 10 req/min/IP                                                   │
│  ✓ Bills/Receipts: 10 and 8 req/min (per user)                             │
│  Location: backend/src/middleware/rateLimit.ts + auth.routes.ts             │
│                                                                               │
│  LAYER 4 — INPUT SANITIZATION                                                │
│  ✓ Global HTML/script tag stripping on ALL request bodies                  │
│  ✓ JSON body size limit: 1MB                                                │
│  ✓ Email regex validation (local@domain.tld, no SQL chars)                 │
│  ✓ Zod schema validation on auth profile updates                            │
│  Location: backend/src/app.ts (lines 144–172) + middleware/validate.ts      │
│                                                                               │
│  LAYER 5 — AUTHENTICATION                                                   │
│  ✓ JWT verification (custom JWT_SECRET → Supabase → Supabase API fallback) │
│  ✓ Refresh tokens CANNOT authorize API calls (type check)                  │
│  ✓ Deleted account check (USER_NOT_FOUND sentinel)                         │
│  ✓ Account suspension check (isAccountLocked)                               │
│  ✓ Idle session enforcement (server-side activity tracking)                 │
│  ✓ In-memory snapshot cache (60s TTL) — avoids DB hammering                │
│  Location: backend/src/middleware/auth.ts                                    │
│                                                                               │
│  LAYER 6 — AUTHORIZATION (RBAC)                                              │
│  ✓ requireRole: admin / manager / advisor / user                            │
│  ✓ requireApproved: advisors need explicit admin approval                   │
│  ✓ ownerOnly: resource ownership verified against req.userId               │
│  ✓ ALL role assignments come from DB ONLY — token role claims never trusted │
│  ✓ Supabase user_metadata.role explicitly IGNORED (user-writable)          │
│  Location: backend/src/middleware/rbac.ts                                    │
│                                                                               │
│  LAYER 7 — FEATURE GATES                                                    │
│  ✓ requireFeature(module, subFeature) — DB-backed per-role access matrix   │
│  ✓ 30-second in-memory cache per feature load                               │
│  ✓ Deny-by-default: missing feature = denied                                │
│  ✓ Every denial produces authz.denied audit event                           │
│  Location: backend/src/middleware/featureGate.ts                             │
│                                                                               │
│  LAYER 8 — SECURITY GATE (Sensitive Operations)                             │
│  ✓ x-security-token header required for sensitive ops                      │
│  ✓ Token verified: type=security_verification, sub=userId match            │
│  ✓ 5-minute TTL — must be freshly issued by biometric/OTP                 │
│  Location: backend/src/middleware/securityGate.ts                            │
│                                                                               │
│  LAYER 9 — DATABASE SECURITY                                                 │
│  ✓ Parameterized queries via Prisma (SQL injection prevention)              │
│  ✓ Row-level ownership: every query includes userId filter                 │
│  ✓ Atomic transactions: balance + transaction write in single TX            │
│  ✓ No-overdraw enforcement: row lock prevents race conditions               │
│  ✓ Prisma audit interceptor: ALL financial writes logged to AuditLog       │
│  ✓ Audit log is append-only (DB-level constraint)                          │
│  Location: backend/src/db/prisma.ts + transaction.repository.ts             │
│                                                                               │
│  LAYER 10 — TOKEN SECURITY                                                   │
│  ✓ Access tokens in memory only (never localStorage)                       │
│  ✓ Refresh tokens in HttpOnly SameSite=Strict cookie (web)                │
│  ✓ Native clients: refresh token in device secure storage                  │
│  ✓ Tokens cleared on session expiry / logout                                │
│  Location: frontend/src/lib/api.ts → TokenManager                          │
│                                                                               │
│  LAYER 11 — WEBHOOK SIGNATURE                                                │
│  ✓ HMAC-SHA256 signature on raw body bytes                                 │
│  ✓ rawBody preserved at body parse (app.ts verify hook)                    │
│  Location: backend/src/security/webhookSignature.ts                         │
│                                                                               │
│  LAYER 12 — ENCRYPTION (Frontend)                                            │
│  ✓ clearSecurityData() on logout                                            │
│  ✓ PIN data cleared on session expiry                                       │
│  Location: frontend/src/lib/encryption.ts + pinService.ts                  │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Security Audit Event Trail

Every security-relevant event writes to `AuditLog`:

| Event | Trigger | Fields Logged |
|-------|---------|---------------|
| `auth.login_failed` | Bad token, idle timeout | userId, IP, reason |
| `authz.denied` | RBAC/feature rejection | userId, role, required roles |
| `security.rate_limit_hit` | Rate limit exceeded | scope, IP, limit |
| `data.create` | Any financial write | userId, model, before/after |
| `data.update` | Any financial update | userId, model, before/after |
| `data.delete` | Any financial delete | userId, model, before |

---

## 6. Data Persistence Flow

### 6.1 Transaction Create Flow (End-to-End)

```
[UI: User clicks "Add Transaction"]
         │
         ▼
[Component: validates fields locally]
  └─ accountId, amount, category, date, type — all required
         │
         ▼
[api.ts: POST /api/v1/transactions]
  └─ Authorization: Bearer <access_token>
  └─ Idempotency-Key: <uuid> (generated per form submission)
  └─ X-Request-Id: <uuid>
         │
         ▼
[Middleware chain runs (see Section 3.1)]
         │
         ▼
[transaction.routes.ts]
  └─ authMiddleware ✓
  └─ requireFeature('transactions', 'addTransaction') ✓
  └─ idempotency({ scope: 'transactions-create' }) ✓
  └─ validateBody(transactionSchema) ✓
         │
         ▼
[transaction.controller.ts]
  └─ Extracts userId from req.userId
  └─ Calls transactionService.createTransaction(userId, body)
         │
         ▼
[transaction.service.ts]
  └─ Validates required fields
  └─ Parses amount to Decimal (precise, no float drift)
  └─ Validates date format
  └─ Checks account ownership + isActive (not deleted/archived)
  └─ For transfers: validates both accounts + same-account rejection
  └─ Generates dedupHash: SHA256(userId:amount:date:description)
  └─ Checks for existing transaction with same dedupHash (idempotency)
  └─ Calculates balance deltas (income +, expense -, transfer ±)
  └─ Calls transactionRepository.createWithBalanceUpdate()
         │
         ▼
[transaction.repository.ts — DB TRANSACTION]
  ├─ BEGIN TRANSACTION
  ├─ transaction.create() — inserts transaction row
  ├─ For each account in balance deltas:
  │    └─ account.update({ balance: { increment: delta } })
  │         └─ ROW LOCK on account (prevents concurrent overdraw)
  │         └─ Checks no-overdraw invariant
  │         └─ THROWS if standard account would go negative
  ├─ [Prisma audit interceptor fires]
  │    └─ AuditLog.create({ model:'Transaction', operation:'create', after: result })
  ├─ COMMIT TRANSACTION
  └─ Returns new transaction
         │
         ▼
[transaction.service.ts post-create]
  └─ cacheDeleteByPrefix('transactions:') — invalidates cached lists
  └─ cacheDeleteByPrefix('accounts:') — invalidates cached balances
  └─ eventBus.emit(TRANSACTION_CREATED) — async notification trigger
         │
         ▼
[HTTP Response: 201 Created]
  └─ { success: true, data: { transaction } }
         │
         ▼
[FRONTEND: receives 201]
  └─ Updates Dexie IndexedDB (local cache)
  └─ Updates React state
  └─ Shows success toast
  └─ UI refreshes transaction list
         │
         ▼
DATABASE COMMITTED ✓ | CACHE CLEARED ✓ | AUDIT LOGGED ✓
```

---

## 7. Sync Architecture

### 7.1 Multi-Layer Sync Strategy

```
┌────────────────────────────────────────────────────────────────┐
│                    SYNC ARCHITECTURE                            │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LAYER A: Dexie (IndexedDB) — Offline Cache                     │
│  ─────────────────────────────────────────────────────────────  │
│  • Tables: accounts, transactions, loans, goals, investments,   │
│    groupExpenses, friends, merchantProfiles, documents, etc.    │
│  • Cleared on login → fresh sync from cloud                     │
│  • Cleared on logout / session expiry → data isolation         │
│  • OFFLINE_SYNC_ENABLED = false (disabled — schema mismatch)   │
│                                                                  │
│  LAYER B: Cloud Sync via Backend API                            │
│  ─────────────────────────────────────────────────────────────  │
│  • syncUserDataFromCloud() — pulls all tables on login          │
│  • Timeout: 12s (attempt 1) → 30s (attempt 2 retry)           │
│  • shouldSkipOptionalBackendRequests() — dev-mode graceful skip │
│  • auth-sync-integration.ts: Table-by-table backend fetches    │
│                                                                  │
│  LAYER C: Profile Sync                                          │
│  ─────────────────────────────────────────────────────────────  │
│  • syncProfileFromBackend() — GET /api/v1/auth/profile         │
│  • Conflict resolution: remote wins if remote.updatedAt > local │
│  • pendingLocalSync flag: if local is newer, pushes to backend │
│  • Cooldown: 60s between syncs (PROFILE_SYNC_COOLDOWN_MS)     │
│  • In-flight dedup: one sync per user at a time               │
│                                                                  │
│  LAYER D: Supabase Realtime                                     │
│  ─────────────────────────────────────────────────────────────  │
│  • subscribeToUserCloudSync() — Supabase realtime listeners    │
│  • Pushes table changes to Dexie                                │
│                                                                  │
│  LAYER E: Socket.IO                                              │
│  ─────────────────────────────────────────────────────────────  │
│  • Connected after login: socketClient.connect(token, deviceId) │
│  • Used for: notifications, real-time updates                   │
│  • Disconnected on: logout, session expiry                      │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

### 7.2 Sync Decision Tree on Login

```
AUTH_STATE_CHANGE → SIGNED_IN
         │
         ├─ setDataReady(false)
         ├─ setDataSyncing(true)
         ├─ clearLocalUserData() (isolate previous user's data)
         │
         ▼
clearLocalAuthPresentationState()
         │
         ▼
permissionService.fetchUserPermissions()
  └─ GET /api/v1/settings/permissions
  └─ Sets authoritative role from backend DB
         │
         ▼
[App.tsx PIN Gate Check]
  └─ PIN enabled? → Show PIN screen → wait for unlock
  └─ PIN disabled? → proceed immediately
         │
         ▼
triggerDataSync() — called from App.tsx after PIN unlock
  └─ syncFromSupabase(user, force=true)
       ├─ syncUserDataFromCloud(userId, ALL_TABLES, force=true)
       │    └─ Fetches: accounts, transactions, loans, goals,
       │       investments, groupExpenses, friends, notifications
       └─ syncProfileFromBackend(user)
            └─ GET /api/v1/auth/profile
  └─ setDataReady(true) ← UNBLOCKS ALL PAGES
```

---

## 8. Caching Architecture

### 8.1 Backend Cache (In-Memory)

```
Cache: backend/src/cache/redis.ts
├─ Type: Bounded in-memory Map (Redis-free, single-instance)
├─ Max entries: 50,000 (CACHE_MAX_ENTRIES env var)
├─ Eviction: LRU (oldest insertion first when full)
├─ Sweep: every 60 seconds (expired TTL removal)
│
├─ Cache Keys Used:
│    ├─ user:{userId}:snapshot → auth snapshot (60s TTL, auth.ts)
│    ├─ transactions:{userId}:... → transaction lists
│    ├─ accounts:{userId}:... → account lists/balances
│    ├─ idem:{userId}:{scope}:{key} → idempotency replay (24h TTL)
│    └─ features:{...} → feature flag matrix (30s TTL, featureGate.ts)
│
├─ Cache Invalidation:
│    ├─ Transaction create/update/delete → cacheDeleteByPrefix('transactions:')
│    ├─ Transaction create/update/delete → cacheDeleteByPrefix('accounts:')
│    ├─ Profile update → invalidateUserSnapshotCache(userId)
│    └─ Feature update → cachedFeatures = null
│
└─ Metrics: hit/miss/store counts per prefix, logged every 50 reads
```

### 8.2 Frontend Cache (Dexie IndexedDB)

```
Cache: frontend/src/lib/database.ts
├─ Type: Dexie.js (IndexedDB)
├─ Tables: accounts, transactions, loans, goals, investments,
│          groupExpenses, friends, notifications, merchantProfiles,
│          userCategoryPreferences, documents, smsTransactions,
│          syncQueue, syncEventLog
│
├─ Cache Lifecycle:
│    ├─ Login → clearLocalUserData() → sync from cloud
│    ├─ Logout → clearLocalUserData() → data isolation
│    ├─ Session expiry → clearLocalUserData()
│    └─ Normal operation → mutations write to Dexie first (offline-first)
│
└─ Sync Timestamps:
     ├─ KANAKU_last_sync_at_{table} → per-table last sync time (5-min cooldown)
     └─ KANAKU_last_full_sync_at → last full sync timestamp
```

---

## 9. Frontend State Management

### 9.1 Context Architecture

```
App.tsx
  └─ AuthProvider (AuthContext)
       ├─ user, session, loading, role
       ├─ dataReady (gates all financial pages)
       ├─ dataSyncing, dataSyncError
       └─ triggerDataSync(), signOut()
            │
            └─ AppContext (AppContext.tsx)
                 ├─ accounts, transactions, loans, goals, investments
                 ├─ settings, profile
                 └─ All CRUD operations
                      │
                      └─ SecurityContext (SecurityContext.tsx)
                           ├─ PIN management
                           └─ Biometric auth state
```

### 9.2 Data Flow in Components

```
Page Component
  └─ useAuth() → { user, dataReady, role }
  └─ useAppContext() → { accounts, transactions, ... }
       │
       ▼
  If !dataReady → Show loading/skeleton
  If dataReady → Render financial data from Dexie
       │
       ▼
  User action → CRUD via AppContext
       └─ API call (api.ts)
       └─ On success: update Dexie + React state
       └─ On failure: show error toast, do NOT update state
```

---

## 10. Root Cause Analysis

### Problem 1 — 20-30 Second Load After Login

**Root Cause:**
The `dataReady` flag is set to `false` on login and is only set to `true` AFTER:
1. `permissionService.fetchUserPermissions()` completes (network call)
2. PIN unlock (if enabled) — user must act
3. `syncFromSupabase()` completes — which has TWO timeout levels (12s, then 30s)

The 20-30 second delay is **the 30-second retry timeout** in `syncFromSupabase()`.

**Code location:** `frontend/src/contexts/AuthContext.tsx` lines 584-606

```typescript
const timeouts = [12000, 30000];  // ← 12s first attempt, 30s if backend slow
```

**Fix Required:**
1. Show data from Dexie IMMEDIATELY (do not block on `dataReady`)
2. Let `dataReady` gate only the FIRST ever load (no cached data)
3. Run sync in background — update UI when sync completes
4. Reduce initial timeout to 8s, not 12s
5. If Dexie has data → set `dataReady = true` immediately, sync in background

---

### Problem 2 — Data Entered But Not Saved

**Root Cause (Multiple):**
- **A) Offline sync engine is DISABLED**: `OFFLINE_SYNC_ENABLED = false` — mutations written to Dexie are NOT pushed to backend. Queue accumulates silently.
- **B) Optimistic UI without rollback**: Components may update local Dexie state and show success toast BEFORE the API call completes. If the API fails silently, Dexie has data but backend has nothing.
- **C) Dedup hash collision**: Two transactions with same amount+date+description on same day get silently deduplicated — one is dropped.

**Code location:** `frontend/src/lib/offline-sync-engine.ts` line 25

```typescript
const OFFLINE_SYNC_ENABLED = import.meta.env.VITE_ENABLE_OFFLINE_SYNC === 'true';
```

**Fix Required:**
1. NEVER write success to Dexie before backend API confirms 200/201
2. The sync flow must be: `API call → success → update Dexie → update UI`
3. NOT: `update Dexie → update UI → API call (maybe fails silently)`
4. All error responses from API must be surfaced to user
5. No silent catch blocks on CRUD operations

---

### Problem 3 — Inconsistent Page Load Times

**Root Cause:**
- Pages that use data directly from Dexie load instantly (Dexie has cached data)
- Pages that trigger a fresh API call on mount wait for network
- Some pages check `dataReady` before rendering; others don't
- The `KANAKU_last_sync_at_{table}` cooldown (5 minutes) means some pages use stale Dexie data while others hit the API

**Fix Required:**
1. Standardize all pages to: show Dexie data immediately + refresh in background
2. Add loading skeleton to every page (never blank)
3. 5-minute cooldown is too long — reduce to 90 seconds for financial data

---

### Problem 4 — Inconsistent State After Login

**Root Cause:**
The auth lifecycle has THREE competing systems:
1. `supabase.auth.onAuthStateChange` (Supabase session)
2. `KANAKU_AUTH_CHANGE` custom event (custom JWT session)
3. `handleOnline` / `handleOffline` handlers (network reconnect)

Each fires independently and sets `user`, `session`, `role` separately. On a slow connection, these can fire in different orders, causing state inconsistency.

**Specific bug:** `handleCustomAuthChange` calls `setDataReady(false)` and starts syncing, but `handleOnline` may also set state differently — race condition between the two.

**Fix Required:**
1. Single source of truth for auth state
2. All auth state changes serialized through one reducer/function
3. Debounce concurrent auth state updates

---

### Problem 5 — Unreliable Data Synchronization

**Root Cause:**
The sync is NOT bidirectional in real-time:
- Write path: `UI → API → DB` (synchronous, works correctly when API is called)
- Read path: `DB → Backend API → Dexie → UI` (lazy, delayed by 5-min cooldown)
- The Supabase realtime subscription pushes cloud changes, but requires an active Supabase connection — not the backend connection

**The gap:** After a successful API write, the UI re-queries from Dexie (which may be stale). The Dexie update from the API response is correct — but if the component doesn't re-render, stale data is shown.

**Fix Required:**
1. After every successful CRUD API call: immediately update Dexie + dispatch a custom event
2. All lists/summaries subscribe to that event and re-fetch from Dexie
3. Dashboard summary should re-compute from Dexie after each transaction write

---

## 11. Security Vulnerability Assessment

### 11.1 Confirmed Secure

| Area | Status | Evidence |
|------|--------|----------|
| SQL Injection | ✅ SECURE | Prisma parameterized queries throughout |
| XSS | ✅ SECURE | CSP headers + body sanitization on all inputs |
| CSRF | ✅ SECURE | SameSite=Strict cookie + CORS allowlist |
| Clickjacking | ✅ SECURE | frameAncestors: none (CSP) |
| Role Spoofing | ✅ SECURE | Role from DB ONLY, token claims ignored |
| Token Misuse (refresh → API) | ✅ SECURE | type==='refresh' check in auth.ts |
| Account Enumeration | ✅ SECURE | Consistent error messages on auth failure |
| Brute Force | ✅ SECURE | Multi-tier rate limiting on auth routes |
| Concurrent Overdraw | ✅ SECURE | DB row lock in applyBalanceDeltas |
| Sensitive Data in Logs | ✅ SECURE | redact() on audit log details |
| Server Fingerprinting | ✅ SECURE | X-Powered-By disabled |
| Webhook Tampering | ✅ SECURE | HMAC-SHA256 signature on raw bytes |
| Idle Session | ✅ SECURE | Server-side idle tracking with grace window |

### 11.2 ⚠️ Gaps Found

| # | Vulnerability | Risk | Location | Fix |
|---|--------------|------|----------|-----|
| G-1 | **SecurityGate random key on startup** | HIGH | `securityGate.ts:24` | If `SECURITY_JWT_SECRET` not set, a random key is generated per restart. Security tokens issued before restart become invalid. Must require env var in production. |
| G-2 | **No CSRF token for state-changing cookie requests** | MEDIUM | `auth.routes.ts` | The SameSite=Strict cookie prevents most CSRF, but sub-domain attacks remain possible. Add `Origin` header check for cookie-based requests. |
| G-3 | **Idempotency bypass when cache is cold** | LOW | `idempotency.ts:95` | Since Redis is disabled, `getRedisStatus() !== 'connected'` is ALWAYS true, so `failOpen=true` means idempotency middleware NEVER replays. Only the `dedupHash` in the transaction service catches duplicates. |
| G-4 | **User snapshot cache (60s) after role change** | LOW | `auth.ts:135` | Admin can change a user's role, but old role persists in cache for up to 60s. `invalidateUserSnapshotCache()` mitigates this — must be called on every role change. |
| G-5 | **Missing input validation on bulk transaction import** | MEDIUM | `transaction.service.ts:351` | Bulk import uses `enforceBalance: false` — this is intentional for CSV imports, but there's no explicit cap on batch size (`items.length` can be unbounded). |
| G-6 | **No Content-Type enforcement on API responses** | LOW | `app.ts` | All responses should set `Content-Type: application/json` explicitly to prevent MIME sniffing. |
| G-7 | **Feature gate cache not user-scoped** | LOW | `featureGate.ts:30` | The 30-second global feature cache means admin changes take up to 30s to propagate to all users. Acceptable but should be documented. |

---

## 12. Missing Gaps & Fixes Required

### 12.1 Critical Fixes

```
FIX-1: Data Visibility Delay (Problem 1)
─────────────────────────────────────────
File: frontend/src/contexts/AuthContext.tsx
Change: After login, check if Dexie has data for this user.
        If yes → setDataReady(true) immediately, sync in background.
        If no (first login) → sync first, then setDataReady(true).

Current code (line 806):
  setDataReady(false);
  setDataSyncing(true);
  // ... sync runs, THEN setDataReady(true)

Fix:
  const hasLocalData = await checkDexieHasData(userId);
  if (hasLocalData) {
    setDataReady(true); // Show data immediately
    setDataSyncing(true);
    syncInBackground(); // Refresh without blocking
  } else {
    setDataReady(false);
    setDataSyncing(true);
    await syncFromSupabase(); // Must complete before showing
    setDataReady(true);
  }
```

```
FIX-2: Silent Data Loss (Problem 2)
─────────────────────────────────────
Principle: API call must succeed BEFORE any local state update.
Pattern to enforce:

  // WRONG (current in some places):
  db.transactions.add(localTx);  // Dexie first
  showSuccess();
  await api.transactions.create(tx);  // API second (can fail silently)

  // CORRECT:
  try {
    const saved = await api.transactions.create(tx);  // API first
    await db.transactions.add(saved);  // Dexie only on success
    showSuccess();
  } catch (err) {
    showError(err);  // Never swallow
  }
```

```
FIX-3: Bulk Import Size Cap
─────────────────────────────
File: backend/src/features/transactions/transaction.service.ts
Add to createTransactionsBulk():
  const MAX_BULK = 500;
  if (items.length > MAX_BULK) {
    throw AppError.badRequest(
      `Bulk import limited to ${MAX_BULK} items per request`,
      'BULK_LIMIT_EXCEEDED'
    );
  }
```

```
FIX-4: SecurityGate Key Requirement in Production
───────────────────────────────────────────────────
File: backend/src/middleware/securityGate.ts
Change: In production, throw if SECURITY_JWT_SECRET is not set.
  if (isProd && !process.env.SECURITY_JWT_SECRET) {
    throw new Error('SECURITY_JWT_SECRET must be set in production');
  }
```

```
FIX-5: Content-Type Enforcement
─────────────────────────────────
File: backend/src/app.ts
Add middleware after helmet:
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
```

### 12.2 Performance Improvements

```
PERF-1: Reduce Sync Timeout
File: frontend/src/contexts/AuthContext.tsx
Change: [12000, 30000] → [8000, 15000]
Reason: 30s is too long for UX; backend should respond in < 5s.

PERF-2: Reduce Per-Table Sync Cooldown
File: frontend/src/lib/auth-sync-integration.ts
Change: KANAKU_last_sync_at cooldown from 5min → 90 seconds
Reason: Financial data should not be 5 minutes stale.

PERF-3: Dashboard Pre-computation
The dashboard fetches multiple aggregates in parallel. 
Add a dedicated /dashboard/summary endpoint that returns:
  - Total income/expense (this month)
  - Account balances
  - Recent transactions (5)
  - Goals progress
In a SINGLE backend query, instead of 5 separate frontend calls.

PERF-4: Pagination on Transaction Lists
Verify all transaction list API calls include limit/page params.
Frontend should use virtual scrolling for large lists.
```

---

## 13. Performance Analysis

### 13.1 API Response Time Targets

| Endpoint | Target | Current Bottleneck |
|----------|--------|--------------------|
| POST /auth/login | < 800ms | bcrypt hash (12 rounds) |
| GET /auth/profile | < 200ms | DB query (should be cached) |
| GET /transactions | < 300ms | Pagination helps; large datasets slow |
| POST /transactions | < 500ms | DB transaction + balance update |
| GET /dashboard | < 400ms | Multiple parallel queries |
| GET /accounts | < 200ms | Single user query |

### 13.2 Database Query Optimization

```sql
-- Verify these indexes exist:
CREATE INDEX IF NOT EXISTS idx_transactions_user_date 
  ON transactions(user_id, date DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_dedup_hash 
  ON transactions(dedup_hash, user_id);

CREATE INDEX IF NOT EXISTS idx_accounts_user_active 
  ON accounts(user_id, is_active) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created 
  ON audit_log(user_id, created_at DESC);
```

### 13.3 Bundle Size

Frontend Vite config should be checked for:
- Code splitting by route
- Tree-shaking of unused exports
- Lazy loading of heavy pages (Reports, OCR scanner)

---

## 14. Test Accounts

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Admin | admin@kanaku.com | Kanaku@Admin2026! | Full system access |
| Manager | manager@kanaku.com | Kanaku@Manager2026! | Manage users/advisors |
| Advisor | advisor@kanaku.com | Kanaku@Advisor2026! | Client portfolio access |
| User | user@kanaku.com | Kanaku@User2026! | Standard user |
| Test User | testuser@kanaku.com | Kanaku@Test2026! | QA testing only |

> **IMPORTANT:** These accounts must be created in both Supabase Auth AND the backend `users` table via the registration flow. Manually inserting in only one system will cause auth failures.

---

## 15. Verification Checklist

### Auth Flow
- [ ] Login completes in < 3 seconds (excluding sync)
- [ ] Data appears within 2 seconds if previously synced (Dexie)
- [ ] Data appears within 10 seconds on first login (fresh sync)
- [ ] Token refresh is transparent (no re-login required)
- [ ] Session expiry shows login screen, not a blank page
- [ ] PIN lock works and re-gates financial data
- [ ] Logout clears ALL local data from Dexie
- [ ] Different users cannot see each other's data

### Data Persistence
- [ ] Add transaction → appears in DB within 1 second
- [ ] Edit transaction → DB shows updated value immediately
- [ ] Delete transaction → DB row is soft-deleted, UI removes it
- [ ] Logout + login → transaction still exists
- [ ] Account balance updates correctly after transaction
- [ ] Transfer debits source, credits destination atomically

### Security
- [ ] Cannot access /dashboard without valid token → 401
- [ ] Cannot access admin endpoints as regular user → 403
- [ ] Cannot read another user's transactions → 403/404
- [ ] Expired token → auto-refresh, not logout
- [ ] Truly expired token (refresh also expired) → logout
- [ ] Rate limit on login → 429 after 5 attempts

### Performance
- [ ] Dashboard loads in < 3 seconds
- [ ] Transaction list (100 items) loads in < 1 second
- [ ] No duplicate API calls on page load
- [ ] No console errors in production build
- [ ] No unhandled promise rejections

### UI Consistency
- [ ] All pages show loading state while fetching
- [ ] All pages show error state on fetch failure
- [ ] All CRUD operations show success/error feedback
- [ ] Navigation works without full page reload
- [ ] Realtime updates work (socket.io connected)

---

## Appendix: Key File Reference

| Purpose | File |
|---------|------|
| Auth context | [AuthContext.tsx](file:///k:/Project/Kanaku/frontend/src/contexts/AuthContext.tsx) |
| API client | [api.ts](file:///k:/Project/Kanaku/frontend/src/lib/api.ts) |
| Local database | [database.ts](file:///k:/Project/Kanaku/frontend/src/lib/database.ts) |
| Offline sync engine | [offline-sync-engine.ts](file:///k:/Project/Kanaku/frontend/src/lib/offline-sync-engine.ts) |
| Cloud sync integration | [auth-sync-integration.ts](file:///k:/Project/Kanaku/frontend/src/lib/auth-sync-integration.ts) |
| Backend app setup | [app.ts](file:///k:/Project/Kanaku/backend/src/app.ts) |
| Auth middleware | [auth.ts](file:///k:/Project/Kanaku/backend/src/middleware/auth.ts) |
| RBAC middleware | [rbac.ts](file:///k:/Project/Kanaku/backend/src/middleware/rbac.ts) |
| Feature gate | [featureGate.ts](file:///k:/Project/Kanaku/backend/src/middleware/featureGate.ts) |
| Idempotency | [idempotency.ts](file:///k:/Project/Kanaku/backend/src/middleware/idempotency.ts) |
| Cache (Redis-free) | [redis.ts](file:///k:/Project/Kanaku/backend/src/cache/redis.ts) |
| Prisma + Audit | [prisma.ts](file:///k:/Project/Kanaku/backend/src/db/prisma.ts) |
| Transaction service | [transaction.service.ts](file:///k:/Project/Kanaku/backend/src/features/transactions/transaction.service.ts) |
| Transaction repository | [transaction.repository.ts](file:///k:/Project/Kanaku/backend/src/features/transactions/transaction.repository.ts) |
| Auth service | [auth.service.ts](file:///k:/Project/Kanaku/backend/src/features/auth/auth.service.ts) |
| Auth controller | [auth.controller.ts](file:///k:/Project/Kanaku/backend/src/features/auth/auth.controller.ts) |
| Security gate | [securityGate.ts](file:///k:/Project/Kanaku/backend/src/middleware/securityGate.ts) |
| Security (crypto) | [crypto.ts](file:///k:/Project/Kanaku/backend/src/security/crypto.ts) |
