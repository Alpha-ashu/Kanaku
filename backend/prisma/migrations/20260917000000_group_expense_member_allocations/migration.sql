-- Migration: group_expense_member_allocations
-- Purpose:
--   Member-level allocation for group expenses (equal / custom / percentage /
--   shares splits) and "who paid" separate from "who owes".
--
--   GroupExpenseMember.contributedAmount  amount the member paid towards the bill
--   GroupExpenseMember.splitValue         raw split input (amount / percent / units), NULL = auto
--   group_expenses.yourPaidAmount         the creator's contribution (creator has no member row);
--                                         NULL on existing rows = creator paid the whole bill
--   group_expenses.yourSplitValue         the creator's raw split input
--   group_expenses.yourSettledAt          the creator settled what they owed
--
-- Additive and idempotent (safe to re-run, and safe on db-push managed databases).

ALTER TABLE "public"."group_expenses"
  ADD COLUMN IF NOT EXISTS "yourPaidAmount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "yourSplitValue" DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS "yourSettledAt" TIMESTAMP(3);

ALTER TABLE "public"."GroupExpenseMember"
  ADD COLUMN IF NOT EXISTS "contributedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "splitValue" DECIMAL(12,4);
