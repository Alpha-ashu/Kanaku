# Finora — Backend & Database Architecture Document

> **Project:** Finora (formerly KANAKU) — Financial-Grade Expense Tracker  
> **Stack:** Node.js · Express · TypeScript · Prisma · PostgreSQL · Supabase Auth · Redis · Socket.IO · BullMQ  
> **Prepared:** June 9, 2026  
> **Status:** Living Document — update on every significant structural change

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture Diagram](#2-high-level-architecture-diagram)
3. [Backend Layer Architecture](#3-backend-layer-architecture)
   - 3.1 [Entry Point & Bootstrapping](#31-entry-point--bootstrapping)
   - 3.2 [Middleware Stack](#32-middleware-stack)
   - 3.3 [Route & Module Structure](#33-route--module-structure)
   - 3.4 [Module Anatomy (Controller-Service-Repository Pattern)](#34-module-anatomy-controller-service-repository-pattern)
   - 3.5 [WebSocket / Real-time Layer](#35-websocket--real-time-layer)
   - 3.6 [Background Workers & Job Queues](#36-background-workers--job-queues)
   - 3.7 [Caching Layer (Redis)](#37-caching-layer-redis)
   - 3.8 [AI Engine](#38-ai-engine)
4. [Authentication & Authorization Architecture](#4-authentication--authorization-architecture)
   - 4.1 [Auth Flow](#41-auth-flow)
   - 4.2 [JWT Strategy (Multi-Provider)](#42-jwt-strategy-multi-provider)
   - 4.3 [RBAC & Feature Gates](#43-rbac--feature-gates)
   - 4.4 [Device Trust & OTP](#44-device-trust--otp)
5. [Database Architecture](#5-database-architecture)
   - 5.1 [Database Provider & ORM](#51-database-provider--orm)
   - 5.2 [Schema Overview — Entity Groups](#52-schema-overview--entity-groups)
   - 5.3 [Entity Relationship Summary](#53-entity-relationship-summary)
   - 5.4 [Complete Table Reference](#54-complete-table-reference)
   - 5.5 [Soft-Delete Strategy](#55-soft-delete-strategy)
   - 5.6 [Monetary Data Integrity](#56-monetary-data-integrity)
   - 5.7 [Indexing Strategy](#57-indexing-strategy)
   - 5.8 [Dual-Identity: User vs profiles](#58-dual-identity-user-vs-profiles)
6. [Offline-First & Sync Architecture](#6-offline-first--sync-architecture)
   - 6.1 [Local-First Write Flow](#61-local-first-write-flow)
   - 6.2 [SyncQueue Table](#62-syncqueue-table)
   - 6.3 [WebSocket Sync Protocol](#63-websocket-sync-protocol)
7. [Security Architecture](#7-security-architecture)
8. [API Versioning & Endpoint Catalogue](#8-api-versioning--endpoint-catalogue)
9. [Infrastructure & Deployment](#9-infrastructure--deployment)
10. [Fix Recommendations & Known Issues](#10-fix-recommendations--known-issues)
11. [Glossary](#11-glossary)

---

## 1. System Overview

Finora is a **financial-grade, offline-first expense tracking application** serving mobile (Android via Capacitor), web, and desktop clients. The backend is a **monolithic Node.js/Express API** organized into **domain modules**, deployed as a containerized service alongside PostgreSQL and Redis.

### Core Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Security-first** | Helmet, CORS allowlist, rate limiting, input sanitization, JWT multi-provider auth, RBAC, Zod validation on all routes |
| **Offline-first** | Dexie local DB on client, `SyncQueue` table on server, delta-based WebSocket sync |
| **Data integrity** | Prisma DB transactions for balance/financial ops, server-authoritative monetary logic, ownership checks |
| **Observability** | Winston logger, request-id stamping, audit log table, cache metrics, circuit breakers |
| **Scalability** | Redis cache layer, BullMQ job queues, worker processes, lazy route loading |

---

## 2. High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Android App  │  │  Web (Vite)  │  │   iOS App    │  │ Desktop (Cap) │  │
│  │ (Capacitor)  │  │  React 18 TS │  │ (Capacitor)  │  │               │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │           Dexie (Local DB)         │                  │          │
└─────────┼───────────────────────────────────┼──────────────────┼──────────┘
          │   HTTPS REST + WebSocket           │                  │
          ▼                                    ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API GATEWAY / REVERSE PROXY                      │
│                         (Vercel / Nginx / Docker)                           │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS APPLICATION SERVER                           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      MIDDLEWARE PIPELINE                             │  │
│  │  Request-ID → Helmet → CORS → JSON Body → Sanitize → Rate Limit     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                   │                                         │
│  ┌────────────────────────────────┼────────────────────────────────────┐   │
│  │              ROUTE MODULES  /api/v1/...                             │   │
│  │                                                                      │   │
│  │  auth  accounts  transactions  goals  loans  investments  groups    │   │
│  │  friends  bills  receipts  sync  pin  settings  notifications       │   │
│  │  devices  stocks  import  voice  ai  categorize  advisor  bookings  │   │
│  │  sessions  payments  dashboard  admin  todos                        │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                   │                                         │
│  ┌────────────────────────────────┴───────────────────────────────────┐    │
│  │  Auth Middleware → Validate (Zod) → Feature Gate → Controller      │    │
│  │  → Service → Repository → Prisma ORM                               │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐   │
│  │  Socket.IO Server│   │  BullMQ Workers  │   │  AI Engine (cron)    │   │
│  │  (Real-time sync)│   │  (push / email)  │   │  (Gemini / insights) │   │
│  └──────────────────┘   └──────────────────┘   └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
          │                        │                        │
          ▼                        ▼                        ▼
┌─────────────────┐    ┌───────────────────┐    ┌──────────────────────┐
│  PostgreSQL DB  │    │    Redis Cache    │    │  Supabase Auth API   │
│  (Prisma ORM)   │    │  (ioredis / TTL)  │    │  (identity provider) │
└─────────────────┘    └───────────────────┘    └──────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  External Services              │
│  Firebase (push notifications)  │
│  Google Gemini (AI/OCR)         │
│  File Storage (Supabase / local)│
└─────────────────────────────────┘
```

---

## 3. Backend Layer Architecture

### 3.1 Entry Point & Bootstrapping

**Files:** `backend/src/server.ts` → `backend/src/app.ts`

```
server.ts  (bootstrap)
  ├── app.listen(PORT)
  ├── initializeSocket(server)        ← Socket.IO over HTTP server
  ├── initRedis()                     ← ioredis connection
  ├── initializeNotificationWorkers() ← BullMQ push + email workers
  └── startAIBackgroundJobs()         ← Cron-based AI insight generation

app.ts  (Express app factory)
  ├── Request-ID middleware
  ├── Request logging middleware
  ├── helmet() — security headers
  ├── cors() — dynamic allowlist
  ├── express.json({ limit: '1mb' })
  ├── Global body sanitizer (XSS strip)
  ├── Rate limiters (global + per-path)
  ├── GET /health — liveness probe
  ├── /api-docs — Swagger/API docs
  ├── /api/v1 → apiRoutes
  ├── 404 catch-all
  └── errorHandler middleware
```

### 3.2 Middleware Stack

| Middleware | File | Purpose |
|------------|------|---------|
| `requestId` | `app.ts` | UUID stamped on every request for log correlation |
| `helmet` | `app.ts` | Secure HTTP headers (CSP, HSTS, X-Frame, etc.) |
| `cors` | `app.ts` + `config/cors.ts` | Dynamic origin allowlist |
| `express.json` | `app.ts` | JSON body parsing, 1 MB limit |
| `sanitize` | `app.ts` | HTML/script tag stripping on all request body strings |
| `rateLimit` | `middleware/rateLimit.ts` | IP-based rate limiting via Redis or in-memory |
| `authenticatedRateLimit` | `middleware/rateLimit.ts` | User-scoped rate limits (bills, receipts, sync) |
| `authMiddleware` | `middleware/auth.ts` | JWT verification (custom JWT → Supabase JWT secret → Supabase API) |
| `validateBody/Query/Params` | `middleware/validate.ts` | Zod schema validation |
| `requireRole` | `middleware/rbac.ts` | RBAC role check |
| `requireFeature` | `middleware/featureGate.ts` | Feature-flag + role-based gate |
| `requireApproved` | `middleware/rbac.ts` | Advisor approval check |
| `responseCache` | `middleware/cache.ts` | Redis-backed response caching with TTL |
| `upload` | `middleware/upload.ts` | Multer file upload with type/size enforcement |
| `errorHandler` | `middleware/error.ts` | Global error normalizer (AppError, Prisma errors, Zod errors) |

### 3.3 Route & Module Structure

All API routes live under `/api/v1` and are organized by domain module:

```
/api/v1
├── /auth          — Register, login, OTP, profile, device management
├── /accounts      — Bank/wallet accounts CRUD
├── /transactions  — Financial transactions CRUD + account-scoped queries
├── /goals         — Savings goals + contributions
├── /loans         — Loans + repayment tracking
├── /investments   — Investment portfolio management
├── /groups        — Group expenses + member splits
├── /friends       — Friend contact list
├── /bills         — Bill document upload + OCR processing
├── /receipts      — Receipt scan (AI-powered)
├── /sync          — Offline sync delta endpoint
├── /pin           — App lock PIN management
├── /settings      — User preferences (theme, currency, timezone)
├── /notifications — In-app + push + email notification management
├── /devices       — Device registration, trust, FCM tokens
├── /stocks        — Public stock data (market feed)
├── /import        — CSV/XLSX bulk import of transactions
├── /voice         — Voice command processing
├── /ai            — AI insights, categorization, advisor queries
├── /categorize    — Transaction category learning & suggestion
├── /advisors      — Financial advisor listing, availability
├── /bookings      — Advisor booking requests
├── /sessions      — Active advisor sessions + chat
├── /payments      — Payment processing + webhook handling
├── /dashboard     — Aggregated financial dashboard data
├── /admin         — Admin panel (user management, feature flags, analytics)
├── /todos         — Task/reminder management
└── /avatars       — Avatar image management (public)
```

### 3.4 Module Anatomy (Controller-Service-Repository Pattern)

Every domain module follows this layered structure:

```
modules/<domain>/
├── <domain>.routes.ts       — Express Router, applies auth/validation middleware
├── <domain>.controller.ts   — HTTP request/response handling only
├── <domain>.service.ts      — Business logic, orchestration, transactions
├── <domain>.repository.ts   — Prisma query abstraction (data access layer)
└── <domain>.validation.ts   — Zod schemas for request validation
```

**Data flow per request:**
```
HTTP Request
  → Route middleware (auth + validate)
  → Controller (extract req data, call service)
    → Service (business rules, DB transactions)
      → Repository (Prisma queries, ownership checks)
        → PostgreSQL
      ← Repository (typed DTOs)
    ← Service (processed result)
  ← Controller (HTTP response shape)
← HTTP Response
```

**Example — Transaction creation:**
```
POST /api/v1/transactions
  authMiddleware          → verify JWT, attach req.user
  requireFeature()        → check 'addTransaction' gate
  validateBody(schema)    → Zod validates amount, type, accountId, date
  TransactionController   → calls TransactionService.create()
    TransactionService    → DB transaction: create tx + update account balance
      TransactionRepository → prisma.$transaction([createTx, updateAccount])
```

### 3.5 WebSocket / Real-time Layer

**File:** `backend/src/sockets/index.ts`

The `SocketManager` class wraps Socket.IO and provides user-scoped rooms:

```
Connection lifecycle:
  Client connects with JWT token (handshake.auth.token)
    → verifyToken() — same multi-provider JWT check as HTTP middleware
    → DB lookup: confirm user not suspended
    → Join rooms: user:{userId} + device:{deviceId}

Socket Events (server-side handlers):
  sync_request          → getSyncData() — delta fetch since lastSyncedAt
  transaction_update    → saveTransaction() — upsert with ownership check
  account_update        → saveAccount() — upsert with ownership check
  goal_update           → saveGoal() — upsert with ownership check
  booking_request       → notify advisor via user:{advisorId} room
  booking_status_update → update DB, create session, notify client
  payment_status_update → validate state machine, update DB, notify both parties
  chat_message          → persist to ChatMessage, broadcast to session participants
  disconnect            → cleanup connectedUsers + userDevices maps

Broadcast utilities:
  notifyUser(userId, event, data)   → emit to user:{userId} room
  notifyDevice(deviceId, event, data)
  broadcastToAll(event, data)
```

**Connection tracking:** In-memory `Map<userId, Set<socketId>>` — NOTE: this does not survive server restarts or multi-instance deployments (see Fix Recommendations §10).

### 3.6 Background Workers & Job Queues

**Files:** `backend/src/workers/`, `backend/src/config/queue.ts`

Two BullMQ queues are initialized at startup:

| Queue | Worker File | Purpose |
|-------|-------------|---------|
| `pushQueue` | `push.worker.ts` | Firebase Cloud Messaging push notifications |
| `emailQueue` | `email.worker.ts` | Email notification delivery |

**AI Background Jobs** (`modules/ai/ai.engine.ts`):
- Node-cron scheduled jobs for generating spending insights
- Runs against `ai_events`, `ai_insights`, `user_features` tables
- Calls Google Gemini API for natural language insights
- Controlled by `startAIBackgroundJobs()` / `stopAIBackgroundJobs()`

### 3.7 Caching Layer (Redis)

**Files:** `backend/src/cache/redis.ts`, `backend/src/cache/cache-policy.ts`

```
Cache Architecture:
  ioredis client with lazy connect + TLS support
  Graceful degradation: cache miss returns null, API continues normally

Cache Patterns:
  Response caching  → middleware/cache.ts (responseCache middleware)
  Per-prefix TTL    → cache-policy.ts (CACHE_TTL_SECONDS object)
  Manual invalidation → cacheDeleteByPrefix(prefix)
  Auth snapshot cache → in-memory Map (60s TTL, avoids DB on every request)

Rate Limiting:
  Redis-backed counters with sliding window
  Separate scopes: api-global, auth-route, api-bills, api-receipts, api-sync
  Falls back to in-memory if Redis unavailable
```

**Cache Policies (TTL):**

| Resource | TTL |
|----------|-----|
| `transactions:list` | Configured in cache-policy.ts |
| `transactions:item` | Configured in cache-policy.ts |
| `transactions:account` | Configured in cache-policy.ts |
| User auth snapshot | 60 seconds (in-memory) |

### 3.8 AI Engine

**Module:** `backend/src/modules/ai/`

| Feature | Provider | Description |
|---------|----------|-------------|
| Receipt/Bill OCR | Tesseract.js / Google Gemini | Extract transaction data from uploaded images/PDFs |
| Transaction categorization | Custom ML + Gemini | Suggest categories for imported/uncategorized transactions |
| Spending insights | Google Gemini | Natural language financial insights from user_features |
| Voice commands | Voice module | Parse voice input to transaction data |
| AI scan audit | `AiScan` table | Every AI call is logged with confidence score and provider |

---

## 4. Authentication & Authorization Architecture

### 4.1 Auth Flow

```
Register:
  POST /api/v1/auth/register
    → Validate body (Zod)
    → Hash password (bcrypt)
    → Create User in PostgreSQL
    → Create UserSettings (defaults)
    → Return JWT + user profile

Login:
  POST /api/v1/auth/login
    → Validate credentials
    → Return custom JWT (signed with JWT_SECRET)
    OR
  Supabase Login (frontend):
    → Supabase issues JWT
    → Backend verifies with SUPABASE_JWT_SECRET
    → ensureUserInDb() upserts User record on first backend call

Token Refresh:
  → RefreshToken table (UUID stored, verified on refresh)
  → Supabase handles refresh for Supabase sessions
```

### 4.2 JWT Strategy (Multi-Provider)

The `authMiddleware` attempts verification in this priority order:

```
1. Custom JWT (JWT_SECRET)
   └── Fast, local — preferred for backend-native auth

2. Supabase JWT Secret verification (SUPABASE_JWT_SECRET)
   └── Fast, local — no network call — preferred for Supabase tokens

3. Supabase API validation (SUPABASE_SERVICE_ROLE_KEY)
   └── Network call to Supabase — used when JWT secret unavailable

4. Unverified DEV mode (ALLOW_UNVERIFIED_JWT=true + NODE_ENV=development)
   └── NEVER in production — development fallback only
```

After token verification, `getUserAuthSnapshot()` fetches the live DB user state (60s in-memory cache) to enforce account suspension.

### 4.3 RBAC & Feature Gates

**Roles:** `admin` | `manager` | `advisor` | `user`

```typescript
// Role-based access
requireRole('admin')              // admin only
requireRole(['admin', 'advisor']) // admin or advisor

// Feature-based access (middleware/featureGate.ts + rbac.ts)
requireFeature('transactions', 'addTransaction')  // checks per-user feature flag
requireFeature('bookAdvisor')                     // role check: user only
requireFeature('manageAvailability')              // role check: advisor only
```

**Feature Gates (featureGate.ts):** User-level feature flags stored in DB, allowing A/B testing and gradual rollouts per-user.

### 4.4 Device Trust & OTP

- **Device registration:** `Device` model stores `deviceId`, `fcmToken`, `publicKey` (TweetNaCl E2E), trust status
- **OTP:** `OtpCode` table — 6-digit codes with expiry, attempt counting, single-use enforcement
- **PIN Lock:** `UserPin` table — bcrypt-hashed PIN, lockout on failed attempts, expiry

---

## 5. Database Architecture

### 5.1 Database Provider & ORM

| Item | Detail |
|------|--------|
| **Database** | PostgreSQL (primary) + SQLite (legacy dev.db, should be removed) |
| **ORM** | Prisma v6 with `@prisma/client` |
| **Schema location** | `backend/prisma/schema.prisma` |
| **Generated client** | `backend/generated/prisma/` |
| **Schema namespace** | `public` (all models use `@@schema("public")`) |
| **Binary targets** | `native`, `rhel-openssl-1.0.x`, `rhel-openssl-3.0.x` (for Docker/Linux) |

### 5.2 Schema Overview — Entity Groups

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         ENTITY GROUPS                                    │
├─────────────────────────┬────────────────────────────────────────────────┤
│ IDENTITY & AUTH         │ User, UserPin, UserSettings, RefreshToken,     │
│                         │ OtpCode, Device, profiles                      │
├─────────────────────────┼────────────────────────────────────────────────┤
│ FINANCIAL CORE          │ Account, Transaction, Category                 │
├─────────────────────────┼────────────────────────────────────────────────┤
│ FINANCIAL PLANNING      │ Goal, GoalContribution, Loan, LoanPayment,     │
│                         │ Investment                                     │
├─────────────────────────┼────────────────────────────────────────────────┤
│ SOCIAL / GROUPS         │ GroupExpense, GroupExpenseMember, Friend       │
├─────────────────────────┼────────────────────────────────────────────────┤
│ ADVISOR PLATFORM        │ AdvisorAvailability, BookingRequest,           │
│                         │ AdvisorSession, ChatMessage, Payment           │
├─────────────────────────┼────────────────────────────────────────────────┤
│ NOTIFICATIONS           │ Notification                                   │
├─────────────────────────┼────────────────────────────────────────────────┤
│ FILES & DOCUMENTS       │ ExpenseBill, AiScan                            │
├─────────────────────────┼────────────────────────────────────────────────┤
│ IMPORT & SYNC           │ ImportLog, SyncQueue                           │
├─────────────────────────┼────────────────────────────────────────────────┤
│ AI / ML                 │ ai_events, ai_insights, ai_model_runs,         │
│                         │ user_features                                  │
├─────────────────────────┼────────────────────────────────────────────────┤
│ AUDIT & MISC            │ AuditLog, Todo                                 │
└─────────────────────────┴────────────────────────────────────────────────┘
```

### 5.3 Entity Relationship Summary

```
User (1) ──────────────────────────────────────────────────────────────────
  ├── (1:many) Account
  │     └── (1:many) Transaction
  │     └── (1:many) GoalContribution
  │     └── (1:many) GroupExpense [paidByAccount]
  │
  ├── (1:many) Transaction
  ├── (1:many) Category
  ├── (1:many) Goal
  │     └── (1:many) GoalContribution
  │
  ├── (1:many) Loan
  │     └── (1:many) LoanPayment
  │
  ├── (1:many) Investment
  ├── (1:many) Friend
  ├── (1:many) GroupExpense
  │     └── (1:many) GroupExpenseMember
  │     └── (1:many) Transaction
  │
  ├── (1:many) Device
  ├── (1:1)    UserPin
  ├── (1:1)    UserSettings
  ├── (1:many) RefreshToken
  ├── (1:many) OtpCode
  ├── (1:many) Notification
  ├── (1:many) ImportLog
  ├── (1:many) ExpenseBill
  ├── (1:many) AiScan
  ├── (1:many) Todo
  │
  ├── (advisor) AdvisorAvailability
  ├── (advisor) BookingRequest [as advisor]
  ├── (advisor) AdvisorSession [as advisor]
  ├── (advisor) Payment [as advisor]
  │
  ├── (client)  BookingRequest [as client]
  ├── (client)  AdvisorSession [as client]
  └── (client)  Payment [as client]

AdvisorSession
  ├── (1:1) BookingRequest
  ├── (1:many) ChatMessage
  └── (1:1) Payment
```

### 5.4 Complete Table Reference

| Table | PK | Key Fields | Notes |
|-------|----|-----------|-------|
| `User` | `id` (UUID) | `email`, `role`, `status`, `isApproved` | Central entity; role: user/advisor/admin/manager |
| `profiles` | `id` (UUID) | `email`, `full_name`, `avatar_url`, `visible_features` | Supabase-mirror profile; separate from User |
| `Account` | `id` (UUID) | `userId`, `type`, `balance`, `currency`, `syncStatus` | Balance is DB-trigger computed |
| `Transaction` | `id` (UUID) | `userId`, `accountId`, `type`, `amount`, `date`, `dedupHash` | `dedupHash` unique — prevents import duplicates |
| `Category` | `id` (UUID) | `userId`, `name`, `type` | Unique on `(userId, name, type)` |
| `Goal` | `id` (UUID) | `userId`, `targetAmount`, `currentAmount`, `targetDate` | `clientRequestId` idempotency key |
| `GoalContribution` | `id` (UUID) | `goalId`, `accountId`, `amount`, `date` | Links goal ↔ account ↔ user |
| `Loan` | `id` (UUID) | `userId`, `principalAmount`, `outstandingBalance`, `status` | Balance computed by DB trigger |
| `LoanPayment` | `id` (UUID) | `loanId`, `amount`, `date` | Soft-deletable |
| `Investment` | `id` (UUID) | `userId`, `assetType`, `quantity`, `buyPrice`, `currentPrice` | profitLoss computed by trigger |
| `GroupExpense` | `id` (UUID) | `userId`, `totalAmount`, `paidBy`, `splitType` | `members` field deprecated — use `GroupExpenseMember` |
| `GroupExpenseMember` | `id` (UUID) | `groupExpenseId`, `shareAmount`, `hasPaid` | New relational structure |
| `Friend` | `id` (UUID) | `userId`, `name`, `email`, `syncStatus` | Soft-deletable |
| `Device` | `id` (UUID) | `userId`, `deviceId` (unique), `fcmToken`, `publicKey` | Unique on `(userId, deviceId)` |
| `UserPin` | `id` (UUID) | `userId` (unique), `pinHash`, `failedAttempts`, `lockedUntil` | Bcrypt PIN, brute-force lockout |
| `UserSettings` | `id` (UUID) | `userId` (unique), `theme`, `language`, `currency`, `timezone` | Single source of truth for preferences |
| `RefreshToken` | `id` (UUID) | `token` (unique), `userId`, `expiresAt` | Custom JWT refresh tokens |
| `OtpCode` | `id` (UUID) | `userId`, `code`, `expiresAt`, `used`, `attempts` | Single-use; brute-force guarded |
| `Notification` | `id` (UUID) | `userId`, `type`, `channels`, `deliveryStatus`, `isRead` | Multi-channel delivery tracking |
| `ExpenseBill` | `id` (UUID) | `userId`, `sha256`, `scanStatus`, `storagePath` | SHA256 dedup; OCR scan pipeline |
| `AiScan` | `id` (UUID) | `userId`, `billId`, `confidence`, `provider` | Audit trail for all AI calls |
| `SyncQueue` | `id` (UUID) | `userId`, `entityType`, `entityId`, `status`, `retryCount` | Offline-first sync queue; max 3 retries |
| `ImportLog` | `id` (UUID) | `userId`, `fileName`, `importedRecords`, `errors` | Bulk import audit |
| `AuditLog` | `id` (UUID) | `userId`, `action`, `resource`, `status`, `ip` | Security audit trail |
| `AdvisorAvailability` | `id` (UUID) | `advisorId`, `dayOfWeek`, `startTime`, `endTime` | Weekly availability slots |
| `BookingRequest` | `id` (UUID) | `clientId`, `advisorId`, `status`, `proposedDate`, `amount` | Status: pending/accepted/rejected |
| `AdvisorSession` | `id` (UUID) | `bookingId` (unique), `advisorId`, `clientId`, `status` | Created on booking acceptance |
| `ChatMessage` | `id` (UUID) | `sessionId`, `senderId`, `message`, `timestamp` | Session-scoped chat |
| `Payment` | `id` (UUID) | `sessionId` (unique), `clientId`, `advisorId`, `amount`, `status` | Status machine: pending→completed/failed→refunded |
| `Todo` | `id` (UUID) | `userId`, `title`, `completed` | Simple task list |
| `ai_events` | `id` (String) | `user_id`, `event_type`, `metadata_json` | AI behavioral events |
| `ai_insights` | `id` (String) | `user_id`, `insight_type`, `confidence_score` | Generated AI insights per user |
| `ai_model_runs` | `id` (String) | `run_type`, `status`, `processed_users` | AI job run audit |
| `user_features` | `user_id` (PK) | `avg_spend`, `savings_rate`, `risk_score`, `feature_data_json` | ML feature store |

### 5.5 Soft-Delete Strategy

The following tables support soft-deletion via `deletedAt DateTime?`:

`Account`, `Transaction`, `Goal`, `Friend`, `Loan`, `LoanPayment`, `Investment`, `GroupExpense`, `GroupExpenseMember`, `Notification`

**Convention:** All queries filtering active records should include `WHERE deletedAt IS NULL`. Repositories are responsible for applying this filter.

### 5.6 Monetary Data Integrity

| Rule | Implementation |
|------|---------------|
| All monetary columns use `Decimal(12,2)` | Prisma schema enforced |
| `Account.balance` is server-authoritative | DB trigger computes from transactions (comment in schema) |
| `Loan.outstandingBalance` is computed | DB trigger from payments |
| `Investment.totalInvested`, `currentValue`, `profitLoss` | DB trigger computed |
| Balance updates + transaction creation are atomic | `prisma.$transaction()` in service layer |
| Amount inputs validated as positive numbers | Zod schemas + socket handlers |

### 5.7 Indexing Strategy

Every table includes indexes on:
- `userId` — all user-scoped queries
- `createdAt` / `date` — time-range queries
- `syncStatus` — sync delta queries
- `deletedAt` — soft-delete filter
- `status` — state filtering
- Composite `(userId, date)` on `Transaction` — most frequent query pattern

### 5.8 Dual-Identity: User vs profiles

⚠️ **Important:** Two separate identity tables exist:

| Table | Purpose | Created by |
|-------|---------|------------|
| `User` | Backend app user (custom auth + Supabase mirror) | Backend register endpoint OR `ensureUserInDb()` |
| `profiles` | Supabase-managed extended profile | Supabase auth trigger |

The `profiles` table is a Supabase-native construct. `User` is the backend's authoritative record. `ensureUserInDb()` in `authMiddleware` auto-creates a `User` row when a Supabase user first hits the backend.

---

## 6. Offline-First & Sync Architecture

### 6.1 Local-First Write Flow

```
Mobile/Web Client
  │
  ├── Write to Dexie (IndexedDB) immediately
  │   → Mark record syncStatus = "pending"
  │
  ├── HTTP POST /api/v1/sync  (when online)
  │   → Send delta payload (entities with syncStatus=pending)
  │   → Server creates SyncQueue records
  │   → Server processes: upsert entities + mark synced
  │   → Return merge result to client
  │   → Client updates syncStatus = "synced"
  │
  └── WebSocket sync_request event (real-time)
      → Send lastSyncedAt timestamp
      → Server returns all entities updated since lastSyncedAt
      → Client merges into local Dexie store
```

### 6.2 SyncQueue Table

```
SyncQueue {
  entityType: 'transaction' | 'account' | 'goal' | 'loan' | 'friend' | ...
  entityId:   string (UUID of the entity)
  operation:  'create' | 'update' | 'delete'
  data:       JSON payload (serialized entity state)
  status:     'pending' | 'processing' | 'synced' | 'failed'
  retryCount: 0..3 (auto-fail after maxRetries=3)
  processedAt: DateTime (set when processed)
}
```

Sync conflict resolution: last-write-wins based on `updatedAt` timestamp. Records with `syncStatus = "synced"` on the entity are the canonical server state.

### 6.3 WebSocket Sync Protocol

```
Client → Server: sync_request { lastSyncedAt, entityTypes[] }
Server → Client: sync_response { data: { accounts[], transactions[], goals[], loans[], settings } }

Client → Server: transaction_update { transaction }
Server → Client: transaction_saved { success, transaction }
Server → All user devices: transaction_updated { transaction }

Client → Server: account_update { account }
Server → Client: account_saved { success, account }
Server → All user devices: account_updated { account }
```

---

## 7. Security Architecture

| Layer | Control |
|-------|---------|
| **Transport** | HTTPS enforced (Helmet HSTS), X-Powered-By disabled |
| **Headers** | Helmet (CSP, X-Frame-Options, X-XSS-Protection, COEP, CORP) |
| **CORS** | Dynamic allowlist (`config/cors.ts`), credentials: true |
| **Rate Limiting** | Redis-backed sliding window; 5 auth attempts/min, 10 bill uploads/min, 60 API req/min (prod) |
| **Input Validation** | Zod schemas on ALL routes (body, query, params) |
| **XSS Prevention** | Global body sanitizer strips HTML/script from all string fields |
| **Authentication** | Multi-provider JWT: custom → Supabase secret → Supabase API |
| **Authorization** | RBAC (role), Feature Gates (per-user flags), Owner-only checks |
| **Account Security** | Suspension check on every request (60s cache), OTP verification, PIN lockout |
| **Audit Trail** | `AuditLog` table, `audit()` utility called on auth failures, sensitive operations |
| **File Uploads** | Multer type enforcement, SHA256 dedup, virus scan hook (`virusScan.ts`), size limits |
| **Monetary Logic** | Server-authoritative, DB transactions for coupled operations |
| **Secrets** | All secrets in `.env`, never hardcoded, read via `config/env.ts` |
| **Dependency Security** | `bcrypt` for passwords, `tweetnacl` for E2E device encryption, `jose`/`jsonwebtoken` for JWT |

---

## 8. API Versioning & Endpoint Catalogue

All endpoints are under `/api/v1`. Auth-protected routes require `Authorization: Bearer <token>`.

### Auth (`/api/v1/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | ✗ | Register new user |
| POST | `/login` | ✗ | Login, get JWT |
| POST | `/login/challenge` | ✗ | Step-up login challenge |
| GET | `/profile` | ✓ | Get current user profile |
| PUT | `/profile` | ✓ | Update profile |
| POST | `/otp/send` | ✓ | Send OTP to user |
| POST | `/otp/verify` | ✓ | Verify OTP code |
| GET | `/devices` | ✓ | List registered devices |
| DELETE | `/devices/:deviceId` | ✓ | Revoke device |
| DELETE | `/account` | ✓ | Delete user account |

### Transactions (`/api/v1/transactions`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | ✓ | List transactions (cached) |
| POST | `/` | ✓ | Create transaction |
| GET | `/:id` | ✓ | Get transaction (cached) |
| PUT | `/:id` | ✓ | Update transaction |
| DELETE | `/:id` | ✓ | Delete transaction |
| GET | `/account/:accountId` | ✓ | Transactions by account |

### Accounts, Goals, Loans, Investments, Groups, Friends
Standard CRUD under respective prefixes — all require authentication.

### Admin (`/api/v1/admin`)
Requires `role: admin`. User management, feature flag control, analytics.

### Health Check
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | ✗ | DB + Redis + circuit breaker status |

---

## 9. Infrastructure & Deployment

### Docker Compose (Production)
```yaml
services:
  backend:   Node.js API (port 3000)
  postgres:  PostgreSQL 15
  redis:     Redis 7
```

### Environment Variables (Required)
```
DATABASE_URL              PostgreSQL connection string
JWT_SECRET                Custom JWT signing secret
SUPABASE_URL              Supabase project URL
SUPABASE_JWT_SECRET       Supabase JWT secret (from project dashboard)
SUPABASE_SERVICE_ROLE_KEY Supabase service role key
REDIS_URL                 Redis connection URL
GOOGLE_API_KEY            Google Gemini AI API key
FIREBASE_SECRET           Firebase Admin SDK for push notifications
```

### Prisma Deployment
```bash
# Generate client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Ensure cloud sync schema
npm run ensure:cloud-sync-schema
npm run ensure:db-integrity
```

---

## 10. Fix Recommendations & Known Issues

> **Legend:** ✅ Fixed | 🔄 In Progress | ⏳ Pending

### Fix Implementation Status

| ID | Severity | Description | Status | File(s) Changed |
|----|----------|-------------|--------|-----------------|
| C-1 | 🔴 Critical | `any` types in auth middleware | ✅ Fixed | `middleware/auth.ts` |
| C-2 | 🔴 Critical | Socket handlers bypass HTTP middleware | ⏳ Pending | `sockets/index.ts` |
| C-3 | 🔴 Critical | `SyncQueue.data` String→Json | ✅ Fixed | `prisma/schema.prisma` |
| C-4 | 🔴 Critical | Deprecated `GroupExpense.members` | ⏳ Pending (migration needed) | `prisma/schema.prisma` |
| M-1 | 🟡 Major | In-memory socket tracking | ⏳ Pending | `sockets/index.ts` |
| M-2 | 🟡 Major | `require()` in health check | ✅ Fixed | `app.ts` |
| M-3 | 🟡 Major | `profiles` no FK to `User` | ⏳ Pending | `prisma/schema.prisma` |
| M-4 | 🟡 Major | `Notification.channels/deliveryStatus` String→Json | ✅ Fixed | `prisma/schema.prisma` |
| M-5 | 🟡 Major | No expired RefreshToken cleanup | ✅ Fixed | `workers/cleanup.worker.ts` + `server.ts` |
| M-6 | 🟡 Major | `UserSettings.settings` String→Json | ✅ Fixed | `prisma/schema.prisma` |
| Mo-1 | 🟠 Moderate | `dev.db` in repo | ✅ Fixed | `.gitignore` |
| Mo-2 | 🟠 Moderate | `sync.routes.old.txt` in tree | ✅ Fixed | File deleted |
| Mo-3 | 🟠 Moderate | `AuditLog.userId` no FK | ⏳ Intentional (unauthenticated events) | — |
| Mo-4 | 🟠 Moderate | AI tables inconsistent naming | ⏳ Pending | `prisma/schema.prisma` |
| Mo-5 | 🟠 Moderate | `ImportLog` JSON as String | ✅ Fixed | `prisma/schema.prisma` |
| Mo-6 | 🟠 Moderate | `Transaction.tags` as String | ✅ Fixed | `prisma/schema.prisma` |
| Mi-1 | 🟢 Minor | Duplicate `requireFeature` exports | ⏳ Pending | `middleware/rbac.ts` |
| Mi-2 | 🟢 Minor | `bcrypt` + `bcryptjs` both listed | ✅ Fixed | `package.json` |
| Mi-3 | 🟢 Minor | `bull` + `bullmq` both listed | ✅ Fixed | `package.json` |
| Mi-4 | 🟢 Minor | `xlsx` has CVEs | ⏳ Pending (replace with exceljs) | `package.json` |
| Mi-5 | 🟢 Minor | `Investment` soft-delete filter missing | ⏳ Pending | `modules/investments/` |
| Mi-6 | 🟢 Minor | `AiScan.billId/transactionId` no FK | ⏳ Pending | `prisma/schema.prisma` |
| Extra | 🟢 Minor | `auth.types.ts` salary/monthlyIncome `any` | ✅ Fixed | `modules/auth/auth.types.ts` |
| Extra | 🟢 Minor | `app.ts` sanitize middleware `any` | ✅ Fixed | `app.ts` |

> **After schema fixes:** Run `npx prisma migrate dev --name fix-json-fields` to generate and apply the migration.

---

### 🔴 Critical

#### C-1: `any` types in auth middleware and sockets
**Files:** `middleware/auth.ts`, `sockets/index.ts`, `middleware/rbac.ts`  
**Issue:** Multiple `decoded: any`, `data: any`, `userClaims: any` usages violate type-safety requirements.  
**Fix:** Define explicit interfaces for JWT payloads and socket event data:
```typescript
interface CustomJwtPayload {
  userId?: string;
  sub?: string;
  email?: string;
  role?: string;
  isApproved?: boolean;
  name?: string;
}
// Replace: decoded: any
// With:    decoded: CustomJwtPayload
```

#### C-2: Socket-level business logic bypasses HTTP middleware pipeline
**File:** `sockets/index.ts`  
**Issue:** `saveTransaction()`, `saveAccount()`, `saveGoal()` in SocketManager write directly to Prisma, bypassing Zod validation, feature gates, audit logging, and cache invalidation.  
**Fix:** Socket handlers should call the same Service layer methods used by HTTP controllers:
```typescript
// Instead of: prisma.transaction.create(...)
// Call:       TransactionService.create(userId, validatedPayload)
```

#### C-3: `SyncQueue.data` is `String?` — should use `Json` type
**File:** `prisma/schema.prisma`  
**Issue:** `data String?` stores JSON but loses type safety and query-ability.  
**Fix:**
```prisma
data  Json?   // Change from String? to Json?
```

#### C-4: `GroupExpense.members` deprecated field still in schema
**File:** `prisma/schema.prisma`  
**Issue:** The `members String?` field is marked `DEPRECATED` in a comment but still present, creating confusion and potential bugs in old code paths.  
**Fix:** Create a migration to drop this column after confirming no active code paths use it:
```bash
npx prisma migrate dev --name remove_deprecated_group_members_field
```

---

### 🟡 Major

#### M-1: In-memory socket connection tracking doesn't scale
**File:** `sockets/index.ts`  
**Issue:** `connectedUsers` and `userDevices` Maps are in-memory. Multiple server instances or restarts lose all connection state. Cannot broadcast to users connected to a different instance.  
**Fix:** Use Redis pub/sub adapter for Socket.IO (`@socket.io/redis-adapter`):
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
this.io.adapter(createAdapter(pubClient, subClient));
```

#### M-2: Health check uses `require()` (CommonJS) inside an ES module context
**File:** `app.ts` line 138  
**Issue:** `const { prisma } = require('./db/prisma')` inside an async handler is inconsistent with the rest of the TypeScript ESM codebase.  
**Fix:**
```typescript
// At the top of app.ts
import { prisma } from './db/prisma';

// In health handler:
await prisma.$queryRaw`SELECT 1`;
```

#### M-3: `profiles` table has no foreign key to `User`
**File:** `prisma/schema.prisma`  
**Issue:** The `profiles` model has no `@@relation` to `User`. If a `profiles` row is created by Supabase and the user is later deleted from the `User` table, orphaned `profiles` rows will accumulate.  
**Fix:** Either add a FK relation in Prisma schema, or add a DB-level CASCADE DELETE trigger in a migration.

#### M-4: `Notification.channels` and `deliveryStatus` stored as raw strings
**File:** `prisma/schema.prisma`  
**Issue:** `channels String @default("app")` documents it as a JSON array but is typed as `String`. This loses type safety.  
**Fix:** Change to `Json`:
```prisma
channels        Json     @default("[\"app\"]")
deliveryStatus  Json     @default("{}")
```

#### M-5: Missing `@unique` index on `RefreshToken.token` + no expiry cleanup job
**File:** `prisma/schema.prisma`  
**Issue:** `RefreshToken.token` has `@unique` (good), but there is no background job to clean up expired tokens, causing unbounded table growth.  
**Fix:** Add a cron job in the AI engine or a separate worker:
```typescript
// Nightly cleanup
await prisma.refreshToken.deleteMany({
  where: { expiresAt: { lt: new Date() } }
});
```

#### M-6: `UserSettings.settings` is a `String @default("{}")` — should be `Json`
**File:** `prisma/schema.prisma`  
**Issue:** `settings String @default("{}")` is documented as JSON but typed as String.  
**Fix:**
```prisma
settings  Json  @default("{}")
```

---

### 🟠 Moderate

#### Mo-1: `dev.db` SQLite file committed to repository
**File:** `backend/dev.db`  
**Issue:** A SQLite database file is present in the repository. May contain test/development data. Should be in `.gitignore`.  
**Fix:** Add to `.gitignore`:
```
backend/dev.db
backend/*.db
```

#### Mo-2: `sync.routes.old.txt` left in source tree
**File:** `backend/src/modules/sync/sync.routes.old.txt`  
**Issue:** Old route file with `.txt` extension is committed. Could confuse developers.  
**Fix:** Delete the file and commit.

#### Mo-3: `AuditLog.userId` has no FK to `User`
**File:** `prisma/schema.prisma`  
**Issue:** `AuditLog` stores `userId: String` with no relation, so it can store `'unauthenticated'` but no referential integrity is enforced.  
**Fix:** This is acceptable for unauthenticated event logging. Document the intent clearly with a comment.

#### Mo-4: `ai_events`, `ai_insights`, `ai_model_runs`, `user_features` use inconsistent naming convention
**File:** `prisma/schema.prisma`  
**Issue:** These models use `snake_case` while all other models use `PascalCase`. This creates inconsistency in generated Prisma Client methods (`prisma.ai_events.create` vs `prisma.user.create`).  
**Fix:** Add `@@map("ai_events")` with a `PascalCase` model name, or rename models to `AiEvent`, `AiInsight`, etc.

#### Mo-5: `ImportLog` fields `createdCategories`, `createdAccounts`, `createdGoals`, `errors` stored as String
**File:** `prisma/schema.prisma`  
**Issue:** These fields are documented as JSON arrays but typed as `String @default("[]")`.  
**Fix:** Change to `Json`:
```prisma
createdCategories Json  @default("[]")
errors            Json  @default("[]")
```

#### Mo-6: `Transaction.tags` and `attachment` stored as `String?`
**File:** `prisma/schema.prisma`  
**Issue:** `tags` is likely a JSON array; storing as a string loses queryability.  
**Fix:** Change `tags` to `Json?` if array semantics are needed.

---

### 🟢 Minor / Improvements

#### Mi-1: Duplicate `requireFeature` exports
**Files:** `middleware/rbac.ts` and `middleware/featureGate.ts`  
**Issue:** Two different implementations of `requireFeature` may cause confusion.  
**Fix:** Consolidate into a single export from `featureGate.ts`.

#### Mi-2: `bcrypt` and `bcryptjs` both listed as dependencies
**File:** `backend/package.json`  
**Issue:** Both `bcrypt` (native) and `bcryptjs` (pure JS) are dependencies. Pick one.  
**Fix:** Use `bcrypt` (native, faster). Remove `bcryptjs` and its types.

#### Mi-3: Both `bull` and `bullmq` are dependencies
**File:** `backend/package.json`  
**Issue:** `bull` is the legacy version; `bullmq` is the modern rewrite. Redundant.  
**Fix:** Remove `bull`, use only `bullmq`.

#### Mi-4: `xlsx` package has known security vulnerabilities
**File:** `backend/package.json`  
**Issue:** `xlsx@0.18.5` (SheetJS CE) has known CVEs and the package is abandoned.  
**Fix:** Replace with `exceljs` (actively maintained):
```bash
npm uninstall xlsx && npm install exceljs
```

#### Mi-5: Missing `deletedAt` soft-delete filter on `Investment` repository queries
**Issue:** `Investment` has `deletedAt DateTime?` but any queries missing `where: { deletedAt: null }` will return deleted records.  
**Fix:** Audit all `investment` repository queries to ensure soft-delete filter.

#### Mi-6: `AiScan.billId` and `AiScan.transactionId` have no FK relations
**File:** `prisma/schema.prisma`  
**Issue:** These are plain `String?` fields with no Prisma relation, so referential integrity is not enforced.  
**Fix:** Add explicit relations to `ExpenseBill` and `Transaction`.

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **Dexie** | IndexedDB wrapper used on the client for local-first data storage |
| **SyncQueue** | Server-side queue table tracking pending offline-to-cloud sync operations |
| **syncStatus** | Field on entities: `"pending"` (local, unsynced) or `"synced"` (confirmed cloud) |
| **Feature Gate** | Per-user flag controlling access to specific app features (A/B, gradual rollout) |
| **RBAC** | Role-Based Access Control — admin/manager/advisor/user role hierarchy |
| **clientRequestId** | Idempotency key on Account, Goal, Loan, Investment to prevent duplicate creates |
| **dedupHash** | SHA-based unique hash on Transaction to prevent duplicate imports |
| **ensureUserInDb** | Auth middleware helper that upserts a User row when a Supabase user first hits the backend |
| **AuthRequest** | Extended Express Request type adding `userId` and `user` claims |
| **AppError** | Typed error class with HTTP status code, error code, and client-safe message |
| **Circuit Breaker** | Pattern in `utils/circuitBreaker.ts` — stops cascading failures to external services |
| **BullMQ** | Redis-backed job queue for async notification delivery (push + email) |
| **Gemini** | Google's generative AI model used for OCR extraction and financial insights |
| **TweetNaCl** | NaCl cryptography library for optional E2E encryption on device messages |

---

*This document was auto-generated from codebase analysis on June 9, 2026.*  
*Maintain this document alongside code changes. Update diagrams when modules are added or renamed.*

---

## Related Documents

| Document | Path | Description |
|----------|------|-------------|
| **Feature & Page API Reference** | `docs/FEATURE_PAGE_API_REFERENCE.md` | Per-page API call catalogue for all 30 feature areas |
| **Developer Quick Reference** | `docs/DEVELOPER_QUICK_REFERENCE.md` | Quick-start guide for developers |
| **Feature Gates Implementation** | `docs/FEATURE_GATES_IMPLEMENTATION.md` | Feature flag system deep-dive |
| **API Documentation** | `backend/API_DOCUMENTATION.md` | Detailed API endpoint documentation |

