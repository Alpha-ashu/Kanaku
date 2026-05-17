# KANKU ” Deep App Analysis & Full Audit Report
> Reviewed against: `security.skill.md` · `frontend.skill.md` · `backend.skill.md` · `database.skill.md`
> Analysis Date: May 11, 2026

---

## ´ CRITICAL ACTIVE BUGS (from bug.md)

> [!CAUTION]
> These are **crashing bugs** currently breaking the running dev server. Fix immediately.

### BUG-5: `ReferenceError: PageHeaderCard is not defined` ” App-Breaking Crash
- **File**: `frontend/src/app/components/Transactions.tsx` (line 264)
- **Error**: `PageHeaderCard` is used in `Transactions.tsx` but is **never imported**.
- **Impact**: The entire Transactions page crashes and falls to `PageErrorBoundary`. This is the **most critical runtime bug**.
- **Fix**: Either import `PageHeaderCard` from the correct path, or replace it with whatever header component the design system uses (`TopBar`, or an inline `<div>`).

```tsx
// MISSING import in Transactions.tsx
import { PageHeaderCard } from '@/components/ui/PageHeaderCard'; // add this
```

### BUG-4: AddTransaction ” Inconsistent Design Across Modes
- Expense †’ Individual, Split Bill, and Loan modes are not visually consistent.
- Income and Transfer pages have different padding/card styles vs. Expense.
- **Root cause**: `DesktopView` and `MobileView` are built as JSX variables (not components), but the conditional rendering for each `expenseMode` uses different card wrapper patterns.

### BUG-3: Category Selection UX Broken
- The request is to remove `CategoryDropdown` and replace with the icon-grid (`CategoryGrid`) on mobile.
- Currently the mobile step 2 already uses `CategoryGrid`, but the desktop left-panel also shows `CategoryGrid` ” which conflicts with the request to use a **searchable dropdown on desktop**.

### BUG-2: Back Button Visible on Desktop
- `MobileBackButton` uses `lg:hidden` correctly ” **this is already fixed in code**.
- However `AddTransaction.tsx` header's "HelpCircle" and "Settings" icon buttons are non-functional dead buttons on desktop (no `onClick` handlers), which is a UX issue.

### BUG-1: TopBar/Header Card Style
- The `TopBar` component is rendered inside the main layout but its card style is inconsistent with the glassmorphic `premium-glass-card` design system used throughout the app.

---

##  SECURITY ANALYSIS

### PASS ” Middleware Order (Critical)
```
helmet †’ cors †’ json †’ sanitize †’ rateLimit †’ routes †’ 404 †’ errorHandler
```
**Correct.** `errorHandler` is registered last. Helmet is first.

### PASS ” Authentication (Multi-Path JWT)
- Triple-fallback: Custom JWT †’ Supabase JWT secret †’ Supabase API call
- Dev-only bypass via `NODE_ENV === 'development'` (correctly guarded)
- Account suspension check (`status === 'suspended'`) at all 3 JWT paths
- Audit events fired on all auth failures via `audit()` from `auditLogger.ts`

### PASS ” Rate Limiting
| Endpoint | Limit | Scope |
|---|---|---|
| Global `/api/v1` | 60/min prod, 600/min dev | IP |
| `/api/v1/bills` | 10/min | User ID or IP |
| `/api/v1/receipts` | 8/min | User ID or IP |
| `/api/v1/sync` | 100/min | User ID or IP |

- Redis-backed with in-memory fallback ” **resilient and correct.**
- `Retry-After` header set on 429 responses ” **RFC compliant.**

### PASS ” Ownership Checks
All transaction queries use `{ id, userId }` compound filters. Verified in `transaction.controller.ts`:
```ts
where: { id, userId, deletedAt: null }
```

### PASS ” Input Sanitization
- Global body sanitization middleware strips HTML/script tags from all string fields.
- AI/OCR pipeline has `sanitizeAIInput` with prompt injection detection (12 regex patterns).
- `validateOcrResult` bounds-checks financial amounts.

### PASS ” PIN Security
- bcrypt with cost factor 10 (acceptable; skill doc says ‰¥12 in production ” **consider bumping**)
- Failed attempt lockout: 5 attempts †’ 1-hour lock
- PIN expiry: 90 days with `expiresAt` enforced server-side
- `keyBackup` field in `UserPin` stores encrypted key backup ” sensitive, ensure encrypted

###  WARN ” bcrypt Cost Factor
- `pin.service.ts` uses `bcrypt.hash(pin, 10)` ” skill doc mandates ‰¥12 in production.

###  WARN ” Placeholder Email in PIN Service
```ts
// pin.service.ts:54
const resolvedEmail = request.email?.trim() || `user-${request.userId.slice(0, 8)}@placeholder.KANKU.app`;
```
This hardcodes `KANKU.app` domain ” branding issue + user confusion if email is ever shown.

###  WARN ” `console.error` in PIN Service (not using Winston logger)
All methods in `pin.service.ts` use `console.error(...)` instead of `logger.error(...)`. This bypasses structured logging and the audit trail.

### PASS ” Secrets Management
- `JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are server-only, never in frontend env.
- `.env.example` is present; actual `.env` is gitignored.
- `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` is the safe anon key for the browser.

###  WARN ” Missing `SUPABASE_JWT_SECRET` in `.env.example`
The backend `auth.ts` reads `SUPABASE_JWT_SECRET` but this is **not documented** in `backend/.env.example`. New developers will miss it and fall through to the API-call path.

---

##  FRONTEND ANALYSIS

### Architecture
- Routing uses React Router v6 with URL-based navigation (`useNavigate`/`location.pathname`).
- `AppContext` correctly derives `currentPage` from `location.pathname` ” no duplicated state.
- All heavy pages are `React.lazy()` loaded ” code-splitting implemented.
- `PageErrorBoundary` wraps all lazy-loaded pages ” graceful error recovery.

### Mobile Layout
- Bottom nav (`BottomNav`) shown only on `< lg` with `lg:hidden` ” correct.
- `MobileBackButton` also `lg:hidden` ” correct.
- `AddTransaction` mobile view uses a proper 3-step wizard with `AnimatePresence` transitions.
- Input `font-size: 16px` in CSS prevents iOS zoom ” œ…

### Desktop Layout
- Sidebar is fixed, 112px wide (`w-28`) with `lg:block hidden`.
- Content area: `lg:ml-28 flex-1` ” correctly offset.
- Desktop max-width: `lg:max-w-[90%] xl:max-w-[85%]` ” reasonable for wide screens.
- AddTransaction desktop is a 60/40 split panel ” visually premium.

###  ISSUES FOUND

#### 1. Hardcoded `en-IN` / `INR` locale in AddTransaction
```tsx
// AddTransaction.tsx:94
new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', ... }).format(v)
```
The app has a global `currency` from `AppContext`. This should respect the user's currency setting.

#### 2. Branding: "KANKU" in User-Facing Strings
| File | Line | Issue |
|---|---|---|
| `App.tsx` | 139, 339, 508 | `"Loading KANKU..."` shown to users |
| `AppContext.tsx` | 122 | `REPAIR_KEY = 'KANKU_description_repair_v2'` |
| `migration.ts` | 14 | `[KANKU/Migration] Starting brand migration...` |
| `pin.service.ts` | 54 | `placeholder.KANKU.app` email domain |

#### 3. Missing `console.log` Cleanup
`AppContext.tsx` line 476:
```tsx
console.log(' AppContext applying admin feature settings:', ...);
```
This should be `logger.info()` or removed. Production builds leak internal state details.

#### 4. `useOptionalApp` Fallback Pattern
`App.tsx` shows a spinner when `useOptionalApp()` returns undefined. This is acceptable but the "Loading KANKU..." text (line 139) needs rebranding.

#### 5. `syncStats` is Incomplete
`AppContext.tsx` line 72: `syncStats` is a hardcoded `useMemo` with `pendingCount: 0` and `lastSyncedAt: null` ” it doesn't reflect real sync state. This means the sync status UI will always show stale data.

#### 6. Dead Buttons in AddTransaction Desktop Header
```tsx
// AddTransaction.tsx lines 404-409
<button className="p-3 text-slate-400 hover:text-indigo-600">
  <HelpCircle size={20} />  {/* No onClick */}
</button>
<button className="p-3 text-slate-400 hover:text-indigo-600">
  <Settings size={20} />    {/* No onClick */}
</button>
```

---

## š™ï BACKEND ANALYSIS

### Module Structure
All 26 modules follow the `routes †’ controller †’ service` pattern. Verified for:
- `auth/` ” full OTP + device trust system
- `transactions/` ” atomic writes with dedup hashing
- `pin/` ” bcrypt hashed, lockout, expiry

### Error Handling
- `AppError` pattern used throughout ” no inline `res.status().json()` in controllers.
- `errorHandler` is the last middleware ” correct.
- Prisma errors `P2002/P2025/P2003` caught centrally.

### Dedup Hash in Transactions
```ts
// transaction.controller.ts:22-26
function generateDedupHash(userId, amount, date, description)
```
SHA-256 hash prevents duplicate transactions on retry ” excellent for offline-first sync.

### Atomic Balance Updates
Transfer transactions use `prisma.$transaction()` wrapping both account balance updates and the transaction record insert ” correct.

###  ISSUE: `pin.service.ts` Uses `console.error` Instead of Winston Logger
All 10+ catch blocks use `console.error(...)`. This bypasses structured logging entirely.

###  ISSUE: `auth.controller.ts` ” Silent Success on Profile Update Failure
```ts
// auth.controller.ts:302-307
return res.json({
  success: true,
  message: 'Profile update queued (backend sync pending)',
  // ...
});
```
If `updateProfile` throws, the controller silently returns `success: true`. The frontend has no way to know the update actually failed. This could cause silent data loss.

---

## —„ï DATABASE ANALYSIS

### ´ CRITICAL: Float Used for All Monetary Fields
The `schema.prisma` uses `Float` for:
- `Account.balance`
- `Transaction.amount`
- `Goal.targetAmount`, `Goal.currentAmount`
- `Investment.buyPrice`, `currentPrice`, `totalInvested`, `currentValue`, `profitLoss`
- `Loan.principalAmount`, `outstandingBalance`
- `Payment.amount`
- `BookingRequest.amount`
- `GoalContribution.amount`
- `LoanPayment.amount`

**This violates the database.skill.md requirement** and causes real floating-point precision errors for financial data. The skill doc mandates `Decimal @db.Decimal(12, 2)`.

> [!CAUTION]
> `Float` in PostgreSQL is IEEE 754 double precision. `0.1 + 0.2 = 0.30000000000000004`. For a fintech app, this is unacceptable and will cause balance discrepancies over time.

**Migration needed:**
```prisma
// schema.prisma ” Change ALL monetary fields
amount  Float       // Œ Current
amount  Decimal @db.Decimal(12, 2)  // Required
```

### Soft Deletes Implemented
All major tables have `deletedAt DateTime?` and all queries filter `deletedAt: null`.

### Composite Indexes
```prisma
@@index([userId, date]) // Transaction ” critical for dashboard queries
@@index([userId])       // On all user-scoped tables
```

###  WARN: Dual User Storage (Data Fragmentation)
Two parallel user storage systems exist:
- `User` model ” custom auth, managed by Prisma
- `profiles` model ” Supabase auth managed

Both store overlapping data (name, gender, country, salary, avatar). The `getProfile` endpoint merges both in `buildProfilePayload()`. This is complex and could lead to conflicting data if updates don't sync between them.

### Soft Delete on Financial Records
`Transaction`, `Account`, `Goal`, `Loan`, `Investment`, `GroupExpense` all have `deletedAt DateTime?` ” financial records are never hard-deleted.

### `OtpCode` Correctly Placed in `auth` Schema
```prisma
model OtpCode {
  @@schema("auth")
}
```
Security-sensitive records isolated to the auth schema.

---

## “‹ PRIORITY ACTION LIST

| Priority | Area | Action |
|---|---|---|
| ´ P0 | Frontend | Fix `PageHeaderCard is not defined` crash in `Transactions.tsx` |
| ´ P0 | Database | Migrate all `Float` monetary fields to `Decimal(12, 2)` |
| P1 | Frontend | Rebrand all "Loading KANKU..." strings to "KANKU" |
| P1 | Backend | Fix silent `success: true` on profile update failure |
| P1 | Backend | Replace `console.error` in `pin.service.ts` with Winston `logger.error` |
| P2 | Frontend | Fix hardcoded `en-IN`/`INR` locale ” use `currency` from AppContext |
| P2 | Security | Bump bcrypt cost factor from 10 †’ 12 in `pin.service.ts` |
| P2 | Backend | Add `SUPABASE_JWT_SECRET` to `backend/.env.example` |
| P2 | Frontend | Wire up `HelpCircle` and `Settings` buttons in AddTransaction header |
| P2 | Frontend | Fix `syncStats.pendingCount` ” make it reflect actual Dexie pending count |
|  P3 | Frontend | Remove `console.log` from `AppContext.tsx` (admin feature settings) |
|  P3 | Backend | Fix `placeholder.KANKU.app` email domain in `pin.service.ts` |
|  P3 | DB | Consolidate `User` + `profiles` tables or add clear sync boundary |

