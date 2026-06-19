# Complete App Flow — Kanaku (End-to-End)

> Authoritative companion: `KANAKU_PROJECT_OVERVIEW.md` §D–J (universal request lifecycle, middleware chain, 16 feature sequence diagrams, sync state machine). This file is the navigable index of every flow. Per-module Mermaid diagrams: `Module_Sequence_Diagrams.md`.

## 1. Top-Level User Journey
```
Launch → (cached session) → PIN gate → Home/Dashboard
   ├─ Add Transaction (expense/income/transfer/withdrawal; loan/goal sub-modes)
   ├─ Scan Receipt / Add Attachment
   ├─ Voice command (multi-intent)
   ├─ Accounts / Investments / Gold / Loans / Goals / Budgets
   ├─ Friends / Groups / Split / To-Do (Together)
   ├─ Advisor booking / chat session
   ├─ Reports / Tax / Import statement / AA connect bank
   ├─ Notifications / Settings / Profile
   └─ Admin / Manager / Advisor workspaces (role-gated)
```

## 2. Universal Request Lifecycle (every mutation)
```
UI action → Dexie write (syncStatus='pending') → optimistic UI
   → apiClient POST /api/v1/... (JWT, Idempotency-Key)
   → helmet → cors → rateLimit(Redis) → json(1mb) → requestId → sanitiser
   → authenticate (multi-strategy JWT) → validate(zod) → ownership check
   → controller → service → prisma.$transaction (balance + record)
   → Redis cache invalidate → Socket.IO emit (user-scoped)
   → response → Dexie mark 'synced' (set cloudId)
   → realtime delta to other devices
```

## 3. Authentication & Gate Flow
```
Sign Up (Supabase) → /auth/register → onboarding slides → PIN setup (/pin/create)
Login → /auth/login/challenge → /auth/login → JWT(15m)+refresh(7d)
PIN gate (/pin/verify, lockout x5) → app unlocked
Token expiry → 401 → /auth/refresh → retry
```

## 4. Core money flows
- **Add Transaction** (offline-first): Dexie write → `/transactions` → atomic balance update → sync.
- **Transfer**: self/others, bank/cash sub-modes; friends picker for external recipients.
- **Goal contribution**: insert txn + update `accounts.balance` + `goals.current` atomically.
- **Loan EMI**: insert `loanPayments` + txn + update `loans.outstanding` + balance; notify.
- **Investment add**: symbol search (`/stocks/search`) → buy → cash-out balance; refresh quotes (cached 60s).
- **Gold**: positions + live metal price.
- **Budgets**: limit/period; recalculate spent; budget alerts.
- **Recurring**: nextDueDate; worker auto-posts; toggle active/paused.
- **Import**: upload statement (bank/card) → review → confirm → transactions; SMS auto-detection.

## 5. Receipt OCR (hybrid)
```
Capture (Capacitor Camera) → upload to Supabase Storage
   → Tesseract.js (client text) → /receipts/parse
   → withCircuitBreaker → Gemini 1.5 Flash (structure JSON)
      └ fallback → receipt_ai FastAPI
   → prefilled Add Transaction (low confidence = manual confirm)
Modes: Scan (OCR) vs Add Attachment (no OCR).
```

## 6. Voice command (multi-intent)
```
Speech → /voice/process(-audio) → keyword segmenter → Gemini (ambiguous)
   → actions[] → VoiceReview (per-row confirm) → /transactions/bulk → sync
```

## 7. Collaboration
- **Group expense split**: equal/percentage/custom; `GroupExpenseMember`; realtime + notifications.
- **To-Do (Together)**: list (listType) → invite emails → accept → items with assignee → realtime toggle.
- **Collaboration ACL**: list/pending/get/revoke shared resources.

## 8. Advisory cooperative
- **Booking**: search advisor → pick slot → `/bookings` (pending→confirmed→in_session→completed).
- **Chat session**: `/sessions/:id/messages` over Socket.IO; start/complete/cancel; rate session.
- **Apply as advisor**: KYC docs to Storage → `/advisors/apply` → manager/admin approve/reject → role promoted.
- **Advisor workspace / Client management**: client list from active sessions; portfolio valuation.

## 9. Account Aggregator (Setu AA, RBI)
```
/aa/consent → Setu → user approves in AA app → /aa/notification webhook
   → /aa/data/session → /aa/data/fetch → AES-256-GCM decrypt (per-user DEK)
   → auto-categorize → /aa/financial-summary ; revoke anytime
```

## 10. Platform & admin
- **Feature gates**: admin toggles per role → Redis invalidate → Socket.IO broadcast → live nav update (deny-by-default).
- **Admin**: users/roles/status/delete, platform stats, cache metrics, reports, AI ops dashboard.
- **Sync monitor**: queue health (`syncEventLogs`).
- **Notifications**: enqueue → worker → realtime badge + email (Resend) + SMS (MSG91/Twilio).

## 11. Settings & data
- Export JSON (Dexie dump), encrypted cloud backup/restore (AES-256-GCM), clear local data (server intact).

## Flowchart (decisioning)
```
Start → Cached session? → No → Login/Signup → PIN setup
                         → Yes → PIN gate → OK? → No → retry/reset
                                          → Yes → Home
Action → Online? → No → Dexie pending (retry) → Yes → /api/v1 → validate → ownership → tx → done
```

See also: `User_Journey.md`, `Sequence_Diagrams.md`, `Flowcharts.md`, `Module_Sequence_Diagrams.md`, and `../03_UI_UX_Design/Screen_Component_Map.md`.

