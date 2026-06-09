# KANKU Application — Master Documentation

**Version:** 1.0.0  
**Date:** June 9, 2026  
**Status:** Production-Ready (with noted caveats)

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Feature-wise Breakdown](#3-feature-wise-breakdown)
4. [Data Flow Mapping](#4-data-flow-mapping)
5. [API Reference Summary](#5-api-reference-summary)
6. [Security Model](#6-security-model)
7. [Offline-First Design](#7-offline-first-design)
8. [Test Coverage Summary](#8-test-coverage-summary)
9. [Deployment & Configuration](#9-deployment--configuration)
10. [Known Issues & Status Report](#10-known-issues--status-report)

---

## 1. Application Overview

### Purpose
KANKU is a personal finance management application designed for the Indian market. It enables users to track income, expenses, loans, goals, investments, and group expenses in a secure, offline-first manner with real-time cloud sync.

### Scope
- **Target Users:** Individual consumers, financial advisors, and enterprise admins
- **Platforms:** Web (PWA), Android (via Capacitor), iOS (via Capacitor)
- **Primary Market:** India (INR default, multilingual-ready)

### Main Features
| Feature | Description |
|---------|-------------|
| Accounts | Manage multiple bank/cash/wallet accounts |
| Transactions | Track income, expenses, transfers with categorization |
| Loans | Personal/business loan tracking with EMI management |
| Goals | Savings goals with contribution tracking |
| Investments | Stocks, mutual funds, gold, FD/RD tracking |
| Groups | Shared expense splitting with friends |
| To-Do Lists | Financial task lists with sharing |
| AI Insights | AI-powered spending analysis and suggestions |
| Voice Assistant | Voice-controlled expense entry |
| Reports | Detailed financial reports and exports |
| Advisor Booking | Book certified financial advisors |
| Dashboard | Real-time financial health overview |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                           │
│  React 18 + TypeScript + Vite + Capacitor                       │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  Pages   │ │ Components│ │  Hooks   │ │     Services     │  │
│  │(SPA SPA  │ │ (Radix UI │ │(useAuth  │ │(transactionSvc   │  │
│  │routing)  │ │ Tailwind) │ │useSecurity)│ receiptSvc AI)  │  │
│  └────┬─────┘ └────┬──────┘ └────┬─────┘ └────────┬─────────┘  │
│       │             │              │                │            │
│  ┌────▼─────────────▼──────────────▼────────────────▼────────┐  │
│  │              Dexie (IndexedDB) - Local-First DB           │  │
│  │  Offline write → Sync pending → Background cloud sync    │  │
│  └────────────────────────────────┬───────────────────────────┘  │
└───────────────────────────────────┼──────────────────────────────┘
                                    │ HTTPS + JWT
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND LAYER                            │
│  Node.js + Express + TypeScript                                  │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Helmet + │ │  Rate    │ │   Auth   │ │  Zod Validation  │  │
│  │   CORS   │ │  Limit   │ │Middleware│ │   Middleware     │  │
│  └────┬─────┘ └────┬──────┘ └────┬─────┘ └────────┬─────────┘  │
│       │             │              │                │            │
│  ┌────▼─────────────▼──────────────▼────────────────▼────────┐  │
│  │                   API Routes (/api/v1/*)                   │  │
│  │  auth | accounts | transactions | goals | loans |          │  │
│  │  investments | groups | todos | dashboard | admin |        │  │
│  │  advisors | bookings | sessions | payments | ai |          │  │
│  │  receipts | bills | voice | import | sync                  │  │
│  └────────────────────────────────┬───────────────────────────┘  │
│                                   │                              │
│  ┌────────────────────────────────▼───────────────────────────┐  │
│  │              Service Layer (Business Logic)                │  │
│  └────────────────────────────────┬───────────────────────────┘  │
│                                   │                              │
│  ┌────────────────────────────────▼───────────────────────────┐  │
│  │              Repository Layer (Data Access)                │  │
│  └────────────────────────────────┬───────────────────────────┘  │
└───────────────────────────────────┼──────────────────────────────┘
                                    │ Prisma ORM
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE LAYER                           │
│  PostgreSQL (Primary) + Redis (Cache) + Supabase (Auth+Storage) │
│                                                                  │
│  Tables: User, Account, Transaction, Goal, Loan, LoanPayment,   │
│  Investment, Friend, GroupExpense, GroupSplit, ToDoList,         │
│  ToDoItem, BookingRequest, AdvisorSession, Payment, Device,      │
│  Notification, Category, UserPin, UserSettings, SyncRecord       │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 18, TypeScript, Vite |
| Mobile | Capacitor (Android/iOS) |
| Styling | Tailwind CSS v4, Radix UI |
| State Management | React Context + Dexie (IndexedDB) |
| Backend | Node.js, Express 4, TypeScript |
| ORM | Prisma v6 |
| Database | PostgreSQL 14+ |
| Cache | Redis (ioredis) |
| Auth | Supabase Auth + Custom JWT |
| Queue | BullMQ (Redis-backed) |
| Real-time | Socket.IO |
| AI | Google Gemini Pro |
| OCR | Tesseract.js |
| File Upload | Multer |
| Validation | Zod |
| Testing | Jest (backend) + Vitest (frontend) |

---

## 3. Feature-wise Breakdown

### 3.1 Authentication & Security

**Description:** Dual-layer authentication using Supabase for identity and custom JWTs for backend authorization.

**Inputs:**
- Registration: `email`, `name`, `password`
- Login: `email`, `password` or challenge-response code
- Profile update: `firstName`, `lastName`, `country`, `city`, `avatar`

**Outputs:**
- JWT access token (via `Authorization` header)
- Refresh token (via `X-Refresh-Token` header)
- User profile object

**Processing Logic:**
1. Registration creates user in Supabase and Prisma DB
2. Login verifies credentials via bcrypt
3. Custom JWT issued with role claims
4. Auth middleware verifies: Custom JWT → Supabase JWT → Supabase API
5. User snapshot cached (60s TTL) to avoid per-request DB queries
6. Suspended accounts blocked at auth layer

**Dependencies:** `@supabase/supabase-js`, `jsonwebtoken`, `bcrypt`

---

### 3.2 Accounts

**Description:** Manage financial accounts (bank, wallet, cash, credit card, etc.)

**Inputs:**
- Create: `name`, `type`, `provider?`, `country?`, `balance?`, `currency?`
- Update: any subset of create fields
- Delete: `id` (soft-delete via `deletedAt`)

**Outputs:**
- Account object with `id`, `userId`, `name`, `type`, `balance`, `currency`, `isActive`

**Processing Logic:**
1. Ownership check on all operations via `userId`
2. Duplicate name+type check within user's accounts
3. Balance is computed from transaction deltas (not stored directly)
4. Idempotency via `clientRequestId`

**API Endpoints:**
```
GET    /api/v1/accounts
POST   /api/v1/accounts
GET    /api/v1/accounts/:id
PUT    /api/v1/accounts/:id
DELETE /api/v1/accounts/:id
```

---

### 3.3 Transactions

**Description:** Core financial transaction recording with balance impact calculation.

**Inputs:**
- `accountId`, `type` (income|expense|transfer), `amount`, `category`, `date`
- Optional: `subcategory`, `description`, `merchant`, `tags`, `transferToAccountId`

**Outputs:**
- Transaction object with deduplication hash

**Processing Logic:**
1. Amount validation (positive, max 999,999,999)
2. Account ownership verification
3. Transfer: validates both source and target accounts
4. Balance delta calculation and atomic DB update
5. Deduplication via SHA-256 hash
6. Cache invalidation on mutation
7. Event emission for async processing (AI categorization, etc.)

**API Endpoints:**
```
GET    /api/v1/transactions
POST   /api/v1/transactions
GET    /api/v1/transactions/:id
PUT    /api/v1/transactions/:id
DELETE /api/v1/transactions/:id
GET    /api/v1/transactions/account/:accountId
```

---

### 3.4 Goals

**Description:** Savings goals with progress tracking and contributions.

**Inputs:**
- Create: `name`, `targetAmount`, `targetDate`, `category?`, `isGroupGoal?`
- Update: any subset + `currentAmount`, `syncStatus`

**Outputs:**
- Goal object with `id`, `name`, `targetAmount`, `currentAmount`, `targetDate`, `progress%`

**Processing Logic:**
1. Duplicate name check per user
2. Numeric validation
3. Soft-delete (retains data for sync)
4. Idempotency via `clientRequestId`

**API Endpoints:**
```
GET    /api/v1/goals
POST   /api/v1/goals
GET    /api/v1/goals/:id
PUT    /api/v1/goals/:id
DELETE /api/v1/goals/:id
```

---

### 3.5 Loans

**Description:** Personal loan tracking with EMI payments and outstanding balance management.

**Inputs:**
- Create: `type` (borrowed|lent), `name`, `principalAmount`, `interestRate?`, `emiAmount?`, `dueDate?`, `frequency?`
- Payment: `amount`, `accountId?`, `notes?`

**Outputs:**
- Loan object with payments array, status (active|completed)

**Processing Logic:**
1. Atomic transaction for payment creation + balance update
2. Auto-mark loan as `completed` when `outstandingBalance === 0`
3. Ownership enforced on all mutations

**API Endpoints:**
```
GET    /api/v1/loans
POST   /api/v1/loans
GET    /api/v1/loans/:id
PUT    /api/v1/loans/:id
DELETE /api/v1/loans/:id
POST   /api/v1/loans/:id/payment
```

---

### 3.6 Investments

**Description:** Multi-asset investment portfolio tracking (stocks, mutual funds, gold, FD/RD).

**API Endpoints:**
```
GET    /api/v1/investments
POST   /api/v1/investments
GET    /api/v1/investments/:id
PUT    /api/v1/investments/:id
DELETE /api/v1/investments/:id
```

---

### 3.7 Dashboard

**Description:** Real-time financial health aggregation (net worth, cashflow, top categories).

**Outputs:** Total balance, income/expense breakdown, savings rate, top spending categories, recent transactions

**API Endpoints:**
```
GET    /api/v1/dashboard/summary
GET    /api/v1/dashboard/cashflow
```

---

### 3.8 AI & Voice Features

**Description:** Google Gemini-powered financial insights, smart expense categorization, and voice transaction entry.

**Processing Logic:**
1. Transactions fed through AI engine for category prediction
2. Voice commands parsed → transaction intent → review → create
3. NLQ (Natural Language Query) for financial questions
4. Circuit breaker pattern prevents cascading AI failures

**API Endpoints:**
```
POST   /api/v1/ai/insights
POST   /api/v1/voice/command
GET    /api/v1/categorize
POST   /api/v1/categorize/learn
```

---

### 3.9 Advisor Booking System

**Description:** Certified financial advisor discovery, booking, sessions, and payments.

**Flow:**
1. Client browses advisors → books time slot
2. Advisor accepts/rejects/reschedules
3. Session created with chat capabilities
4. Payment processed (Stripe integration)

**API Endpoints:**
```
GET    /api/v1/advisors
POST   /api/v1/bookings
PUT    /api/v1/bookings/:id/accept
PUT    /api/v1/bookings/:id/reject
GET    /api/v1/sessions/:id
POST   /api/v1/sessions/:id/messages
POST   /api/v1/payments/checkout
```

---

### 3.10 Sync System

**Description:** Offline-first bidirectional sync between Dexie (local) and PostgreSQL (cloud).

**Flow:**
1. All writes go to Dexie first (local-first)
2. Sync worker pushes pending changes to `/api/v1/sync/push`
3. `/api/v1/sync/pull` fetches delta changes since last sync
4. Conflict resolution uses `updatedAt` timestamps
5. Retry with exponential backoff on network failure

---

### 3.11 Admin Panel

**Description:** System administration, feature flag management, AI configuration, user management.

**Roles:** `admin`, `manager`

**API Endpoints:**
```
GET    /api/v1/admin/users
GET    /api/v1/admin/stats
GET/PUT /api/v1/admin/feature-flags
GET    /api/v1/admin/pending-advisors
PUT    /api/v1/admin/advisors/:id/approve
```

---

## 4. Data Flow Mapping

### 4.1 Transaction Creation Flow

```
User Input (frontend form)
        │
        ▼
  Zod Validation (client-side)
        │
        ▼
  Dexie Write (local, immediate)   ◄── Offline: stays here until sync
        │
        ▼
  POST /api/v1/transactions
        │
        ▼
  Auth Middleware (JWT verify)
        │
        ▼
  Zod Validation (server-side, transactionCreateValidatedSchema)
        │
        ▼
  TransactionService.createTransaction()
        │
        ├── Verify account ownership (DB)
        ├── Check transfer target account
        ├── Generate dedup hash
        ├── Check idempotency
        ├── Calculate balance deltas
        │
        ▼
  transactionRepository.createWithBalanceUpdate() ← DB Transaction
        │
        ├── INSERT Transaction row
        └── UPDATE Account.balance (delta)
        │
        ▼
  Cache Invalidation (Redis)
  Event Emission (AI categorize)
        │
        ▼
  Response → Frontend
        │
        ▼
  Dexie sync status updated to 'synced'
```

### 4.2 Authentication Flow

```
User enters email/password
        │
        ▼
  Supabase Auth SDK (signIn)
        │
        ▼
  Supabase returns session + access_token
        │
        ▼
  Frontend stores token securely
        │
        ▼
  API Request with Bearer token
        │
        ▼
  Auth Middleware (3-step verification)
        ├── 1. Try custom JWT (fast path)
        ├── 2. Try Supabase JWT secret verify
        └── 3. Call Supabase API (fallback)
        │
        ▼
  User snapshot from DB (cached 60s)
        │
        ├── Check account status (suspended?)
        ├── Resolve actual role from DB
        └── Attach req.user to request
        │
        ▼
  ensureUserInDb() (creates if missing)
        │
        ▼
  Route Handler executes
```

---

## 5. API Reference Summary

All endpoints are under `/api/v1/` prefix.  
Full Swagger UI available at: `GET /api-docs`  
OpenAPI JSON at: `GET /api-docs/openapi.json`

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/register | ❌ | Register new user |
| POST | /auth/login | ❌ | Login with email/password |
| POST | /auth/login/challenge | ❌ | Challenge-response login |
| GET | /auth/profile | ✅ | Get current user profile |
| PUT | /auth/profile | ✅ | Update user profile |
| POST | /auth/otp/send | ✅ | Send OTP |
| POST | /auth/otp/verify | ✅ | Verify OTP |
| DELETE | /auth/account | ✅ | Delete account |

### Core Resources (all require ✅ auth)
| Resource | GET List | POST | GET /:id | PUT /:id | DELETE /:id |
|----------|----------|------|----------|----------|-------------|
| /accounts | ✅ | ✅ | ✅ | ✅ | ✅ |
| /transactions | ✅ | ✅ | ✅ | ✅ | ✅ |
| /goals | ✅ | ✅ | ✅ | ✅ | ✅ |
| /loans | ✅ | ✅ | ✅ | ✅ | ✅ |
| /investments | ✅ | ✅ | ✅ | ✅ | ✅ |
| /friends | ✅ | ✅ | ✅ | ✅ | ✅ |
| /groups | ✅ | ✅ | ✅ | ✅ | ✅ |
| /todos | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 6. Security Model

### Authentication Layers
1. **Supabase Auth** — identity provider (email/OTP/OAuth)
2. **Custom JWT** — backend-issued tokens with role claims
3. **PIN Auth** — local device PIN for additional security

### Authorization
- **RBAC:** `user`, `advisor`, `manager`, `admin`
- Ownership checks on all user-scoped resources
- Admin endpoints gated by role middleware
- Feature flags control per-feature access

### Input Security
- All request bodies sanitized (HTML/script tag stripping)
- Zod validation on all route inputs
- SQL injection prevented by Prisma parameterized queries
- XSS prevented at input (sanitize) and output (JSON encoding)

### Rate Limiting
| Scope | Limit | Window |
|-------|-------|--------|
| Global API | 60 req/min (prod) / 600 (dev) | 1 minute |
| Auth endpoints | 5 req/min | 1 minute |
| Bill uploads | 10 req/min | 1 minute |
| Receipt scans | 8 req/min | 1 minute |
| Sync | 100 req/min | 1 minute |
| Account deletion | 3 req/min | 1 minute |

### HTTP Security Headers (Helmet)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- `Content-Security-Policy`
- No `X-Powered-By` header

---

## 7. Offline-First Design

### Local-First Write Pattern
```
1. User action → Write to Dexie immediately (sync_status='pending')
2. UI updates instantly from Dexie
3. Background sync worker picks up pending records
4. Push to backend via /api/v1/sync/push
5. On success: mark sync_status='synced'
6. On failure: retry with exponential backoff
7. Pull delta changes from /api/v1/sync/pull on app resume
```

### Conflict Resolution
- `updatedAt` timestamp-based: latest write wins
- `clientRequestId` provides idempotency for create operations
- `dedupHash` prevents duplicate transactions

### Tables Synced via Dexie
`accounts`, `transactions`, `goals`, `investments`, `loans`, `friends`, `group_expenses`, `to_do_lists`, `to_do_items`, `to_do_list_shares`

---

## 8. Test Coverage Summary

### Backend Test Files
| Test Suite | Type | Status |
|-----------|------|--------|
| auth.test.ts | Integration | ✅ Comprehensive |
| transactions.test.ts | Integration | ✅ Comprehensive |
| accounts.test.ts | Integration | ✅ Comprehensive |
| security.test.ts | Security | ✅ Comprehensive |
| goals.test.ts | Integration | ✅ New |
| loans.test.ts | Integration | ✅ New |
| dashboard.test.ts | Integration | ✅ New |
| investments.test.ts | Integration | ✅ New |
| notifications.test.ts | Integration | ✅ New |
| settings.test.ts | Integration | ✅ New |
| friends-groups.test.ts | Integration | ✅ New |
| todos.test.ts | Integration | ✅ New |
| smoke.test.ts | Smoke | ✅ New |
| ai-security.test.ts | Security | ✅ Existing |
| bills-security.test.ts | Security | ✅ Existing |
| sync.test.ts | Integration | ✅ Existing |
| voice.test.ts | Integration | ✅ Existing |
| admin-management.test.ts | Integration | ✅ Existing |
| admin-bookings-payments.test.ts | Integration | ✅ Existing |
| loans-goals-settings.test.ts | Integration | ✅ Existing |
| profile-persistence.test.ts | Integration | ✅ Existing |

### Frontend Test Files
| Test Suite | Type | Status |
|-----------|------|--------|
| permissionService.test.ts | Unit | ✅ Existing |
| pinService.test.ts | Unit | ✅ Existing |
| receiptParserService.test.ts | Unit | ✅ Existing |
| receiptScannerService.test.ts | Unit | ✅ Existing |
| voiceAIProcessor.test.ts | Unit | ✅ Existing |
| voiceFinancialService.test.ts | Unit | ✅ Existing |
| smartExpenseImportService.test.ts | Unit | ✅ Existing |
| bankStatementScannerService.test.ts | Unit | ✅ Existing |
| ocrService.test.ts | Unit | ✅ Existing |
| documentManagementService.test.ts | Unit | ✅ Existing |

---

## 9. Deployment & Configuration

### Environment Variables

**Required:**
```bash
DATABASE_URL=postgresql://user:password@host:5432/KANKU
JWT_SECRET=your-long-random-secret
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

**Optional:**
```bash
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
STRIPE_API_KEY=sk_...
PORT=3000
NODE_ENV=production
API_RATE_LIMIT=60
AUTH_RATE_LIMIT=5
```

### Docker Compose
Both `docker-compose.yml` (root) and `backend/docker-compose.yml` are available.

### Database
1. `cd backend && npx prisma generate`
2. `npx prisma migrate deploy` (production) or `npx prisma migrate dev` (development)
3. Optional: `node scripts/seed-admin-feature-data.cjs`

---

## 10. Known Issues & Status Report

See `STATUS_REPORT.md` for the full current status report.

