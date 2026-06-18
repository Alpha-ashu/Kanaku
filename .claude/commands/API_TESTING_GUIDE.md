# KANAKU API — Swagger Testing Guide

**Swagger UI:** `GET /api-docs`  
**OpenAPI JSON:** `GET /api-docs/openapi.json`  
**Testing Guide (this):** `GET /api-docs/testing-guide`

---

## Quick Start

### 1. Start the Backend

```bash
cd backend
npm run dev
# Server: http://localhost:3000
# Swagger: http://localhost:3000/api-docs
```

### 2. Get an Authentication Token

**Option A — Register a new user:**
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "name": "Test User",
  "email": "test@example.com",
  "password": "SecurePass123!"
}
```
Response headers contain: `Authorization: Bearer <token>` and `X-Refresh-Token: <refresh-token>`

**Option B — Login:**
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "SecurePass123!"
}
```

### 3. Use the Token in Swagger UI

1. Click **Authorize** (🔓) in Swagger UI
2. Enter: `Bearer <your-token>`
3. Click **Authorize**
4. All subsequent requests will include the JWT

---

## API Endpoints Reference

### Authentication (`/api/v1/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | ❌ | Register new account |
| POST | `/auth/login` | ❌ | Login |
| POST | `/auth/login/challenge` | ❌ | Challenge-response login |
| GET | `/auth/profile` | ✅ | Get profile |
| PUT | `/auth/profile` | ✅ | Update profile |
| POST | `/auth/otp/send` | ✅ | Send OTP |
| POST | `/auth/otp/verify` | ✅ | Verify OTP |
| GET | `/auth/devices` | ✅ | List devices |
| DELETE | `/auth/devices/:id` | ✅ | Revoke device |
| DELETE | `/auth/account` | ✅ | Delete account |

### Accounts (`/api/v1/accounts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounts` | List all accounts |
| POST | `/accounts` | Create account |
| GET | `/accounts/:id` | Get account by ID |
| PUT | `/accounts/:id` | Update account |
| DELETE | `/accounts/:id` | Delete account (soft) |

**Create Account Body:**
```json
{
  "name": "HDFC Savings",
  "type": "bank",
  "balance": 50000,
  "currency": "INR",
  "provider": "HDFC Bank"
}
```

### Transactions (`/api/v1/transactions`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/transactions` | List transactions (filterable) |
| POST | `/transactions` | Create transaction |
| GET | `/transactions/:id` | Get transaction |
| PUT | `/transactions/:id` | Update transaction |
| DELETE | `/transactions/:id` | Delete transaction |
| GET | `/transactions/account/:accountId` | Get by account |

**Query Parameters for GET /transactions:**
- `accountId` — Filter by account UUID
- `startDate` — Filter from date (YYYY-MM-DD or ISO 8601)
- `endDate` — Filter to date (YYYY-MM-DD or ISO 8601)
- `category` — Filter by category name
- `page` — Page number (default: 1)
- `limit` — Results per page (max: 200)

**Create Transaction Body:**
```json
{
  "accountId": "uuid-here",
  "type": "expense",
  "amount": 450.00,
  "category": "Food & Dining",
  "description": "Lunch at restaurant",
  "date": "2026-06-09",
  "tags": ["work", "reimbursable"]
}
```

**Create Transfer Body:**
```json
{
  "accountId": "source-account-uuid",
  "type": "transfer",
  "amount": 10000.00,
  "category": "Transfer",
  "transferToAccountId": "target-account-uuid",
  "date": "2026-06-09"
}
```

### Goals (`/api/v1/goals`)

**Create Goal Body:**
```json
{
  "name": "Emergency Fund",
  "targetAmount": 100000,
  "targetDate": "2027-01-01",
  "category": "savings"
}
```

### Loans (`/api/v1/loans`)

**Create Loan Body:**
```json
{
  "type": "borrowed",
  "name": "Home Loan EMI",
  "principalAmount": 500000,
  "interestRate": 8.5,
  "emiAmount": 4800,
  "dueDate": "2026-07-05",
  "frequency": "monthly"
}
```

**Add Payment:**
```http
POST /api/v1/loans/:id/payment
{
  "amount": 4800,
  "accountId": "bank-account-uuid",
  "notes": "June EMI payment"
}
```

### Dashboard (`/api/v1/dashboard`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/summary` | Net worth, totals, top categories |
| GET | `/dashboard/cashflow` | Monthly income/expense breakdown |

### Sync (`/api/v1/sync`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sync/push` | Push local changes to cloud |
| POST | `/sync/pull` | Pull delta changes since last sync |
| GET | `/sync/devices` | List registered sync devices |

**Sync Pull Body:**
```json
{
  "deviceId": "device_abc123",
  "lastSyncedAt": "2026-06-09T10:00:00.000Z",
  "entityTypes": ["accounts", "transactions", "goals"]
}
```

### AI & Voice (`/api/v1/ai`, `/api/v1/voice`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai/insights` | Get AI financial insights |
| POST | `/voice/command` | Process voice command |
| GET | `/categorize` | Get categorization model |
| POST | `/categorize/learn` | Train from correction |

### Admin (`/api/v1/admin`) — Requires `admin` role

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List all users |
| GET | `/admin/stats` | System statistics |
| GET | `/admin/feature-flags` | Get feature flags |
| PUT | `/admin/feature-flags` | Update feature flags |
| GET | `/admin/pending-advisors` | List unverified advisors |
| PUT | `/admin/advisors/:id/approve` | Approve advisor |
| PUT | `/admin/advisors/:id/reject` | Reject advisor |

---

## Error Response Reference

All errors follow this schema:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": [
    { "path": "fieldName", "message": "Validation error", "code": "too_small" }
  ]
}
```

### Common Error Codes

| HTTP Status | Code | Description |
|------------|------|-------------|
| 400 | `MISSING_FIELDS` | Required fields missing |
| 400 | `INVALID_EMAIL` | Email format invalid |
| 400 | `PASSWORD_TOO_SHORT` | Password under 8 chars |
| 400 | `INVALID_AMOUNT` | Amount not positive |
| 400 | `INVALID_TRANSFER` | Same source/target account |
| 400 | `INVALID_PIN` | Weak PIN detected |
| 401 | — | Invalid/expired token |
| 403 | `ACCOUNT_SUSPENDED` | Account suspended |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `DUPLICATE_ACCOUNT` | Name+type already exists |
| 409 | `DUPLICATE_GOAL_NAME` | Goal name already exists |
| 413 | — | Request body too large (>1MB) |
| 429 | — | Rate limit exceeded |
| 500 | — | Internal server error |

---

## Health Check

```http
GET /health
```
Response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-09T12:00:00.000Z",
  "services": {
    "redis": "connected",
    "database": { "status": "connected", "error": null },
    "circuitBreakers": {}
  }
}
```

---

## Test Scenarios

### Scenario 1: Complete User Journey
1. `POST /auth/register` → Get token
2. `POST /accounts` → Create bank account
3. `POST /accounts` → Create wallet account
4. `POST /transactions` (income) → Add salary
5. `POST /transactions` (expense) → Add grocery expense
6. `POST /transactions` (transfer) → Move money between accounts
7. `GET /dashboard/summary` → View net worth
8. `POST /goals` → Create savings goal
9. `GET /goals` → View all goals
10. `GET /transactions?category=groceries` → Filter transactions

### Scenario 2: Loan + EMI Payment
1. `POST /loans` → Create personal loan
2. `GET /loans` → View outstanding balance
3. `POST /loans/:id/payment` → Record EMI payment
4. `GET /loans/:id` → Verify balance reduced

### Scenario 3: Group Expense Splitting
1. `POST /friends` → Add a friend
2. `POST /groups` → Create a trip group
3. `POST /transactions` → Create group expense
4. `GET /groups/:id` → View splits

---

*Guide last updated: June 9, 2026*

