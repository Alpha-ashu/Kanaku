# Account Aggregator (AA) & OTP Integration — Architecture Document

## 1. System Overview

The KANAKU app integrates with India's Account Aggregator (AA) framework regulated by RBI to enable secure, consent-based financial data sharing. The integration uses Setu AA APIs and follows strict compliance requirements.

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React + Capacitor)                 │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ OTP UI   │  │ Consent Flow │  │ Financial Data Dashboard │   │
│  └──────────┘  └──────────────┘  └─────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS + JWT
┌───────────────────────────▼───���─────────────────────────────────┐
│                   BACKEND (Express + Prisma)                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐      │
│  │ OTP      │  │ AA Service   │  │ Data Processing      │      │
│  │ Service  │  │ (Setu APIs)  │  │ Layer                │      │
│  └──────────┘  └──────────────┘  └──────────────────────┘      │
│           │              │                    │                   │
│  ┌────────▼──────────────▼────────────────────▼─────────────┐   │
│  │                  PostgreSQL (Prisma ORM)                   │   │
│  │  otp_requests | aa_consent | aa_data_session | aa_*       │   │
│  └───────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Signed HTTPS Requests
┌───────────────────────────▼─────────────────────────────────────┐
│                     SETU AA PLATFORM                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐     │
│  │ Consent API  │  │ Data Session API│  │ FI Fetch API   │     │
│  └──────────────┘  └─────────────────┘  └────────────────┘     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    AA CONSENT MANAGER (Anumati)                   │
│              User approves / rejects consent here                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    FIP (Banks / Financial Institutions)           │
│              Provides encrypted financial data via AA             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Module: OTP Verification

### 2.1 Flow

```
User → Frontend → POST /api/v1/otp/send
                      │
                      ▼
              Backend generates 6-digit OTP
              Hashes with SHA-256
              Stores in otp_requests table
              Delivers via email/SMS
                      │
                      ▼
User enters OTP → POST /api/v1/otp/verify
                      │
                      ▼
              Backend checks:
                ✓ OTP not expired (90s)
                ✓ Attempts < max (5)
                ✓ Constant-time hash comparison
                      │
                      ▼
              Returns verificationToken
              (Used to gate sensitive operations)
```

### 2.2 Security Controls

| Control | Implementation |
|---------|---------------|
| OTP Length | 6 digits (cryptographically random) |
| Expiry | 90 seconds |
| Max Attempts | 5 per OTP |
| Cooldown | 60 seconds between sends |
| Storage | SHA-256 hash only (never plaintext) |
| Comparison | `crypto.timingSafeEqual()` (prevents timing attacks) |
| Rate Limit | 5 requests/minute per IP |
| Block | After 10 failed attempts in 1 hour |

### 2.3 Database Schema

```sql
CREATE TABLE otp_requests (
    id TEXT PRIMARY KEY,
    userId TEXT,
    destination TEXT NOT NULL,      -- phone or email
    channel TEXT NOT NULL,           -- 'sms' | 'email'
    purpose TEXT NOT NULL,           -- signup | login | reset_password | aa_consent
    otpHash TEXT NOT NULL,           -- SHA-256
    expiryTime TIMESTAMP NOT NULL,
    attempts INT DEFAULT 0,
    maxAttempts INT DEFAULT 5,
    status TEXT DEFAULT 'ACTIVE',   -- ACTIVE | VERIFIED | EXPIRED | BLOCKED
    ipAddress TEXT,
    userAgent TEXT,
    createdAt TIMESTAMP DEFAULT NOW(),
    verifiedAt TIMESTAMP
);
```

### 2.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/otp/send` | Send OTP to destination |
| POST | `/api/v1/otp/verify` | Verify OTP code |

---

## 3. Module: Account Aggregator (AA)

### 3.1 End-to-End Flow

```
Step 1: OTP Verification
    User verifies identity via POST /api/v1/otp/send + /verify
    Purpose: 'aa_consent'

Step 2: Create Consent
    POST /api/v1/aa/consent
    → Backend calls Setu /Consent API
    → Receives consentHandle
    → Returns redirectUrl for user approval

Step 3: User Approves Consent
    User is redirected to: https://anumati.setu.co/{consentHandle}
    User selects accounts → verifies OTP → approves

Step 4: Check Consent Status
    GET /api/v1/aa/consent/status/{consentHandle}
    → Backend calls Setu /Consent/handle/{id}
    → Returns status: READY → ACTIVE

Step 5: Create Data Session
    POST /api/v1/aa/data/session
    → Backend calls Setu /FI/request
    → Returns sessionId

Step 6: Fetch Financial Data
    GET /api/v1/aa/data/fetch/{sessionId}
    → Backend calls Setu /FI/fetch/{sessionId}
    → Processes & stores in aa_financial_data + aa_transactions
    → Returns structured financial data to frontend
```

### 3.2 Consent Lifecycle

```
CREATED → PENDING → READY → ACTIVE → (REVOKED | EXPIRED)
   │         │        │        │
   │         │        │        └── User can revoke at any time
   │         │        └── Consent artifact available
   │         └── User redirected to approve
   └── Consent request submitted to AA
```

### 3.3 Database Schema

```
aa_consent              - Tracks consent lifecycle
aa_consent_artifact     - Stores signed consent objects
aa_data_session         - Maps consent → data fetch sessions
aa_financial_data       - Raw encrypted financial data
aa_transactions         - Processed, queryable transactions
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/aa/consent` | Create consent request (requires OTP) |
| GET | `/api/v1/aa/consent/status/:handle` | Check consent status |
| GET | `/api/v1/aa/consent/artifact/:id` | Fetch consent artifact |
| POST | `/api/v1/aa/data/session` | Create data fetch session |
| GET | `/api/v1/aa/data/fetch/:sessionId` | Fetch financial data |
| GET | `/api/v1/aa/consents` | List user's consents |
| POST | `/api/v1/aa/consent/revoke/:id` | Revoke active consent |
| GET | `/api/v1/aa/financial-summary` | Get aggregated financial summary |
| POST | `/api/v1/aa/notification` | Webhook for AA notifications |

---

## 4. RBI Compliance Matrix

| Requirement | Implementation |
|-------------|---------------|
| Explicit consent required | OTP verification + Anumati redirect |
| Data used only for declared purpose | Purpose stored in consent; enforced on fetch |
| No data without consent | `status=ACTIVE` check before data session |
| Secure API communication | HTTPS + client_id + client_secret headers |
| Data minimization | Only requested fiTypes stored |
| User can revoke consent | POST /aa/consent/revoke/:id |
| Consent expiry enforced | consentExpiry field + status checks |
| Audit trail | All operations logged with timestamps |

---

## 5. Environment Variables

```env
# Account Aggregator (Setu)
AA_BASE_URL=https://aa-sandbox.setu.co
AA_CLIENT_ID=your_client_id
AA_CLIENT_SECRET=your_client_secret
AA_REDIRECT_URL=https://app.KANAKU.in/aa/callback
AA_FIU_ID=KANAKU_app
AA_NOTIFICATION_URL=https://api.KANAKU.in/api/v1/aa/notification
```

---

## 6. Sequence Diagrams

### 6.1 Complete OTP + AA Flow

```
User        Frontend        Backend         Setu AA        Anumati        Bank
 │              │               │               │              │            │
 │──Request OTP─►               │               │              │            │
 │              │──POST /otp/send──►            │              │            │
 │              │◄──OTP Sent────│               │              │            │
 │              │               │               │              │            │
 │──Enter OTP──►│               │               │              │            │
 │              │──POST /otp/verify──►          │              │            │
 │              │◄──Verified + Token──│          │              │            │
 │              │               │               │              │            │
 │──Link Account►               │               │              │            │
 │              │──POST /aa/consent──►          │              │            │
 │              │               │──POST /Consent──►            │            │
 │              │               │◄──consentHandle──│            │            │
 │              │◄──redirectUrl──│               │              │            │
 │              │               │               │              │            │
 │──Redirect────────────────────────────────────►              │            │
 │              │               │               │──Select Accts─►           │
 │              │               │               │◄──Approved────│            │
 │◄─────────────────────────────────────────────│              │            │
 │              │               │               │              │            │
 │──Check Status►               │               │              │            │
 │              │──GET /consent/status──►        │              │            │
 │              │               │──GET /Consent/handle──►      │            │
 │              │               │◄──status=ACTIVE──│            │            │
 │              │◄──ACTIVE──────│               │              │            │
 │              │               │               │              │            │
 │──Fetch Data──►               │               │              │            │
 │              │──POST /data/session──►        │              │            │
 │              │               │──POST /FI/request──►         │            │
 │              │               │◄──sessionId──────│            │            │
 │              │──GET /data/fetch──►           │              │            │
 │              │               │──GET /FI/fetch──►            │            │
 │              │               │               │──Request──────────────────►│
 │              │               │               │◄──Encrypted Data───────────│
 │              │               │◄──Financial Data──│            │            │
 │              │◄──Processed Data──│            │              │            │
 │◄──Dashboard──│               │               │              │            │
```

---

## 7. Error Handling

| Error | HTTP | Response |
|-------|------|----------|
| OTP not found | 400 | `{ success: false, message: "No active OTP found." }` |
| OTP expired | 400 | `{ success: false, message: "OTP has expired." }` |
| Max attempts | 400 | `{ success: false, message: "Maximum attempts exceeded." }` |
| Rate limited | 429 | `{ success: false, retryAfter: 60 }` |
| OTP required for AA | 403 | `{ code: "OTP_REQUIRED" }` |
| Consent not found | 404 | `{ success: false, message: "Consent not found." }` |
| Consent not active | 400 | `{ success: false, message: "No active consent." }` |
| AA API failure | 500 | `{ success: false, message: "Failed to create consent." }` |

---

## 8. Testing Checklist

### OTP Tests
- [x] Valid OTP generation (6 digits, cryptographic)
- [x] SHA-256 hash storage (no plaintext)
- [x] 90-second expiry enforcement
- [x] Max 5 attempts enforcement
- [x] 60-second cooldown between sends
- [x] Constant-time hash comparison
- [x] Block after 10 failures in 1 hour
- [x] Single active OTP per destination+purpose

### AA Tests
- [x] Consent creation requires OTP verification
- [x] Consent handle stored correctly
- [x] Redirect URL generated correctly
- [x] Consent status polling works
- [x] Data session requires ACTIVE consent
- [x] Financial data processed and stored
- [x] User cannot access another user's consent
- [x] Consent revocation works
- [x] Webhook notification handling
- [x] Rate limiting on AA endpoints

