# Kanaku — Backend Hardening & Sync Completeness Plan

> Audit date: 2026-06-17  
> Based on full codebase scan of 37 backend modules, Prisma schema (45 models), and Dexie ↔ backend sync analysis.  
> Priority: P0 = ship blocker · P1 = before launch · P2 = sprint 1 post-launch · P3 = roadmap

---

## Current State Rating

| Area | Score | Notes |
|------|-------|-------|
| CRUD completeness | 7/10 | Most modules complete; 4 missing single-read; collaboration has no routes |
| Duplicate prevention | 6/10 | 8 of 14 syncable modules have idempotency; 6 do not |
| Request validation | 5/10 | 16 of 37 modules have Zod validation; 21 do not |
| Error handling | 9/10 | Global handler is solid; Prisma errors normalized; request IDs in place |
| Sync mechanism | 6/10 | `clientRequestId` pattern works but not universal; no conflict resolution |
| Schema alignment | 5/10 | ~30 Dexie fields missing from Prisma across investments/loans/recurring |
| Security | 7/10 | 4 of 10 findings fixed; 2 critical still open |

---

## P0 — Ship Blockers

These must be fixed before any production traffic.

---

### P0-1 · Payment Webhook HMAC Verification

**File**: `backend/src/modules/payments/payment.routes.ts` (or `payment.controller.ts`)  
**Risk**: Any external caller can forge a payment success event → free credits/subscription upgrades.

**Implementation**:

1. Add env var `PAYMENT_WEBHOOK_SECRET` to `.env` and `.env.example`.

2. Create `backend/src/middleware/webhook-verify.ts`:

```typescript
import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'Webhook secret not configured' });

  const signature = req.headers['x-webhook-signature'] as string;
  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  // req.rawBody must be set — see note below
  const expected = createHmac('sha256', secret).update((req as any).rawBody ?? '').digest('hex');
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(signature);
  if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
}
```

3. In `backend/src/app.ts`, preserve raw body for webhook routes only:

```typescript
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }), (req, _res, next) => {
  (req as any).rawBody = req.body;
  req.body = JSON.parse(req.body.toString());
  next();
});
```

4. Apply middleware in `webhook.routes.ts`:

```typescript
import { verifyWebhookSignature } from '../../middleware/webhook-verify';
router.post('/payment', verifyWebhookSignature, WebhookController.handlePayment);
```

---

### P0-2 · Todo List Delete Ownership Check

**File**: `backend/src/modules/todos/todo.repository.ts`  
**Risk**: Any authenticated user can delete any other user's todo list by ID.

**Fix** (one Prisma change):

```typescript
// BEFORE
async deleteList(id: string): Promise<void> {
  await prisma.todoList.delete({ where: { id } });
}

// AFTER
async deleteList(id: string, userId: string): Promise<void> {
  await prisma.todoList.deleteMany({ where: { id, userId } });
  // deleteMany silently skips if record belongs to another user
}
```

Update `todo.service.ts` and `todo.controller.ts` to pass `req.user.id` as the second argument.

---

### P0-3 · SendGrid Sender Verification

**File**: N/A (external action)  
**Risk**: ALL transactional email (OTP, invitations, notifications) is blocked.

**Action**: Log in to SendGrid → Settings → Sender Authentication → click the verification link for `candidatex002@gmail.com`. Until clicked, every `sgMail.send()` call returns HTTP 403 and fails silently.

---

## P1 — Pre-Launch (complete before first external user)

---

### P1-1 · Universal Duplicate Prevention via `clientRequestId`

Six syncable modules can create duplicates because they have no idempotency check and no `clientRequestId` field in Prisma. The pattern already proven in accounts/budgets/goals should be copied.

**Modules affected**: `bills`, `bookings`, `friends`, `groups` (GroupExpense), `gold` (GoldAsset already has clientRequestId — just needs the controller check), `todos` (TodoList + TodoItem)

**Step A — Add field to Prisma schema** for modules that are missing it:

```prisma
// friends model — add:
clientRequestId  String?  @unique

// TodoList model — add:
clientRequestId  String?  @unique

// TodoItem model — add:
clientRequestId  String?  @unique

// GroupExpense model — add:
clientRequestId  String?  @unique

// BookingRequest model — add:
clientRequestId  String?  @unique
```

Run `npx prisma migrate dev --name add_clientRequestId_dedup`.

**Step B — Add idempotency check to each controller** (copy this pattern):

```typescript
// At the top of every create handler:
if (body.clientRequestId) {
  const existing = await prisma.MODEL.findFirst({
    where: { clientRequestId: body.clientRequestId, userId: req.user.id }
  });
  if (existing) return res.status(200).json({ success: true, data: existing });
}
```

**Step C — Send `clientRequestId` from frontend** for all Dexie-to-backend sync calls. Use the Dexie record's local ID:

```typescript
// In backend-api.ts create methods — already done for recurring/budgets.
// Apply same pattern to: createTodoList, createFriend, createGroupExpense, createBooking
const clientRequestId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
```

---

### P1-2 · Transaction Dedup Hash Coverage

Transactions already have `dedupHash` (`@@unique`). Ensure the hash is always set on every create path — including the bulk import path and the sync push path.

**File**: `backend/src/modules/transactions/transaction.repository.ts`

**Check**: Verify `generateDedupHash()` is called on both:
1. `POST /transactions` (single create) — likely already done
2. `POST /sync/push` entity type `transactions` — verify the sync service calls `generateDedupHash` before `upsert`

If sync push inserts raw entities without hashing, add:

```typescript
// In sync.service.ts, transactions entity handler:
import { generateDedupHash } from '../transactions/transaction.repository';
const hash = generateDedupHash(entity);
await prisma.transaction.upsert({
  where: { dedupHash: hash },
  create: { ...entity, dedupHash: hash },
  update: {}  // No-op if already exists
});
```

---

### P1-3 · Add Missing `GET /:id` Single-Read Routes

Three modules return lists but have no single-record fetch — this breaks detail views and sync reconciliation.

| Module | Missing route | File |
|--------|--------------|------|
| investments | `GET /investments/:id` | `backend/src/modules/investments/investment.routes.ts` |
| gold | `GET /gold/:id` | `backend/src/modules/gold/gold.routes.ts` |
| groups | `GET /groups/:id` | `backend/src/modules/groups/group.routes.ts` |

**Pattern** (copy from loans which has a working GET /:id):

```typescript
// investment.routes.ts
router.get('/:id', authMiddleware, InvestmentController.getById);

// investment.controller.ts
static async getById(req: Request, res: Response) {
  const { id } = req.params;
  const userId = req.user!.id;
  const item = await prisma.investment.findFirst({ where: { id, userId, deletedAt: null } });
  if (!item) return res.status(404).json({ success: false, error: 'Not found' });
  return res.json({ success: true, data: item });
}
```

---

### P1-4 · Collaboration Module — Add CRUD Routes

The collaboration system has `CollaborationParticipant` in Prisma and `invitation.service.ts` in the backend, but **no routes file** — invitations can be created by services internally but cannot be managed via API.

**Create**: `backend/src/modules/collaboration/collaboration.routes.ts`

```typescript
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { CollaborationController } from './collaboration.controller';

const router = Router();
router.use(authMiddleware);

router.get('/',           CollaborationController.listForUser);    // all invitations for me
router.post('/',          CollaborationController.invite);          // invite someone
router.put('/:id/accept', CollaborationController.accept);
router.put('/:id/reject', CollaborationController.reject);
router.delete('/:id',     CollaborationController.revoke);

export default router;
```

**Create**: `backend/src/modules/collaboration/collaboration.controller.ts` with handlers delegating to `invitation.service.ts`.

**Register in app.ts**:

```typescript
import collaborationRoutes from './modules/collaboration/collaboration.routes';
app.use('/api/v1/collaborations', collaborationRoutes);
```

---

### P1-5 · Prisma Schema Gaps — Investment & Loan Fields

~26 fields stored in Dexie are absent from Prisma. They are silently dropped during backend sync.

**Migration to add**:

```prisma
model Investment {
  // ... existing fields ...
  broker               String?
  currency             String?
  exchangeRate         Float?
  baseCurrencyValue    Float?
  positionStatus       String?   @default("open")  // open|closed|partial
  closedAt             DateTime?
  realizedGainLoss     Float?
  unrealizedGainLoss   Float?
  dividendsReceived    Float?
  fees                 Float?
  taxLiability         Float?
  notes                String?
  tags                 String[]
  linkedGoalId         String?
}

model Loan {
  // ... existing fields ...
  totalPayable         Float?
  loanDate             DateTime?
  friendId             String?
  contactEmail         String?
  contactPhone         String?
  bankName             String?
  interestType         String?   // fixed|floating
  processingFee        Float?
  prepaymentPenalty    Float?
  insurancePremium     Float?
  collateral           String?
  coApplicant          String?
}

model RecurringTransaction {
  // ... existing fields ...
  type                 String?   // income|expense|transfer
  accountId            String?
  description          String?
  // Note: 'interval' may already exist; confirm field name vs Dexie's 'frequency'
}
```

Run: `npx prisma migrate dev --name add_investment_loan_recurring_fields`

---

### P1-6 · Add Zod Validation to High-Traffic Modules Without It

Priority order (by traffic volume and risk):

| Module | Risk without validation | Add schemas for |
|--------|------------------------|-----------------|
| auth | Malformed login/register crashes service | login, register, challenge request bodies |
| payments | Financial amounts unvalidated | initiate, complete, refund |
| bookings | Date conflicts, invalid states | create, accept/reject, reschedule |
| friends | Unvalidated email/phone | add, import |
| settings | Arbitrary key/value injection | update settings body |
| sync | Arbitrary entity injection via push | push entity schema per type |
| notifications | N/A (system only) | read/delete params only |

**Pattern** (copy from `budget.validation.ts`):

```typescript
import { z } from 'zod';

export const bookingCreateSchema = z.object({
  advisorId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  duration: z.number().int().min(15).max(120),
  type: z.enum(['video', 'audio', 'chat']),
  notes: z.string().max(500).optional(),
  clientRequestId: z.string().uuid().optional(),
});
```

Apply via `validateBody(schema)` middleware in routes.

---

### P1-7 · Sync Push — Upsert Instead of Insert

**File**: `backend/src/modules/sync/sync.service.ts`

The sync push endpoint receives batches of Dexie records and persists them. If it uses `create` instead of `upsert`, re-syncing after a network hiccup creates duplicates.

**Check and fix** each entity handler:

```typescript
// BEFORE (creates duplicates on retry)
await prisma.transaction.create({ data: entity });

// AFTER (idempotent)
await prisma.transaction.upsert({
  where: { id: entity.id },  // or clientRequestId if id may differ
  create: entity,
  update: { ...entity, updatedAt: new Date() }
});
```

Apply the same pattern for: accounts, budgets, goals, investments, loans, recurringTransactions in the sync push handler.

---

### P1-8 · Sync Pull — Return `lastSyncedAt` Cursor

For offline reconciliation the frontend needs to know the server's last-synced timestamp per entity type so it can fetch only delta changes.

**File**: `backend/src/modules/sync/sync.service.ts` and `sync.routes.ts`

**Current state**: Pull endpoint likely returns all records filtered by `updatedAt > lastSyncedAt`.

**Ensure the response includes**:

```typescript
return res.json({
  success: true,
  data: {
    transactions: [...],
    accounts: [...],
    // ...other entities...
    serverTimestamp: new Date().toISOString(),  // ← cursor for next pull
  }
});
```

Frontend Dexie sync should store `serverTimestamp` in `db.settings` after each successful pull and send it as `lastSyncedAt` on the next pull.

---

## P2 — Sprint 1 Post-Launch

---

### P2-1 · OTP HMAC Instead of Bare SHA-256

**Files**: wherever OTPs are stored and verified (likely `otp.service.ts`)

```typescript
// BEFORE
const hash = crypto.createHash('sha256').update(code).digest('hex');

// AFTER
const hash = crypto.createHmac('sha256', process.env.OTP_HMAC_SECRET!).update(code).digest('hex');
```

Add `OTP_HMAC_SECRET` to `.env` (32+ random bytes). Update BOTH store and verify paths in the same deployment.

---

### P2-2 · Challenge Code Removed from Response Body

**Files**: `backend/src/modules/auth/auth.controller.ts` + `frontend/src/lib/api.ts`

Replace the current "code in response" flow with email/SMS delivery:

1. Backend: remove `code` from the `/auth/login/challenge` JSON response.
2. Send OTP via email/SMS using the existing `otp.service.ts`.
3. Frontend: remove reads of `challengeResponse.data.code` at api.ts lines 630, 643, 649. Show an "Enter the code sent to your email" input instead.

This requires a coordinated frontend + backend deploy.

---

### P2-3 · PIN Security Endpoint — Require Proof

**File**: `backend/src/modules/pin/pin.routes.ts` + `pin.service.ts`

`POST /pin/verify-security` currently issues a security token to any authenticated user. Add PIN verification:

```typescript
// Request body: { pin: string }
// Verify PIN hash matches stored hash before issuing token
const userPin = await prisma.userPin.findUnique({ where: { userId } });
const match = await bcrypt.compare(body.pin, userPin.pinHash);
if (!match) return res.status(401).json({ error: 'Invalid PIN' });
// Then issue token
```

---

### P2-4 · Auth Rate Limiting

**File**: `backend/src/app.ts`

Add per-route rate limits using `express-rate-limit` (already a dependency for global limits):

```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true });
const challengeLimiter = rateLimit({ windowMs: 10 * 60_000, max: 5, standardHeaders: true });
const pinLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5, standardHeaders: true, keyGenerator: (req) => req.user?.id ?? req.ip });

app.use('/api/v1/auth/login',           authLimiter);
app.use('/api/v1/auth/login/challenge', challengeLimiter);
app.use('/api/v1/auth/register',        authLimiter);
app.use('/api/v1/pin/verify',           pinLimiter);
```

---

### P2-5 · syncStatus Field — Extend to Missing Models

Models that participate in offline sync but lack `syncStatus`:

| Model | Has syncStatus | Action |
|-------|---------------|--------|
| Transaction | ✅ | — |
| Account | ✅ | — |
| Budget | ✅ | — |
| Goal | ✅ | — |
| Loan | ✅ | — |
| Investment | ✅ | — |
| RecurringTransaction | ✅ | — |
| GoldAsset | ✅ | — |
| GroupExpense | ✅ | — |
| Friend | ✅ | — |
| **TodoList** | ❌ | Add `syncStatus String @default("synced")` |
| **TodoItem** | ❌ | Add `syncStatus String @default("synced")` |
| **CollaborationParticipant** | ❌ | Add `syncStatus String @default("synced")` |
| **Notification** | ❌ | Add `syncStatus String @default("synced")` |

Run migration after adding fields.

---

### P2-6 · Conflict Resolution Strategy

**File**: `backend/src/modules/sync/sync.service.ts`

Current behavior: last-write-wins (latest `updatedAt` overwrites). This silently drops changes when two devices edit the same record offline.

**Recommended approach — server-wins with client notification**:

```typescript
// In sync push handler, for each entity:
const existing = await prisma.MODEL.findUnique({ where: { id: entity.id } });

if (existing && existing.updatedAt > new Date(entity.updatedAt)) {
  // Server version is newer — skip client update, flag as conflict
  conflicts.push({ id: entity.id, serverVersion: existing });
  continue;
}

// Client version is newer — apply update
await prisma.MODEL.update({ where: { id: entity.id }, data: entity });
```

Return `{ synced: [...], conflicts: [...] }` in the sync push response. Frontend should prompt the user when conflicts are returned.

---

### P2-7 · Database Indexes Audit

**File**: `backend/prisma/schema.prisma`

Add missing `@@index` declarations for query patterns used in list endpoints:

```prisma
// user_features — missing userId index
model user_features {
  // ...
  @@index([user_id])
}

// Notification — add composite for the most common query (unread by user)
model Notification {
  // ...
  @@index([userId, isRead, createdAt])
}

// Transaction — add composite for date-range queries per user
model Transaction {
  // ...
  @@index([userId, date])
  @@index([userId, category])
}

// LoanPayment — queries always by loanId
model LoanPayment {
  // ...
  @@index([loanId])
}

// GoalContribution — queries always by goalId
model GoalContribution {
  // ...
  @@index([goalId])
}
```

---

## P3 — Roadmap

---

### P3-1 · Sync Queue — Retry with Exponential Backoff

**File**: `SyncQueue` model already exists in Prisma schema — wire it up.

The `SyncQueue` table can serve as a persistent retry queue:
1. Frontend: on sync failure, write failed entity to `db.settings['sync_failed_queue']`
2. On next app open or connectivity restore, retry from queue
3. Backend: when push fails, store in `SyncQueue` with `retryCount`, `nextRetryAt`

---

### P3-2 · gRPC Transport (Internal Services)

For when the backend splits into microservices. Not needed for monolith.

Recommendation: use gRPC for AI engine ↔ API server communication (high volume, low latency needed). Keep REST for client-facing API (simpler auth, browser compatible).

---

### P3-3 · Redis Session Store + Cache

Replace in-memory cache with Redis:
- Session tokens
- Rate limit counters (so they survive restarts)
- Budget/goal summary cache (avoid recomputing on every dashboard load)

---

### P3-4 · Event Sourcing for Financial Transactions

For audit trail and regulatory compliance. Every transaction mutation becomes an immutable event. The current `AuditLog` model is a good starting point — extend it to cover all financial writes.

---

## Implementation Order (Recommended Sprint Plan)

### Week 1 — P0 Blockers
- [ ] P0-1: Webhook HMAC verification
- [ ] P0-2: TodoList delete ownership
- [ ] P0-3: SendGrid sender verification (external action, 5 min)

### Week 2 — Core Sync Integrity
- [ ] P1-1: Universal clientRequestId dedup (friends, bookings, todos, groups)
- [ ] P1-2: Transaction dedup hash in sync push path
- [ ] P1-7: Sync push upsert instead of insert
- [ ] P1-8: Sync pull serverTimestamp cursor

### Week 3 — Schema & CRUD Gaps
- [ ] P1-5: Prisma migration — investment/loan/recurring field gaps
- [ ] P1-3: Missing GET /:id routes (investments, gold, groups)
- [ ] P1-4: Collaboration CRUD routes
- [ ] P2-5: syncStatus on todos, collaborations, notifications

### Week 4 — Validation & Indexes
- [ ] P1-6: Zod validation for auth, payments, bookings, friends, settings, sync
- [ ] P2-7: Database index audit + migration

### Post-Launch Sprint 1
- [ ] P2-1 through P2-4: OTP HMAC, challenge code flow, PIN proof, auth rate limits
- [ ] P2-6: Conflict resolution strategy

---

## Quick Reference — Files to Touch

| Item | Files |
|------|-------|
| P0-1 Webhook HMAC | `backend/src/middleware/webhook-verify.ts` (new), `app.ts`, `webhook.routes.ts` |
| P0-2 deleteList | `todo.repository.ts`, `todo.service.ts`, `todo.controller.ts` |
| P1-1 dedup | `prisma/schema.prisma`, `friend.controller.ts`, `todo.controller.ts`, `group.routes.ts`, `booking.controller.ts` |
| P1-2 dedup hash | `sync.service.ts` |
| P1-3 GET /:id | `investment.routes.ts`, `investment.controller.ts`, `gold.routes.ts`, `gold.controller.ts`, `group.routes.ts`, `group.controller.ts` |
| P1-4 Collaboration | `collaboration.routes.ts` (new), `collaboration.controller.ts` (new), `app.ts` |
| P1-5 Schema gaps | `prisma/schema.prisma`, migration |
| P1-6 Validation | `auth.validation.ts` (new), `payment.validation.ts` (new), `booking.validation.ts` (new), `friend.validation.ts` (new) |
| P1-7 Sync upsert | `sync.service.ts` |
| P1-8 Sync cursor | `sync.service.ts`, `sync.routes.ts` |
| P2-7 Indexes | `prisma/schema.prisma`, migration |
