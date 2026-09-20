-- Migration: 20260920050000_universal_dedup_keys
--
-- Gives every remaining user-record table a DURABLE duplicate backstop.
--
-- Until now these tables relied solely on `duplicateSubmitGuard`, which is an
-- in-memory fingerprint cache: it absorbs a double-tap on the instance that saw
-- the first request, and forgets everything on restart. So a retry that landed
-- after a deploy, or on a second instance, inserted a second row and nothing
-- stopped it. The owner's standing rule is that no create path may ever produce
-- a duplicate, which only a database constraint can actually guarantee.
--
-- Two shapes:
--   * clientRequestId + unique(owner, clientRequestId) — the pattern already
--     used by Account/Goal/Loan/Investment/Budget/GoldAsset/Vault.
--   * A natural key where the code already treats one as the row's identity
--     (AdvisorAvailability: one slot per advisor per weekday).
--
-- NULLs are distinct in a Postgres unique index, so every existing row (no key)
-- stays valid and only rows that carry a key are constrained. Nothing is
-- backfilled: inventing keys for historical rows would assert a de-duplication
-- that was never performed.

-- ── clientRequestId columns ────────────────────────────────────────────────────
ALTER TABLE "Friend"             ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "group_expenses"     ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "GroupExpenseMember" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "GoalMember"         ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "Todo"               ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "ExpenseBill"        ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "BookingRequest"     ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "AdvisorPost"        ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;
ALTER TABLE "ChatMessage"        ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Friend_userId_clientRequestId_key"
  ON "Friend" ("userId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "group_expenses_userId_clientRequestId_key"
  ON "group_expenses" ("userId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "GroupExpenseMember_groupExpenseId_clientRequestId_key"
  ON "GroupExpenseMember" ("groupExpenseId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "GoalMember_goalId_clientRequestId_key"
  ON "GoalMember" ("goalId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "Todo_userId_clientRequestId_key"
  ON "Todo" ("userId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseBill_userId_clientRequestId_key"
  ON "ExpenseBill" ("userId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "BookingRequest_clientId_clientRequestId_key"
  ON "BookingRequest" ("clientId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdvisorPost_advisorId_clientRequestId_key"
  ON "AdvisorPost" ("advisorId", "clientRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_senderId_clientRequestId_key"
  ON "ChatMessage" ("senderId", "clientRequestId");

-- ── Raw-SQL todo tables (owned by features/todos/todo.repository.ts) ───────────
-- These are created at runtime by that repository and modelled in schema.prisma
-- only so `migrate diff` does not try to drop them.
ALTER TABLE "todo_lists" ADD COLUMN IF NOT EXISTS "client_request_id" TEXT;
ALTER TABLE "todo_items" ADD COLUMN IF NOT EXISTS "client_request_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "todo_lists_user_id_client_request_id_key"
  ON "todo_lists" ("user_id", "client_request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "todo_items_user_id_client_request_id_key"
  ON "todo_items" ("user_id", "client_request_id");

-- ── AdvisorAvailability: one slot per advisor per weekday ─────────────────────
-- A NATURAL key, not a request id: setAvailability already does
-- find-by-(advisorId, dayOfWeek) then update-or-create, and the bulk seeder
-- writes exactly one row per weekday. The constraint turns that
-- read-then-write — which two concurrent saves can both pass — into something
-- the database enforces.
--
-- Existing data may already violate it (that race is precisely the bug), so
-- collapse duplicates first, keeping the most recently updated row per day.
DELETE FROM "AdvisorAvailability" a
USING "AdvisorAvailability" b
WHERE a."advisorId" = b."advisorId"
  AND a."dayOfWeek"  = b."dayOfWeek"
  AND (
        a."updatedAt" < b."updatedAt"
     OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id")
      );

CREATE UNIQUE INDEX IF NOT EXISTS "AdvisorAvailability_advisorId_dayOfWeek_key"
  ON "AdvisorAvailability" ("advisorId", "dayOfWeek");
