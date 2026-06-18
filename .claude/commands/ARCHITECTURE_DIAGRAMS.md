# KANAKU — Architecture Flow Diagrams

**Date:** June 9, 2026  
**Format:** ASCII + Mermaid-compatible diagrams

---

## Diagram 1: Overall System Architecture

```
╔══════════════════════════════════════════════════════════════════════╗
║                        USER INTERFACES                              ║
║                                                                      ║
║  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐   ║
║  │  Mobile App │   │  Web (PWA)  │   │   Admin / Advisor UI    │   ║
║  │ (Capacitor) │   │ (React 18)  │   │  (Role-gated pages)     │   ║
║  └──────┬──────┘   └──────┬──────┘   └───────────┬─────────────┘   ║
╚═════════╪══════════════════╪═════════════════════╪═════════════════╝
          │                  │                     │
          └──────────────────┼─────────────────────┘
                             │ HTTPS (Bearer JWT)
╔════════════════════════════╪════════════════════════════════════════╗
║ FRONTEND LAYER             │                                        ║
║                            ▼                                        ║
║  ┌─────────────────────────────────────────────────────────────┐   ║
║  │                    React App Shell                          │   ║
║  │  AuthFlow → PINAuth → OnBoarding → App (route-gated)        │   ║
║  └─────────┬────────────────────────────────────┬──────────────┘   ║
║            │                                    │                   ║
║  ┌─────────▼──────────┐               ┌─────────▼──────────────┐   ║
║  │   Dexie (IDB)      │               │   Backend Services      │   ║
║  │   Local-First DB   │◄──sync────────│  (transactionService,  │   ║
║  │   Write-first      │               │   accountService, etc.) │   ║
║  └────────────────────┘               └────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════╝
                             │ REST API /api/v1
╔════════════════════════════╪════════════════════════════════════════╗
║ BACKEND LAYER              ▼                                        ║
║                                                                      ║
║  Request Pipeline:                                                   ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   ║
║  │ Request  │  │  Helmet  │  │   Rate   │  │   Auth           │   ║
║  │ ID Stamp │→ │  CORS    │→ │  Limit   │→ │   Middleware     │   ║
║  └──────────┘  └──────────┘  └──────────┘  └────────┬─────────┘   ║
║                                                       │             ║
║  ┌────────────────────────────────────────────────────▼──────────┐  ║
║  │                   Zod Validation Middleware                   │  ║
║  └────────────────────────────────────────────────────┬──────────┘  ║
║                                                        │            ║
║  ┌─────────────────────────────────────────────────────▼─────────┐  ║
║  │                   Route Handlers / Controllers                │  ║
║  └─────────────────────────────────────────────────────┬─────────┘  ║
║                                                         │           ║
║  ┌──────────────────────────────────────────────────────▼────────┐  ║
║  │                   Service Layer (Business Logic)              │  ║
║  └──────────────────────────────────────────────────────┬────────┘  ║
║                                                          │          ║
║  ┌───────────────────────────────────────────────────────▼───────┐  ║
║  │              Repository Layer / Prisma ORM                    │  ║
║  └───────────────────────────────────────────────────────┬───────┘  ║
╚══════════════════════════════════════════════════════════╪══════════╝
                                                           │
╔══════════════════════════════════════════════════════════╪══════════╗
║ DATA LAYER                                               ▼          ║
║                                                                      ║
║  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐ ║
║  │  PostgreSQL      │  │  Redis Cache     │  │  Supabase          │ ║
║  │  (Primary DB)    │  │  (API responses, │  │  (Auth + Storage)  │ ║
║  │  Prisma ORM      │  │   session state) │  │  JWT verification  │ ║
║  └─────────────────┘  └──────────────────┘  └────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## Diagram 2: Feature Flow — Transaction Creation

```
┌─────────────────────────────────────────────────────────────────────┐
│  INPUT: User fills AddTransaction form                              │
│  Fields: accountId, type, amount, category, date, description       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT-SIDE VALIDATION (Zod)                                       │
│  - amount > 0                                                        │
│  - type ∈ {income, expense, transfer}                               │
│  - date is valid                                                     │
│  - if transfer: transferToAccountId ≠ accountId                     │
└────────────────┬───────────────────────────────────┬────────────────┘
                 │ PASS                               │ FAIL
                 ▼                                   ▼
┌────────────────────────────────┐    ┌──────────────────────────────┐
│  Write to Dexie immediately    │    │  Show form validation errors │
│  syncStatus = 'pending'        │    │  Return to user              │
└────────────┬───────────────────┘    └──────────────────────────────┘
             │ (async, background)
             ▼
┌────────────────────────────────────────────────────────────────────┐
│  POST /api/v1/transactions                                         │
│  Headers: Authorization: Bearer <JWT>                              │
└────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────────┐
│  Auth Middleware                                                    │
│  1. Verify JWT signature (custom secret)                           │
│  2. Load user snapshot from cache or DB                            │
│  3. Check account status (not suspended)                           │
│  4. Attach req.user = { id, email, role }                          │
└────────────────────┬───────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────────┐
│  Zod Validation (transactionCreateValidatedSchema)                 │
│  - accountId: string min(1)                                        │
│  - type: enum(income|expense|transfer)                             │
│  - amount: number positive, max 999,999,999                        │
│  - category: string min(1) max(80)                                 │
│  - date: coerce.date()                                             │
│  - superRefine: transfer requires transferToAccountId              │
└────────────────────┬───────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────────────┐
│  TransactionService.createTransaction()                            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 1. Validate account ownership (accountRepository.findFirst)  │ │
│  │    WHERE id=accountId AND userId=currentUser               │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
│                                 │                                  │
│  ┌──────────────────────────────▼───────────────────────────────┐ │
│  │ 2. If type=transfer:                                         │ │
│  │    - Require transferToAccountId                             │ │
│  │    - Validate target ≠ source                                │ │
│  │    - Verify target account ownership                         │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
│                                 │                                  │
│  ┌──────────────────────────────▼───────────────────────────────┐ │
│  │ 3. Generate dedupHash (SHA-256: userId+amount+date+desc)     │ │
│  │    Check for existing transaction with same hash             │ │
│  │    → Return existing if found (idempotency)                  │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
│                                 │                                  │
│  ┌──────────────────────────────▼───────────────────────────────┐ │
│  │ 4. Calculate balance deltas:                                 │ │
│  │    - income:   account += amount                             │ │
│  │    - expense:  account -= amount                             │ │
│  │    - transfer: source -= amount, target += amount            │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
│                                 │                                  │
│  ┌──────────────────────────────▼───────────────────────────────┐ │
│  │ 5. DB Transaction (atomic):                                  │ │
│  │    INSERT INTO transactions (...)                            │ │
│  │    UPDATE accounts SET balance += delta WHERE id=...         │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
└────────────────────────────────┬───────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  Post-Creation:                                                    │
│  - Redis cache invalidation: transactions:*, accounts:*           │
│  - Event emission: TRANSACTION_CREATED                             │
│  - AI categorization (async background)                            │
│  - WebSocket broadcast to user's connected devices                 │
└────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  OUTPUT: 201 { success: true, data: { id, userId, amount, ... } } │
│  Frontend: Dexie record updated to syncStatus='synced'             │
└────────────────────────────────────────────────────────────────────┘
```

---

## Diagram 3: Feature Flow — Authentication

```
┌─────────────────────────────────────────────────────────────────────┐
│  INPUT: User enters email + password (or OAuth)                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Supabase Auth SDK (client-side)                                    │
│  supabase.auth.signInWithPassword({ email, password })              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │ Success?                │
              └──────┬──────────┬───────┘
                     │ YES      │ NO
                     ▼          ▼
         ┌───────────────┐  ┌─────────────────────────────┐
         │ session.access│  │ Show error: invalid creds   │
         │ _token stored │  │ or account locked           │
         └───────┬───────┘  └─────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  Frontend: AuthContext updates                                     │
│  - user set from Supabase session                                  │
│  - Triggers onboarding check, PIN setup, data sync                │
└────────────────────────────────────────────────────────────────────┘
                 │
                 ▼ (for every subsequent API call)
┌────────────────────────────────────────────────────────────────────┐
│  Backend Auth Middleware (3-tier verification)                     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Tier 1: Custom JWT (JWT_SECRET)                              │ │
│  │  jwt.verify(token, JWT_SECRET) → extract userId+role        │ │
│  │  ✅ Fast path (no network)                                   │ │
│  └──────────────────────┬───────────────────────────────────────┘ │
│                         │ FAIL                                    │
│  ┌──────────────────────▼───────────────────────────────────────┐ │
│  │ Tier 2: Supabase JWT Secret (SUPABASE_JWT_SECRET)            │ │
│  │  jwt.verify(token, supabaseSecret) → extract sub             │ │
│  │  ✅ Fast path (no network)                                   │ │
│  └──────────────────────┬───────────────────────────────────────┘ │
│                         │ FAIL                                    │
│  ┌──────────────────────▼───────────────────────────────────────┐ │
│  │ Tier 3: Supabase API call (production only)                  │ │
│  │  supabase.auth.getUser(token) → user object                  │ │
│  │  ⚠️ Network call (slowest path)                              │ │
│  └──────────────────────┬───────────────────────────────────────┘ │
│                         │ FAIL → 401 Unauthorized                 │
└─────────────────────────┼──────────────────────────────────────────┘
                          │ SUCCESS (any tier)
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│  getUserAuthSnapshot(userId)                                       │
│  - Check in-memory cache (60s TTL)                                │
│  - If miss: DB query with 5s timeout                               │
│  - Returns: { email, role, isApproved, name, status }              │
│  - If status='suspended' → 403 ACCOUNT_SUSPENDED                  │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────────┐
│  req.user = {                                                      │
│    id: userId,                                                     │
│    email: snapshot.email || token.email,                           │
│    role: snapshot.role || 'user',   ← DB is authoritative         │
│    isApproved: snapshot.isApproved,                                │
│  }                                                                 │
│                                                                    │
│  ensureUserInDb() if no snapshot (first-time login from new client)│
└─────────────────────────────────────────────────────────────────────┘
```

---

## Diagram 4: Feature Flow — Offline-First Sync

```
┌─────────────────────────────────────────────────────────────────────┐
│  ONLINE STATE                    │  OFFLINE STATE                  │
│                                  │                                  │
│  User Action (e.g. add expense)  │  User Action (e.g. add expense) │
│         │                        │         │                        │
│         ▼                        │         ▼                        │
│  Write to Dexie (local)          │  Write to Dexie (local)         │
│  syncStatus='synced'  ◄────────  │  syncStatus='pending'           │
│         │                        │         │ (stays until online)   │
│         │                        │         │                        │
│  POST /api/v1/sync/push  ────────┘         │                        │
│         │                                  │                        │
│         ▼                                  │                        │
│  Backend processes push                    │                        │
│         │                                  │                        │
│         ▼                                  │                        │
│  DB updated                      ┌─────────▼──────────────────────┐│
│         │                        │  Retry worker (exponential     ││
│         │                        │  backoff): 5s → 15s → 45s     ││
│  Pull delta changes              └────────────────────────────────┘│
│  GET /api/v1/sync/pull           When network restored:             │
│  ?since=lastSyncedAt             Same flow as ONLINE STATE →        │
└─────────────────────────────────────────────────────────────────────┘

Sync Tables:
┌─────────────────────────────────────────────────┐
│  accounts          → Dexie.accounts             │
│  transactions      → Dexie.transactions         │
│  goals             → Dexie.goals                │
│  investments       → Dexie.investments          │
│  loans             → Dexie.loans                │
│  friends           → Dexie.friends              │
│  group_expenses    → Dexie.group_expenses       │
│  to_do_lists       → Dexie.to_do_lists          │
│  to_do_items       → Dexie.to_do_items          │
│  to_do_list_shares → Dexie.to_do_list_shares    │
└─────────────────────────────────────────────────┘

Conflict Resolution:
  updatedAt(local) > updatedAt(server) → local wins
  updatedAt(local) < updatedAt(server) → server wins
  dedupHash match → idempotent, skip duplicate
```

---

## Diagram 5: Feature Flow — Advisor Booking

```
CLIENT                    BACKEND                    ADVISOR
  │                          │                          │
  │  GET /advisors           │                          │
  │─────────────────────────►│                          │
  │  [list of advisors]      │                          │
  │◄─────────────────────────│                          │
  │                          │                          │
  │  POST /bookings          │                          │
  │  {advisorId, time, type} │                          │
  │─────────────────────────►│                          │
  │                          │  BookingRequest created  │
  │  {bookingId, status:     │  status='pending'        │
  │   'pending'}             │─────────────────────────►│
  │◄─────────────────────────│  (notification sent)     │
  │                          │                          │
  │                          │  PUT /bookings/:id/accept│
  │                          │◄─────────────────────────│
  │                          │                          │
  │  (notification sent)     │  AdvisorSession created  │
  │◄─────────────────────────│  status='scheduled'      │
  │                          │                          │
  │  POST /payments/checkout │                          │
  │─────────────────────────►│                          │
  │                          │  Stripe checkout session │
  │  {checkoutUrl}           │  created                 │
  │◄─────────────────────────│                          │
  │                          │                          │
  │  [User pays via Stripe]  │                          │
  │                          │                          │
  │                          │◄── Stripe Webhook ───────│
  │                          │  payment.succeeded        │
  │                          │  Payment record created  │
  │                          │                          │
  │  GET /sessions/:id       │                          │
  │─────────────────────────►│                          │
  │  {session details,       │                          │
  │   chatMessages: []}      │                          │
  │◄─────────────────────────│                          │
  │                          │                          │
  │  WebSocket: join room    │  Socket.IO room:         │
  │  session:{sessionId}     │  session:{sessionId}     │
  │─────────────────────────►│◄─────────────────────────│
  │                          │                          │
  │◄── real-time chat ───────┼──── real-time chat ─────►│
```

---

## Diagram 6: Feature Flow — AI Insights

```
┌─────────────────────────────────────────────────────────────────────┐
│  INPUT: User opens AI Insights page                                 │
│         OR: New transaction created (background trigger)            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Feature Gate Check                                                 │
│  - aiCapabilities.aiAutomation.enabled === true?                    │
│  - User role has AI access?                                         │
│  - Admin feature flags allow AI for this user tier?                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ PASS
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  POST /api/v1/ai/insights                                           │
│  Body: { transactions: [...last 30 days], goals, accounts }         │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AIService (Google Gemini Pro)                                      │
│                                                                     │
│  Circuit Breaker Pattern:                                           │
│  - CLOSED: Normal operation, requests pass through                 │
│  - OPEN: Too many failures, reject fast (no AI calls)              │
│  - HALF-OPEN: Test if service recovered                            │
│                                                                     │
│  Prompt Engineering:                                                │
│  - System: "You are a personal finance advisor for Indian users"    │
│  - Context: spending patterns, goals progress, category breakdown   │
│  - Request: actionable insights in JSON format                     │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OUTPUT: {                                                          │
│    spendingInsights: [...],                                        │
│    goalRecommendations: [...],                                     │
│    categoryAlerts: [...],                                          │
│    savingsTips: [...]                                              │
│  }                                                                  │
│                                                                     │
│  Cached in Redis (user-scoped, 15min TTL)                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Diagram 7: Feature Flow — Receipt OCR

```
┌─────────────────────────────────────────────────────────────────────┐
│  INPUT: User uploads receipt image (camera/gallery)                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  File Validation (Multer)                                           │
│  - Max size: 10MB                                                   │
│  - Allowed MIME: image/jpeg, image/png, image/webp                 │
│  - Rate limit: 8 uploads/minute per user                           │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  POST /api/v1/receipts/scan                                         │
│  multipart/form-data: { file: <image> }                             │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                 ┌──────────▼──────────┐
                 │ OCR Strategy        │
                 │ 1. Tesseract.js     │
                 │ 2. Cloud OCR (if    │
                 │    Tesseract fails) │
                 └──────────┬──────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Receipt Parser                                                     │
│  - Extract: merchant, date, total, line items                       │
│  - Normalize: currency, date format                                 │
│  - Classify: expense category                                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OUTPUT: {                                                          │
│    merchant: "Swiggy",                                              │
│    total: 450,                                                      │
│    date: "2026-06-09",                                              │
│    category: "Food & Dining",                                      │
│    items: [{ name: "Biryani", price: 280 }, ...]                   │
│  }                                                                  │
│                                                                     │
│  Frontend: Pre-fills AddTransaction form with parsed data           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Diagram 8: Role & Permission Model

```
                    ┌─────────────────────────────────┐
                    │          Roles Hierarchy         │
                    └─────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────┐
  │                         ADMIN                            │
  │  - All user capabilities                                 │
  │  - Feature flag management                               │
  │  - User management (suspend/activate)                    │
  │  - AI configuration                                      │
  │  - Advisor approval/rejection                            │
  │  - System metrics & logs                                 │
  └───────────────────────┬──────────────────────────────────┘
                          │
  ┌───────────────────────▼──────────────────────────────────┐
  │                        MANAGER                           │
  │  - Advisor verification workflow                         │
  │  - View pending advisors                                 │
  │  - Cannot modify system-level settings                   │
  └───────────────────────┬──────────────────────────────────┘
                          │
  ┌───────────────────────▼──────────────────────────────────┐
  │                        ADVISOR                           │
  │  - All user capabilities                                 │
  │  - Advisor workspace (client management)                 │
  │  - Accept/reject/reschedule bookings                     │
  │  - Conduct sessions                                      │
  │  - Requires isApproved=true to access advisor features   │
  └───────────────────────┬──────────────────────────────────┘
                          │
  ┌───────────────────────▼──────────────────────────────────┐
  │                         USER                             │
  │  - Accounts, Transactions, Goals, Loans, Investments     │
  │  - Groups, Friends, To-Do Lists                          │
  │  - Reports, AI Insights (if enabled), Voice              │
  │  - Book advisors                                         │
  │  - Manage devices, notifications, settings               │
  └──────────────────────────────────────────────────────────┘

Feature Flag Gating (layered on top of roles):
  - Features can be enabled/disabled per user tier by admin
  - Checked client-side (canAccessPage) AND server-side (requireFeature)
  - AI features: voiceAssistant.enabled, aiAutomation.enabled
  - Transaction features: addTransaction, editTransaction, deleteTransaction
```

---

*Diagrams last updated: June 9, 2026*

