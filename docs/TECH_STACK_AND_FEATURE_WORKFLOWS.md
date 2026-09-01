# KANAKU — Complete Tech Stack & End-to-End Feature Workflow Documentation

---

## 1. System Overview & Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT PRESENTATION TIER                             │
├──────────────────────────────────────┬───────────────────────────────────────────┤
│          Web Application             │          Native Mobile Apps               │
│  • React 18 (Concurrent Mode)        │  • Android: Gradle, Kotlin/Java, Keystore │
│  • TypeScript 5                      │  • iOS: Swift, Xcode, Keychain, ATS       │
│  • Vite + Rolldown Bundler           │  • Capacitor 6 Native Bridge Plugins      │
│  • TailwindCSS + CSS Glassmorphism   │  • Biometric Authentication / FaceID      │
│  • Framer Motion (Micro-animations)  │  • Android SMS BroadcastReceiver          │
│  • Lucide React Icons & Sonner Toast │  • Background Sync & Deep Links (kanaku://│
└──────────────────────────────────────┴───────────────────────────────────────────┘
                                       │
                   HTTPS / TLS 1.3 (REST JSON + Idempotency-Key)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY & BACKEND TIER                             │
├──────────────────────────────────────────────────────────────────────────────────┤
│  • Node.js 20 LTS + Express.js + TypeScript                                      │
│  • JWT Authentication (Access + Refresh Token Rotation, Argon2/PBKDF2 Hashing)  │
│  • Multi-Tier Idempotency (L0 RAM Mutex → L1 Redis Cache → L2 PostgreSQL)        │
│  • Distributed Sliding-Window Rate Limiting (Redis / In-Memory Fallback)         │
│  • Dynamic RBAC Engine (Roles: user, advisor, manager, admin)                    │
│  • Centralized Error Sanitizer & Security Audit Logger                           │
└──────────────────────────────────────────────────────────────────────────────────┘
                                       │
                      Prisma 7 ORM (@prisma/adapter-pg)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                       DATABASE & PERSISTENCE INFRASTRUCTURE                      │
├──────────────────────────────────────┬───────────────────────────────────────────┤
│        Authoritative Cloud DB        │        Offline Client Storage             │
│  • PostgreSQL 16                     │  • Dexie.js (Client-side IndexedDB)       │
│  • Scoped Unique DB Invariants       │  • Local Sync Queue (`db.syncQueue`)      │
│  • Interactive Isolation Tx (`SERIALIZABLE`) │ • Session Encryption Keys         │
│  • Atomic Paired Ledger Updates      │  • Multi-User Isolated Storage Purge      │
└──────────────────────────────────────┴───────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND WORKERS & AI / OCR INTEGRATIONS                    │
├──────────────────────────────────────────────────────────────────────────────────┤
│  • Background Worker Pool: Recurring SIP scheduler, Outbox Dispatcher, Alerts    │
│  • OCR Engine: Tesseract.js / Vision API regex parser for Total, Tax, GST, Date  │
│  • Voice Engine: Web Speech API + Capacitor Speech Recognition NLP Engine        │
│  • Canonical Financial Math: Lossless string parsing into Integer Minor Units    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Technology Stack Reference

| Tier | Component / Technology | Specification & Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | **React 18.3** | Functional components, Hooks, Suspense, Concurrent Rendering. |
| **Language** | **TypeScript 5.x** | Strict typing across 100% of codebase. |
| **Build Tooling** | **Vite 5 / Rolldown** | Fast HMR, per-route code splitting, asset bundling. |
| **Styling Engine** | **TailwindCSS 3 + Vanilla CSS** | Custom design system tokens, responsive glassmorphic cards, CSS animations. |
| **Animation Library** | **Framer Motion** | Tab transitions, modal entries, progress ring animations. |
| **Icons & Feedback** | **Lucide React & Sonner** | Consistent iconography and toast notifications. |
| **Client Database** | **Dexie.js 4 (IndexedDB)** | Schema v15, relational offline store, local sync queue (`db.syncQueue`). |
| **Mobile Bridge** | **Capacitor 6** | Android (targetSdk 36) & iOS 15+ native runtime. |
| **Mobile Native Code** | **Kotlin / Java & Swift** | Android `SmsReceiver`, Keystore, iOS Keychain, Biometrics / FaceID. |
| **Backend Runtime** | **Node.js 20 LTS** | Asynchronous event-driven backend service. |
| **Web Framework** | **Express.js 4** | Modular feature routers (`backend/src/features/*`). |
| **Database ORM** | **Prisma 7** | `@prisma/adapter-pg` driver adapter with `pg.Pool` connection pooling. |
| **Authoritative DB** | **PostgreSQL 16** | Schema invariants, `@@unique([userId, clientRequestId])`, `@unique transactionId`. |
| **Distributed Cache** | **Redis 7 (Upstash / Local)** | Distributed sliding-window rate limiting, L1 idempotency store, session revocation. |
| **Authentication** | **Custom JWT + Refresh Tokens** | HS256 JWT, Refresh token rotation, Argon2 & PBKDF2 password hashing. |
| **Financial Engine** | **Integer Minor-Unit Engine** | `financialMath.ts`: Lossless string parsing into `BigInt` Paise, zero float drift. |
| **Background Workers** | **Node.js Worker Pool** | Cron worker for SIP execution, atomic outbox dispatcher, budget threshold alerts. |
| **OCR & AI Scanner** | **Tesseract.js & RegEx Parser**| Client-side receipt scanning for Total, Date, Merchant, GST/Tax breakdown. |
| **Voice Entry** | **Web Speech API / Capacitor** | Speech-to-text with entity extraction for Amount, Category, Type, and Merchant. |

---

## 3. Step-by-Step Feature Workflows

---

### Feature 1: Authentication, Session Management & RBAC

```mermaid
sequenceDiagram
    autonumber
    participant User as Client App (Web / Android / iOS)
    participant Auth as Auth Controller (/api/v1/auth)
    participant DB as PostgreSQL Database
    participant Storage as Keystore / Keychain / Cookie

    User->>Auth: POST /auth/login (email, password)
    Auth->>DB: Query User record by email
    Auth->>Auth: Verify password hash (Argon2 / PBKDF2)
    Auth->>Auth: Generate Access Token (15m) + Refresh Token (30d)
    Auth-->>User: 200 OK (AccessToken + Refresh Token / HttpOnly Cookie)
    User->>Storage: Store Refresh Token in Keystore / Keychain
    
    Note over User,Auth: Access Token Expires after 15 minutes
    User->>Auth: Request Protected API (Returns 401 Unauthorized)
    User->>Auth: POST /auth/refresh (RefreshToken)
    Auth->>DB: Validate Refresh Token & User Active status
    Auth-->>User: 200 OK (New AccessToken + Rotated RefreshToken)
    User->>Auth: Re-attempt original request (Success)
```

#### Workflow Steps:
1. **Registration / Login**: User enters email and password. Password is validated and compared against stored Argon2/PBKDF2 hashes.
2. **Token Generation**: On successful authentication, backend generates a short-lived **Access Token** (15 minutes) and a long-lived **Refresh Token** (30 days).
3. **Platform Secure Storage**:
   - **Android / iOS**: Refresh token is saved to Android Keystore / iOS Keychain via Capacitor secure bridge.
   - **Web**: Refresh token is stored in a secure, `HttpOnly`, `SameSite=Strict` cookie.
4. **Role-Based Access Control (RBAC)**: Middleware inspects the token payload for user role (`user`, `advisor`, `manager`, `admin`) and enforces access policies.
5. **Silent 401 Refresh**: When an access token expires, client Axios interceptor catches the 401, invokes `/auth/refresh` once (`_retry = true`), updates the token, and replays the original request. If refresh fails, it initiates clean logout.
6. **Multi-User Logout Isolation**: Logout purges all local IndexedDB tables (`accounts`, `transactions`, `loans`, `goals`, `investments`, `recurringTransactions`, `budgets`, `gold`, `notifications`), ensuring zero data leakage between users on shared devices.

---

### Feature 2: Multi-Account Ledger & Real-Time Balance Aggregation

```mermaid
flowchart TD
    A[User Creates Account: e.g. HDFC Bank, Cash, Credit Card] --> B[Generate clientRequestId & Initial Balance in Paise]
    B --> C[POST /api/v1/accounts with Idempotency-Key]
    C --> D{DB Invariant Check: @@unique([userId, clientRequestId])}
    D -- New Account --> E[Create Account in PostgreSQL with openingBalance & balance]
    D -- Duplicate Replay --> F[Return Existing Account Record (Idempotent)]
    E --> G[Persist in Dexie Local DB]
    G --> H[Recalculate Net Worth & Total Liquid Assets]
    H --> I[Update Dashboard Visual Balance Cards]
```

#### Workflow Steps:
1. **Account Setup**: User specifies account name, type (`bank`, `cash`, `credit_card`, `wallet`, `investment`), currency (`INR`), and opening balance.
2. **Idempotency Guard**: Client generates a `clientRequestId` and sends `POST /accounts`. PostgreSQL enforces `@@unique([userId, clientRequestId])`.
3. **Double-Entry Balance Formula**:
   $$\text{Current Balance} = \text{Opening Balance} + \sum(\text{Income}) - \sum(\text{Expenses}) + \sum(\text{Transfers In}) - \sum(\text{Transfers Out})$$
4. **Minor-Unit Integrity**: Stored and calculated as `BigInt` Paise to prevent floating-point inaccuracies.
5. **Real-Time Client Balance Sync**: Local Dexie database updates reactively to refresh total liquid cash and liabilities across all dashboard screens.

---

### Feature 3: Transaction Lifecycle & Double-Entry Ledger Engine

```mermaid
sequenceDiagram
    autonumber
    participant UI as Transaction Form
    participant API as Transaction Controller
    participant DB as PostgreSQL Interactive Tx
    participant Local as Dexie IndexedDB

    UI->>UI: Validate amount (Strict toPaise parsing)
    UI->>API: POST /transactions (amount, type, accountId, clientRequestId)
    API->>DB: prisma.$transaction(SERIALIZABLE)
    DB->>DB: 1. Verify Account ownership (account.userId === req.userId)
    DB->>DB: 2. Insert Transaction Record
    DB->>DB: 3. Adjust Account balance atomically
    DB->>DB: 4. Record ApiIdempotencyKey
    DB-->>API: Transaction Committed
    API-->>UI: 201 Created (Transaction Data)
    UI->>Local: Upsert transaction & update local account balance
```

#### Workflow Steps:
1. **Input & Validation**: User specifies Amount, Category, Type (`income`, `expense`, `transfer`), Date, Account, and optional notes/receipt image.
2. **Lossless Conversion**: `financialMath.ts` parses the numeric input string into integer Paise.
3. **Atomic Transaction Boundary**:
   - Backend opens `prisma.$transaction`.
   - Verifies account ownership: `account.userId === req.userId`.
   - In transfer transactions, verifies destination account ownership and updates both source and target balances simultaneously.
4. **Idempotency Guard**: Repeated submissions with the same `clientRequestId` return the existing transaction record without duplicate debit or credit.
5. **Analytics Trigger**: Updates monthly spending summaries, category pie charts, and budget threshold calculations.

---

### Feature 4: Recurring Transactions & Automated SIP Engine

```mermaid
flowchart TD
    A[User Defines SIP / Recurring Rule: Frequency, NextDueDate, Amount] --> B[Save Rule with @@unique([userId, clientRequestId])]
    B --> C[PostgreSQL RecurringTransaction Table]
    
    subgraph Background Worker Execution (Cron)
        D[Worker Wakes Up every Minute] --> E[Find Pending Rules: nextDueDate <= NOW() & status = 'active']
        E --> F[Atomic DB Lock: RecurringExecution @@unique([ruleId, scheduledDate])]
        F -- Lock Acquired --> G[Create Real Transaction in Ledger]
        G --> H[Update Account Balance Atomically]
        H --> I[Advance nextDueDate: daily/weekly/monthly/yearly]
        F -- Already Claimed --> J[Skip (Zero Duplicate Execution)]
    end
```

#### Workflow Steps:
1. **Rule Setup**: User defines recurring schedule (Interval: `daily`, `weekly`, `monthly`, `quarterly`, `yearly`, Next Due Date, Amount, Category, and Account).
2. **Rule Invariant**: Saved with `@@unique([userId, clientRequestId])`.
3. **Background Worker Execution**:
   - Worker queries active rules where `nextDueDate <= NOW()`.
   - Attempts insert into `RecurringExecution` with constraint `@@unique([ruleId, scheduledDate])`.
   - The winning worker process executes the ledger transaction, updates the account balance, advances `nextDueDate`, and enqueues a completion notification.
   - Concurrent worker threads encountering duplicate keys skip gracefully with zero duplicate postings.

---

### Feature 5: Budgets & Proactive Threshold Alert System

```mermaid
sequenceDiagram
    autonumber
    participant Tx as Transaction Service
    participant Budget as Budget Engine
    participant Alert as Notification Dispatcher
    participant User as User Device

    Tx->>Budget: Transaction Created (Category: "Dining", Amount: ₹1,500)
    Budget->>Budget: Calculate Total Monthly Category Spend: ₹8,500 / ₹10,000 (85%)
    Budget->>Budget: Check Threshold Alert Rules (80%, 90%, 100%)
    alt Spend >= 80% Threshold
        Budget->>Alert: Enqueue Budget Alert in Notification Outbox
        Alert->>User: Push Notification ("Warning: You have spent 85% of Dining Budget!")
    end
```

#### Workflow Steps:
1. **Budget Creation**: User sets monthly/weekly spending limits per category.
2. **Real-time Aggregation**: On every recorded transaction, total period spending for the category is recalculated.
3. **Threshold Engine**:
   $$\text{Spend Percentage} = \left(\frac{\text{Current Period Spend}}{\text{Budget Limit}}\right) \times 100$$
4. **Alert Dispatch**: Crossing 80%, 90%, or 100% threshold creates an outbox notification delivered via Push (FCM/APNs) and in-app alert banner.
5. **Dashboard Visuals**: Renders color-coded progress bars (Green < 70%, Yellow 70–90%, Red > 90%).

---

### Feature 6: Loans, Debts & EMI Amortization Tracking

```mermaid
flowchart TD
    A[User Records Loan: Lent / Borrowed, Principal, Interest Rate, Tenor] --> B[Generate EMI Schedule]
    B --> C[Store in Loan & LoanPayment Tables]
    C --> D[User Records EMI / Partial Payment]
    D --> E[Interactive DB Tx: Deduct Principal + Interest from Loan Balance]
    E --> F[Create Linked Transaction in Selected Bank Account]
    F --> G[Update Loan Status: active -> paid_off when balance <= 0]
```

#### Workflow Steps:
1. **Loan Creation**: Logs loans (`lent` to an individual or `borrowed` from a financial institution) with Principal, Interest Rate, Tenor, and Start Date.
2. **Amortization Engine**:
   $$\text{EMI} = \frac{P \times r \times (1 + r)^n}{(1 + r)^n - 1}$$
3. **Repayment Logging**: User logs monthly EMI or partial repayment; interactive transaction deducts from outstanding loan balance and records a ledger transaction in the linked bank account.
4. **Automatic Closure**: Transition to `paid_off` occurs automatically when the balance reaches zero.

---

### Feature 7: Savings Goals & Milestone Progress Engine

```mermaid
sequenceDiagram
    autonumber
    participant User as User / Auto-Allocate
    participant Goal as Goal Engine
    participant DB as PostgreSQL Database
    participant UI as Dashboard Progress

    User->>Goal: Contribute to Goal (e.g. "Emergency Fund", Amount: ₹10,000)
    Goal->>DB: prisma.$transaction
    DB->>DB: 1. Insert GoalContribution
    DB->>DB: 2. Update Goal.currentAmount
    DB->>DB: 3. Deduct linked Bank Account Balance
    DB-->>Goal: Commit Success
    Goal->>UI: Update Goal Completion Percentage & Projected Date
```

#### Workflow Steps:
1. **Goal Configuration**: User creates a target milestone with Target Amount, Target Date, and Category.
2. **Contributions**: Manual deposits or automated allocations record linked transactions in bank accounts and update `Goal.currentAmount`.
3. **Metrics Calculation**: Computes percentage completed and required monthly savings to meet the target on schedule.
4. **Visual Milestones**: Renders interactive progress rings and celebratory milestone badges.

---

### Feature 8: Investment Portfolio & Real-Time Net Worth Valuation

```mermaid
flowchart TD
    A[User Portfolio: Stocks, Mutual Funds, Fixed Deposits, Gold, Crypto] --> B[Store Purchase Price, Units, Purchase Date]
    B --> C[Compute Valuation: Units × Current Market Price]
    C --> D[Compute Net Asset Value NAV & Unrealized P/L]
    D --> E[Real-Time Net Worth Engine: Liquid Assets + Investments - Liabilities]
    E --> F[Dashboard Net Worth Trend Chart]
```

#### Workflow Steps:
1. **Portfolio Tracking**: Logs holdings across Stocks, Mutual Funds, Fixed Deposits, Gold, and Crypto.
2. **Live Valuation**: Multiplies held units by live/cached market rates to determine current asset value.
3. **P&L Metrics**:
   $$\text{Unrealized P/L} = \text{Current Value} - \text{Total Invested}$$
4. **Net Worth Synthesis**: Aggregates all bank balances, investments, gold holdings, and lent loans minus borrowed debts.

---

### Feature 9: Gold Asset Tracking (Physical, Digital & SGBs)

```mermaid
sequenceDiagram
    autonumber
    participant User as User
    participant Gold as Gold Tracker Module
    participant DB as Database Storage
    participant UI as Portfolio Dashboard

    User->>Gold: Add Gold Holding (Type: "24K Physical", Grams: 25.5g, Buy Rate: ₹6,800/g)
    Gold->>DB: Upsert GoldAsset Record (grams, purity, buyPrice)
    Gold->>Gold: Calculate Current Holding Value = Grams × Live Market Rate
    Gold-->>UI: Display Total Grams, Total Value & Gain/Loss Summary
```

#### Workflow Steps:
1. **Asset Entry**: Tracks 24K/22K Physical Gold (jewelry, coins, bars), Digital Gold, and Sovereign Gold Bonds (SGB).
2. **Valuation Engine**: Automatically converts total gram holdings to live INR portfolio valuation and incorporates it into the user's Net Worth calculation.

---

### Feature 10: Group Expense Splitting & Debt Simplification

```mermaid
flowchart TD
    A[Group Creation: 'Goa Trip 2026' with 4 Members] --> B[User Adds Expense: 'Dinner' ₹4,000 paid by Member A]
    B --> C[Split Type: Equal, Unequal Amounts, or Percentages]
    C --> D[Generate Pairwise Debt Graph: B owes A ₹1000, C owes A ₹1000, D owes A ₹1000]
    D --> E[Debt Simplification Algorithm: Minimize Transaction Count]
    E --> F[Group Settlement: Record Direct P2P Payment & Close Debt]
```

#### Workflow Steps:
1. **Group Setup**: Users create a shared group and add members.
2. **Expense Splitting**: An expense is recorded with Equal, Unequal, or Percentage splits.
3. **Debt Simplification Algorithm**:
   - Calculates net balances: $\text{Net Balance}_i = \text{Paid}_i - \text{Owed}_i$.
   - Bipartite graph reduction matches highest debtors with highest creditors, minimizing total settlement transfers.
4. **Settlement**: Members log settlements to clear balances.

---

### Feature 11: Smart OCR Receipt & Bill Scanner

```mermaid
sequenceDiagram
    autonumber
    participant Cam as Camera / Photo Picker
    participant OCR as Tesseract OCR / Vision Worker
    participant Parser as Heuristic Regex Engine
    participant Form as Transaction Auto-fill Form

    Cam->>OCR: Capture Receipt Image (JPEG/PNG)
    OCR->>OCR: Grayscale, contrast normalization & text extraction
    OCR->>Parser: Raw OCR Text String
    Parser->>Parser: Extract Total (e.g. "TOTAL: ₹1,245.50")
    Parser->>Parser: Extract Date (e.g. "14/08/2026")
    Parser->>Parser: Extract Merchant (e.g. "Starbucks Coffee")
    Parser->>Parser: Extract Tax / GST (e.g. "CGST 2.5%, SGST 2.5%")
    Parser-->>Form: Pre-populate Transaction Form
    Form->>Form: User confirms & saves transaction
```

#### Workflow Steps:
1. **Image Capture**: User photographs a physical bill or uploads an invoice.
2. **Pre-processing & OCR**: Image is normalized and parsed by Tesseract.js worker.
3. **Heuristic Extraction**: Parses total amount, transaction date, merchant name, and tax breakdown.
4. **Form Auto-fill**: Pre-populates the transaction modal for instant user confirmation.

---

### Feature 12: Voice-Assisted Speech-to-Transaction Entry

```mermaid
flowchart TD
    A[User Taps Voice Button & Speaks: 'Spent 450 rupees on lunch at McDonald's yesterday'] --> B[Web Speech API / Capacitor Speech Recognizer]
    B --> C[Natural Language Transcript Text]
    C --> D[NLP Intent & Entity Extraction Engine]
    D --> E[Extracted: Amount=450, Category='Food & Dining', Type='expense', Date=Yesterday, Merchant='McDonalds']
    E --> F[Voice Review Modal with Audio Waveform Feedback]
    F --> G[User Taps 'Confirm' -> Creates Transaction with clientRequestId]
```

#### Workflow Steps:
1. **Audio Input**: User speaks a transaction phrase into the microphone.
2. **NLP Entity Parser**: Extracts Amount, Category, Type, Merchant, and relative Date ("today", "yesterday").
3. **Review & Confirm**: Displays extracted fields in a confirmation dialog before committing to the database.

---

### Feature 13: Financial Advisor Marketplace & Session Bookings

```mermaid
sequenceDiagram
    autonumber
    participant Client as User / Client
    participant Advisor as Financial Advisor
    participant Marketplace as Advisor Controller
    participant Payment as Payment Gateway
    participant Session as Virtual Meeting Room

    Client->>Marketplace: Browse Verified Advisors (Filter by Expertise, Rating, Fee)
    Client->>Marketplace: Select Slot from Advisor Availability Calendar
    Client->>Payment: Initiate Payment for Session
    Payment-->>Marketplace: Webhook Confirmed (Payment Completed)
    Marketplace->>Marketplace: Create AdvisorSession & Generate Meeting Link
    Marketplace-->>Client: Booking Confirmed (Push Notification + Calendar Sync)
    Marketplace-->>Advisor: New Session Alert
    Note over Client,Advisor: At Scheduled Time: Join In-App Video/Chat Session
```

#### Workflow Steps:
1. **Advisor Verification**: Advisors submit credentials and hourly consultation rates for admin approval.
2. **Slot Selection**: Clients browse verified advisors and select available calendar slots.
3. **Secure Checkout**: Payment gateway locks the slot and generates an encrypted virtual meeting session on payment confirmation.

---

### Feature 14: Payment Processing, Webhook Invariants & Refund State Machine

```mermaid
flowchart TD
    A[Payment Initiation: Amount, Currency, Purpose, ClientRequestId] --> B[Create Payment with status='pending' & unique transactionId]
    B --> C[Payment Provider Gateway Razorpay / Stripe]
    C --> D[Provider Webhook / Callback Arrives]
    D --> E{Backend Verification & Atomic Transaction}
    E -- Success Webhook --> F[Transition: pending -> completed]
    F --> G[Credit Advisor / Record System Ledger]
    E -- Refund Request --> H[Check: Current status == 'completed']
    H -- Valid --> I[Interactive Tx: Transition completed -> refunded]
    I --> J[Return Refund Confirmation (100-Concurrent Safe)]
    H -- Invalid Replay --> K[409 Conflict / Idempotent Reject]
```

#### Workflow Steps:
1. **Initiation**: Creates `Payment` with status `pending` and `@unique transactionId`.
2. **Webhook Verification**: Validates provider signature and executes state transition (`pending` $\rightarrow$ `completed`) in an interactive transaction.
3. **Refund State Machine**: Transitions `completed` $\rightarrow$ `refunded`. Illegal transitions are rejected.
4. **Concurrency Safety**: 100 concurrent refund requests result in **exactly 1 refund execution**.

---

### Feature 15: Multi-Channel Notification & Outbox Dispatcher

```mermaid
sequenceDiagram
    autonumber
    participant Service as Business Service (e.g. Budget Alert, SIP)
    participant Outbox as Notification Outbox Table
    participant Worker as Background Outbox Dispatcher
    participant Channel as FCM Push / Email / In-App

    Service->>Outbox: Insert Notification (status='pending', deliveryStatus='pending')
    loop Every 5 Seconds
        Worker->>Outbox: Atomic Claim: updateMany(status='processing') where status in ['pending', 'retrying']
        alt Claim Succeeded (count == 1)
            Worker->>Channel: Send Push Notification (FCM / APNs)
            Worker->>Outbox: Update deliveryStatus='sent', status='delivered'
        else Race Lost (count == 0)
            Worker->>Worker: Skip (Another worker claimed this message)
        end
    end
```

#### Workflow Steps:
1. **Event Trigger**: Business events write notification records with `status: 'pending'`.
2. **Atomic Worker Claim**: Conditional `prisma.notification.updateMany` transitions status to `processing`, preventing multi-worker duplicate delivery races.
3. **Dispatch**: Delivers push notifications to FCM/APNs device tokens and updates in-app notification state.

---

### Feature 16: Offline-First Synchronization & Deterministic Reconciliation Engine

```mermaid
flowchart TD
    A[Mobile Client Creates Transaction while Offline] --> B[Store in Dexie IndexedDB with clientRequestId='req-uuid-1']
    B --> C[Enqueue in db.syncQueue with status='pending']
    C --> D[Device Reconnects to Internet: window.online event]
    D --> E[BackendSyncService.syncWithBackend()]
    E --> F[POST /sync/pull: Retrieve Server State since lastSyncTime]
    F --> G[Deterministic Reconciliation: Match by cloudId or clientRequestId]
    G --> H[Update Local Records by Stable Key - NO DUPLICATION on repeated pull]
    H --> I[Push Pending syncQueue items with Idempotency-Key]
    I --> J[Mark syncQueue item as 'synced' & clear queue]
```

#### Workflow Steps:
1. **Local-First Writes**: Mutations write immediately to IndexedDB and enqueue in `db.syncQueue` with a stable `clientRequestId`.
2. **Network Reconnection**: Pulls cloud modifications since `lastSyncTime` and reconciles records strictly by `cloudId` or `clientRequestId`.
3. **Idempotent Push**: Pushes pending queue items with `Idempotency-Key`.
4. **Zero Duplication**: Pull-to-refresh (1x, 2x, 5x) updates by stable ID without appending duplicate records.

---

### Feature 17: Platform Security, Governance & Distributed Rate Limiting

```mermaid
flowchart TD
    A[Incoming HTTP Request] --> B[Distributed Sliding-Window Rate Limiter]
    B -- Exceeded 100 req/min --> C[Return 429 Too Many Requests]
    B -- Within Limit --> D[JWT Authentication Middleware]
    D -- Invalid / Expired --> E[Return 401 Unauthorized]
    D -- Valid --> F[Multi-Tier Idempotency Gate L0/L1/L2]
    F -- Idempotent Replay Found --> G[Return Cached Response with Idempotent-Replay: true]
    F -- New Mutation --> H[Route Controller + Cross-User Authorization Check]
    H -- Authorized --> I[Execute DB Transaction & Return 200/201]
    H -- Unauthorized --> J[Return 403 Forbidden / 404]
```

#### Workflow Steps:
1. **Rate Limiting**: Sliding-window rate limiter throttles traffic using Redis with local memory fallback.
2. **Multi-Tier Idempotency (L0/L1/L2)**: Protects against network replays and concurrent submissions across in-memory mutex, Redis cache, and PostgreSQL table.
3. **Cross-User Authorization**: Strict controller-level checks (`resource.userId === req.userId`) protect all user resources.
4. **Zero-Secrets Policy**: Scanned across 8,537 files ensuring zero credentials or private keys in client bundles.
