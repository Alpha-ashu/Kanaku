# KANAKU API Reference

**Base URL:** `https://kanaku.fly.dev/api/v1`  
**Authentication:** `Authorization: Bearer <accessToken>` on all protected routes  
**Content-Type:** `application/json` unless noted

---

## Authentication & Identity

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Register a new user account |
| POST | `/auth/login/challenge` | Public | Step 1 of login — verify password, returns challenge code |
| POST | `/auth/login` | Public | Step 2 of login — exchange challenge code for JWT tokens |
| GET  | `/auth/profile` | ✓ | Get current authenticated user's profile |
| PUT  | `/auth/profile` | ✓ | Update current user's profile |
| POST | `/auth/otp/send` | ✓ | Send OTP to authenticated user |
| POST | `/auth/otp/verify` | ✓ | Verify OTP for authenticated user |
| GET  | `/auth/devices` | ✓ | List trusted devices for current user |
| DELETE | `/auth/devices/:deviceId` | ✓ | Revoke a trusted device |
| DELETE | `/auth/account` | ✓ | Delete account (rate limited, destructive) |

### Two-Phase Login Flow
```
POST /auth/login/challenge   { email, password }
→ { challengeCode }

POST /auth/login             { email, challengeCode }
→ { accessToken, refreshToken, user }
```

### Register Payload
```json
{
  "email": "user@example.com",
  "password": "Min8chars+Upper+Lower+Digit+Special"
}
```
Password must contain uppercase, lowercase, digit, and special character (`!@#$%^&*` etc.).

---

## Accounts (Bank / Wallet)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/accounts` | ✓ | List all user accounts |
| POST   | `/accounts` | ✓ | Create a new account |
| GET    | `/accounts/:id` | ✓ | Get single account |
| PUT    | `/accounts/:id` | ✓ | Update account |
| DELETE | `/accounts/:id` | ✓ | Delete account |

---

## Transactions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/transactions` | ✓ | List transactions (supports filters via query) |
| POST   | `/transactions` | ✓ | Create a transaction |
| GET    | `/transactions/:id` | ✓ | Get single transaction |
| PUT    | `/transactions/:id` | ✓ | Update transaction |
| DELETE | `/transactions/:id` | ✓ | Delete transaction |
| GET    | `/transactions/account/:accountId` | ✓ | Transactions for a specific account |

---

## Goals (Savings Goals)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/goals` | ✓ | List savings goals |
| POST   | `/goals` | ✓ | Create a goal |
| GET    | `/goals/:id` | ✓ | Get single goal |
| PUT    | `/goals/:id` | ✓ | Update goal |
| DELETE | `/goals/:id` | ✓ | Delete goal |

---

## Loans

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/loans` | ✓ | List loans |
| POST   | `/loans` | ✓ | Add a loan |
| GET    | `/loans/:id` | ✓ | Get single loan |
| PUT    | `/loans/:id` | ✓ | Update loan |
| DELETE | `/loans/:id` | ✓ | Delete loan |
| POST   | `/loans/:id/payment` | ✓ | Record a loan payment |

---

## Investments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/investments` | ✓ | List investments |
| POST   | `/investments` | ✓ | Add an investment |
| PUT    | `/investments/:id` | ✓ | Update investment |
| DELETE | `/investments/:id` | ✓ | Delete investment |

---

## Budgets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/budgets` | ✓ | List budgets |
| POST   | `/budgets` | ✓ | Create budget |
| GET    | `/budgets/:id` | ✓ | Get single budget |
| PUT    | `/budgets/:id` | ✓ | Update budget |
| DELETE | `/budgets/:id` | ✓ | Delete budget |
| POST   | `/budgets/:id/recalculate` | ✓ | Recalculate budget spent amount |

---

## Recurring Transactions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/recurring` | ✓ | List recurring transactions |
| POST   | `/recurring` | ✓ | Create recurring transaction |
| GET    | `/recurring/:id` | ✓ | Get single recurring transaction |
| PUT    | `/recurring/:id` | ✓ | Update recurring transaction |
| DELETE | `/recurring/:id` | ✓ | Delete recurring transaction |
| PATCH  | `/recurring/:id/toggle` | ✓ | Toggle active/inactive status |

---

## Tax Calculations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/tax` | ✓ | List tax calculations |
| POST   | `/tax` | ✓ | Create tax calculation |
| GET    | `/tax/:id` | ✓ | Get single calculation |
| PUT    | `/tax/:id` | ✓ | Update calculation |
| DELETE | `/tax/:id` | ✓ | Delete calculation |

---

## Gold Assets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/gold` | ✓ | List gold assets |
| POST   | `/gold` | ✓ | Add gold asset |
| GET    | `/gold/:id` | ✓ | Get single asset |
| PUT    | `/gold/:id` | ✓ | Update gold asset |
| DELETE | `/gold/:id` | ✓ | Delete gold asset |

---

## Dashboard

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/dashboard/summary` | ✓ | Aggregated financial summary |
| GET    | `/dashboard/cashflow` | ✓ | Cash flow data |

---

## Advisors

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/advisors` | ✓ | List all advisors |
| GET    | `/advisors/:id` | ✓ | Get advisor profile |
| POST   | `/advisors/apply` | ✓ | Apply to become an advisor |
| POST   | `/advisors/availability` | ✓ Advisor | Set availability slots |
| PUT    | `/advisors/availability/status` | ✓ Advisor | Toggle availability on/off |
| GET    | `/advisors/:id/availability` | ✓ | Get advisor's availability |
| DELETE | `/advisors/availability/:id` | ✓ Advisor | Delete availability slot |
| GET    | `/advisors/me/sessions` | ✓ Advisor | Get advisor's own sessions |
| PUT    | `/advisors/sessions/:id/rate` | ✓ | Rate a completed session |
| GET    | `/advisors/admin/applications` | ✓ Admin/Manager | List pending advisor applications |
| PUT    | `/advisors/admin/:id/approve` | ✓ Admin/Manager | Approve advisor application |
| PUT    | `/advisors/admin/:id/reject` | ✓ Admin/Manager | Reject advisor application |

---

## Bookings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/bookings` | ✓ | Create booking with advisor |
| GET    | `/bookings` | ✓ | List bookings (caller's view) |
| GET    | `/bookings/:id` | ✓ | Get single booking |
| PUT    | `/bookings/:id/accept` | ✓ Advisor | Accept booking |
| PUT    | `/bookings/:id/reject` | ✓ Advisor | Reject booking |
| PUT    | `/bookings/:id/reschedule` | ✓ Advisor | Reschedule booking |
| PUT    | `/bookings/:id/cancel` | ✓ | Cancel booking |
| GET    | `/bookings/workspace/clients` | ✓ Advisor | List all advisor clients |
| POST   | `/bookings/:bookingId/fee/pay` | ✓ Advisor | Mark session fee as paid |

---

## Sessions (Advisory Sessions)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/sessions/:id` | ✓ | Get session details |
| POST   | `/sessions/:id/messages` | ✓ | Send a message in session |
| GET    | `/sessions/:id/messages` | ✓ | Get session messages |
| POST   | `/sessions/:id/start` | ✓ | Start session |
| POST   | `/sessions/:id/complete` | ✓ | Complete session |
| POST   | `/sessions/:id/cancel` | ✓ | Cancel session |

---

## Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/notifications` | ✓ | List notifications |
| GET    | `/notifications/unread/count` | ✓ | Get unread count |
| GET    | `/notifications/:id` | ✓ | Get single notification |
| PUT    | `/notifications/:id/read` | ✓ | Mark as read |
| POST   | `/notifications/mark-all-read` | ✓ | Mark all as read |
| DELETE | `/notifications/:id` | ✓ | Delete notification |
| DELETE | `/notifications` | ✓ | Clear all notifications |
| POST   | `/notifications/send` | ✓ Admin | Send notification to users |

---

## Payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/payments/webhook` | Public | Payment gateway webhook |
| GET    | `/payments` | ✓ | List payment records |
| GET    | `/payments/:id` | ✓ | Get single payment |
| POST   | `/payments/initiate` | ✓ | Initiate a payment |
| POST   | `/payments/complete` | ✓ | Complete a payment |
| POST   | `/payments/fail` | ✓ | Mark payment as failed |
| POST   | `/payments/refund` | ✓ | Request a refund |

---

## Devices

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/devices` | ✓ | Register a device |
| GET    | `/devices` | ✓ | List registered devices |
| GET    | `/devices/:deviceId` | ✓ | Get device info |
| POST   | `/devices/:deviceId/sync` | ✓ | Update device sync state |
| PUT    | `/devices/:deviceId/tokens` | ✓ | Update push notification tokens |
| POST   | `/devices/:deviceId/deactivate` | ✓ | Deactivate device |
| DELETE | `/devices/:deviceId` | ✓ | Delete device |

---

## Sync

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/sync/pull` | ✓ | Pull latest changes |
| POST   | `/sync/push` | ✓ | Push local changes |
| POST   | `/sync/register-device` | ✓ | Register device for sync |
| GET    | `/sync/devices` | ✓ | List sync devices |
| POST   | `/sync/deactivate-device` | ✓ | Deactivate sync device |

---

## PIN Security

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/pin/create` | ✓ | Create security PIN |
| POST   | `/pin/verify` | ✓ | Verify PIN |
| POST   | `/pin/verify-security` | ✓ | Verify security questions |
| POST   | `/pin/update` | ✓ Security gate | Update PIN |
| GET    | `/pin/status` | ✓ | Get PIN status |
| GET    | `/pin/key-backup` | ✓ | Get key backup |
| POST   | `/pin/key-backup` | ✓ Security gate | Store key backup |
| DELETE | `/pin/key-backup` | ✓ | Delete key backup |
| GET    | `/pin/expiring-soon` | ✓ | Keys expiring soon |
| POST   | `/pin/reset` | ✓ | Reset PIN |
| POST   | `/pin/self-reset` | ✓ Security gate | Self-service PIN reset |

---

## OTP

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/otp/send` | ✓ | Send OTP (RBI-compliant) |
| POST   | `/otp/verify` | ✓ | Verify OTP |

---

## Bills & Receipts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/bills` | ✓ | List bill uploads |
| POST   | `/bills` | ✓ | Upload bill (multipart, max 5 MB, rate limited 10/min) |
| DELETE | `/bills/:id` | ✓ | Delete a bill |
| POST   | `/receipts/start` | ✓ | Start async OCR receipt scan |
| GET    | `/receipts/status/:jobId` | ✓ | Poll OCR job status |
| POST   | `/receipts/scan` | ✓ | Sync receipt scan (deprecated) |

Bill/receipt uploads use `multipart/form-data` with field `file`.

---

## Categorization

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/categorize` | ✓ | Auto-categorize a transaction description |
| POST   | `/learn` | ✓ | Submit categorization correction for learning |

---

## Import (Bank Statement)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/import/upload` | ✓ | Upload statement file |
| POST   | `/import/confirm` | ✓ | Confirm parsed import |
| GET    | `/import/:sessionId` | ✓ | Get import session status |

---

## AI Features (require AI feature flags)

| Method | Path | Auth | Feature Flag | Description |
|--------|------|------|--------------|-------------|
| POST   | `/ai/events` | ✓ | — | Capture AI event |
| GET    | `/ai/quota` | ✓ | — | Get AI quota/usage |
| GET    | `/ai/insights` | ✓ | aiAutomation | AI financial insights |
| GET    | `/ai/health-score` | ✓ | aiAutomation + healthScoring | Financial health score |
| GET    | `/ai/recommendations` | ✓ | aiAutomation + smartCategorization | Smart recommendations |
| GET    | `/ai/fraud-alerts` | ✓ | aiAutomation + anomalyDetection | Fraud/anomaly alerts |
| GET    | `/ai/bill-predictions` | ✓ | aiAutomation + subscriptionDetection | Bill predictions |
| GET    | `/ai/spending-patterns` | ✓ | aiAutomation + smartCategorization | Spending patterns |

---

## Voice Assistant (require voiceAssistant feature)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/voice/process-audio` | ✓ | Process audio input (multipart) |
| POST   | `/voice/process` | ✓ | Process text voice command |
| POST   | `/voice/learn` | ✓ | Submit correction for learning |

---

## Stocks (Market Data)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/stocks/markets` | ✓ | Market overview |
| GET    | `/stocks/search` | ✓ | Search stocks |
| GET    | `/stocks/stock` | ✓ | Get stock quote (`?symbol=NIFTY50`) |
| GET    | `/stocks/batch` | ✓ | Get batch quotes |

---

## Account Aggregator (RBI AA — Setu)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST   | `/aa/consent` | ✓ | Create consent request |
| GET    | `/aa/consent/status/:consentHandle` | ✓ | Check consent status |
| GET    | `/aa/consent/artifact/:consentId` | ✓ | Fetch consent artifact |
| POST   | `/aa/data/session` | ✓ | Create data fetch session |
| GET    | `/aa/data/fetch/:sessionId` | ✓ | Fetch linked account data |
| GET    | `/aa/consents` | ✓ | List user consents |
| POST   | `/aa/consent/revoke/:consentId` | ✓ | Revoke consent |
| GET    | `/aa/financial-summary` | ✓ | Aggregated financial summary |
| POST   | `/aa/notification` | Public | AA notification webhook (Setu callback) |

---

## Social (Friends & Groups)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/friends` | ✓ | List friends |
| POST   | `/friends` | ✓ | Add a friend |
| PUT    | `/friends/:id` | ✓ | Update friend |
| DELETE | `/friends/:id` | ✓ | Remove friend |
| GET    | `/groups` | ✓ | List groups |
| POST   | `/groups` | ✓ | Create group |
| PUT    | `/groups/:id` | ✓ | Update group |
| DELETE | `/groups/:id` | ✓ | Delete group |

---

## Todos

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/todos` | ✓ | List todos |
| POST   | `/todos` | ✓ | Create todo |
| PUT    | `/todos/:id` | ✓ | Update todo |
| DELETE | `/todos/:id` | ✓ | Delete todo |
| GET    | `/todos/lists` | ✓ | List todo lists |
| POST   | `/todos/lists` | ✓ | Create todo list |
| PUT    | `/todos/lists/:id` | ✓ | Update todo list |
| DELETE | `/todos/lists/:id` | ✓ | Delete todo list |
| GET    | `/todos/items` | ✓ | Get all todo items |
| GET    | `/todos/lists/:listId/items` | ✓ | Items for a specific list |

---

## Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/settings` | ✓ | Get user settings |
| PUT    | `/settings` | ✓ | Update user settings |

---

## Avatars

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/avatars/dicebear/:style/svg` | Public | Generate DiceBear avatar SVG |

---

## Admin Panel (Role: admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/admin/features` | ✓ Admin | List feature flags |
| GET    | `/admin/ai-features` | ✓ Admin | List AI feature flags |
| POST   | `/admin/features/toggle` | ✓ Admin | Toggle a feature flag |
| POST   | `/admin/ai-features/toggle` | ✓ Admin | Toggle an AI feature flag |
| GET    | `/admin/users` | ✓ Admin | List all users |
| GET    | `/admin/users/pending` | ✓ Admin | List pending advisor approvals |
| GET    | `/admin/users/activity` | ✓ Admin | User activity report |
| POST   | `/admin/users/:advisorId/approve` | ✓ Admin | Approve advisor |
| POST   | `/admin/users/:advisorId/reject` | ✓ Admin | Reject advisor |
| POST   | `/admin/users/:userId/status` | ✓ Admin | Toggle user active/inactive |
| POST   | `/admin/users/:userId/role` | ✓ Admin | Change user role |
| DELETE | `/admin/users/:userId` | ✓ Admin | Delete user |
| GET    | `/admin/users/:userId/storage` | ✓ Admin | Get user storage stats |
| GET    | `/admin/stats` | ✓ Admin | Platform-wide stats |
| GET    | `/admin/cache/metrics` | ✓ Admin | Cache metrics |
| GET    | `/admin/reports/users` | ✓ Admin | Users report |
| GET    | `/admin/reports/revenue` | ✓ Admin | Revenue report |
| GET    | `/admin/ai/overview` | ✓ Admin | AI usage overview |
| GET    | `/admin/ai/users` | ✓ Admin | Per-user AI usage |
| GET    | `/admin/ai/insights` | ✓ Admin | AI insight analytics |
| GET    | `/admin/ai/patterns` | ✓ Admin | AI pattern analytics |
| GET    | `/admin/ai/accuracy` | ✓ Admin | AI accuracy metrics |
| GET    | `/admin/ai/raw/:userId` | ✓ Admin | Raw AI data for a user |
| POST   | `/admin/ai/run/features` | ✓ Admin | Trigger AI feature refresh |
| POST   | `/admin/ai/run/predictions` | ✓ Admin | Trigger AI prediction refresh |
| GET    | `/admin/ai/config` | ✓ Admin | Get AI config |
| POST   | `/admin/ai/config` | ✓ Admin | Update AI config |

---

## Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/health` | Public | Server health (used by Fly.io healthcheck) |

---

## Important Notes

### Authenticated Profile Endpoint
The correct endpoint to verify authentication / get the current user is:
```
GET /api/v1/auth/profile
```
The following paths do **not** exist and return 404:
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/verify`
- `GET /api/v1/users/me`
- `GET /api/v1/users/profile`

### Rate Limits
- Auth endpoints (`/auth/register`, `/auth/login*`): 5 requests / 15 minutes per IP
- Bill uploads: 10 requests / 60 seconds per user
- OCR start: 10 requests / 60 seconds per user
- OCR status poll: 20 requests / 10 seconds per user
- Receipt scan (deprecated): configurable via `RECEIPT_SCAN_RATE_LIMIT` env var (default 8/min)
- Account deletion: strict destructive limiter

### Role Hierarchy
| Role | Access |
|------|--------|
| `user` | Own data only |
| `advisor` | Own data + advisor-specific routes (availability, sessions, clients) |
| `manager` | Advisor management (approve/reject) |
| `admin` | Full platform access + admin panel |

### Feature Flags
Some routes require feature flags to be enabled. If disabled, returns `403 FEATURE_DISABLED`.
Check current flags via `GET /admin/features` (admin only) or check the `featureGates` table.
