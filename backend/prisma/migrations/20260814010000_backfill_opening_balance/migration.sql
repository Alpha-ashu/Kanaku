-- Migration: 20260814010000_backfill_opening_balance
--
-- Restores the invariant `balance = openingBalance + ledger` (account.service.ts)
-- for accounts that violate it, WITHOUT altering any balance.
--
-- 35 accounts currently violate the invariant. Every one of them has zero
-- transactions — no live rows, no soft-deleted rows, no incoming transfers — so
-- none was ever touched by the `trg_update_account_balance` trigger dropped in
-- 20260814000000. This is not corruption; it is simply that `openingBalance` was
-- never populated when these accounts were created, while `balance` was. 31 of
-- them carry a negative balance: they are credit/debt accounts.
--
-- The tempting repair is the opposite of this one — recompute
-- `balance := openingBalance + ledger`. Do not do that. With `openingBalance`
-- unset at 0 and no transactions to add back, it would silently zero out all 31
-- debts, destroying real user data to satisfy a bookkeeping invariant.
--
-- For an account with no transactions the opening balance is, by definition,
-- the current balance. So the invariant is restored by moving the *derived*
-- column to match the authoritative one, which is provably correct and cannot
-- lose data: no balance changes, and the accounts' reported worth is untouched.
--
-- Scoped by NOT EXISTS over all transactions (including soft-deleted ones), so
-- any account with history is left strictly alone — its opening balance is not
-- reconstructable this way and must not be guessed.
UPDATE public."Account" a
SET "openingBalance" = a."balance"
WHERE a."openingBalance" <> a."balance"
  AND NOT EXISTS (
    SELECT 1 FROM public."Transaction" t
    WHERE t."accountId" = a.id
       OR t."transferToAccountId" = a.id
  );
