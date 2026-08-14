-- Migration: 20260814000000_fix_account_balance_trigger_and_todo_fks
--
-- Repairs two out-of-band schema objects that were never created by any
-- migration in this repo, and that broke writes for every user in production:
--
--   1. trigger `trg_update_account_balance` on "Transaction"  → every expense rejected
--   2. five FKs from the todo_* tables to `auth.users`        → every todo list write 500s
--
-- Both were applied directly to the database at some point rather than through
-- a migration, which is why neither appears in the schema history and why
-- neither was caught by review.

-- ── 1. Drop the account-balance recalculation trigger ───────────────────────────
--
-- The trigger recomputed "Account".balance as the plain sum of that account's
-- transactions:
--
--     balance = Σ(income) − Σ(expense) − Σ(transfer out)
--
-- That is wrong in three separate ways, and they compound:
--
--   a. It drops "openingBalance" entirely. The application's invariant (see
--      account.service.ts, "balance = openingBalance + ledger") is that an
--      account opened with 1000 and no transactions has balance 1000; the
--      trigger drives it to 0.
--   b. It ignores the receiving side of a transfer ("transferToAccountId" is
--      only ever treated as an outflow), so the destination account never sees
--      the money.
--   c. It fights the application, which already maintains balances itself in
--      TransactionRepository.applyBalanceDeltas — under a row lock, with
--      overdraw enforcement and correct transfer handling.
--
-- (c) is what made expenses impossible. createWithBalanceUpdate inserts the
-- transaction row first, which fires this AFTER trigger and overwrites the
-- balance with the transaction sum; applyBalanceDeltas then applies its own
-- increment on top of that already-overwritten value. For a first expense of N
-- on an account holding any amount, the balance lands at −2N, the overdraw
-- check trips, and the user is told "Insufficient balance. Available balance
-- is −N" — a number that has nothing to do with their real balance. Income
-- happened to survive because a positive result never trips the check, but it
-- was double-counted just the same.
--
-- The application layer is the correct owner: it is transactional, it holds the
-- row lock that makes concurrent debits safe, and it is the only one of the two
-- that knows about opening balances and transfer destinations.
DROP TRIGGER IF EXISTS trg_update_account_balance ON public."Transaction";
DROP FUNCTION IF EXISTS public.recalculate_account_balance();

-- ── 2. Balances are deliberately NOT rewritten here ─────────────────────────────
--
-- Recomputing balance as `openingBalance + Σ(transactions)` is the application's
-- stated invariant, and it is tempting to repair the damaged rows that way. It
-- would destroy real data, so it is not done.
--
-- The reason is that "openingBalance" is not trustworthy in this database. 36 of
-- 84 accounts currently violate the invariant, but the large ones violate it for
-- a reason that has nothing to do with the trigger: they carry a substantial
-- negative balance (down to −9,933,838), an "openingBalance" of 0, and *zero*
-- transactions — no live rows, no soft-deleted rows, no incoming transfers.
-- The trigger cannot have produced those, because it only ever fires from a
-- Transaction row. They are credit/debt accounts whose balance was set directly
-- and whose opening balance was never recorded. Recomputing them from a zero
-- opening balance would silently zero out every one of those debts.
--
-- Actual trigger damage is limited: only 19 transactions exist database-wide, so
-- only the handful of accounts that saw a write while the trigger was live are
-- affected, and each is off by a bounded, reconstructable amount.
--
-- Correcting those is a data decision that needs a human who knows which
-- accounts hold debt, not a blind UPDATE in a schema migration. Dropping the
-- trigger above stops any further corruption, which is what unblocks users.

-- ── 3. Drop the todo_* foreign keys to auth.users ───────────────────────────────
--
-- These tables point at Supabase's `auth.users`, but this deployment's canonical
-- identity store is `public."User"` (VITE_AUTH_CANONICAL defaults to 'backend',
-- and users are minted by authService.register, not Supabase Auth). The two
-- tables share no rows at all — 212 application users against 64 auth users,
-- zero overlap — so *every* todo list, item and share insert failed the FK and
-- surfaced to the user as a bare "Failed to create list".
--
-- The FKs are dropped rather than re-pointed at public."User": these columns are
-- `uuid` while "User".id is `text`, so a re-pointed FK would not type-check
-- without rewriting the todo tables. Dropping them also restores the schema the
-- application actually expects — todo.repository.ts's own CREATE TABLE
-- statements declare these columns with no foreign key at all. Ownership is
-- already enforced in the query layer, which scopes every read and write by
-- user_id.
ALTER TABLE public.todo_lists       DROP CONSTRAINT IF EXISTS todo_lists_user_id_fkey;
ALTER TABLE public.todo_items       DROP CONSTRAINT IF EXISTS todo_items_user_id_fkey;
ALTER TABLE public.todo_items       DROP CONSTRAINT IF EXISTS todo_items_created_by_fkey;
ALTER TABLE public.todo_list_shares DROP CONSTRAINT IF EXISTS todo_list_shares_shared_with_user_id_fkey;
ALTER TABLE public.todo_list_shares DROP CONSTRAINT IF EXISTS todo_list_shares_shared_by_fkey;
