-- KANAKKU - Database Index Audit & Query Explain Plans
-- This script contains EXPLAIN ANALYZE statements for high-traffic read paths
-- to identify execution plan bottlenecks and ensure optimal index coverage.
-- Run this against your Postgres database client to audit query cost.

-- 1. Dashboard monthly aggregates
-- Verifies index: @@index([userId, type, date]) or @@index([userId, deletedAt, date])
EXPLAIN ANALYZE 
SELECT 
  type,
  COALESCE(SUM(amount), 0)::float as total
FROM "Transaction" 
WHERE "userId" = 'da6d92bf-33ab-41c6-a675-ea285f524021' 
  AND "deletedAt" IS NULL 
  AND "status" = 'POSTED'
  AND "date" >= '2026-07-01 00:00:00' 
  AND "date" <= '2026-07-31 23:59:59'
GROUP BY type;

-- 2. Transactions list with status and account filtering
-- Verifies index: @@index([userId, accountId, date])
EXPLAIN ANALYZE 
SELECT * 
FROM "Transaction" 
WHERE "userId" = 'da6d92bf-33ab-41c6-a675-ea285f524021' 
  AND "deletedAt" IS NULL 
  AND "accountId" = 'some-account-uuid'
ORDER BY "date" DESC 
LIMIT 20;

-- 3. Group expense members & settlements
-- Verifies index on GroupExpenseMember: (userId) or composite (groupExpenseId, userId)
EXPLAIN ANALYZE 
SELECT gem.*, ge.description, ge.amount as total_amount
FROM "GroupExpenseMember" gem
JOIN "group_expenses" ge ON gem."groupExpenseId" = ge.id
WHERE gem."userId" = 'da6d92bf-33ab-41c6-a675-ea285f524021' 
  AND gem."deletedAt" IS NULL;

-- 4. Recurring transaction worker query
-- Verifies index: @@index([userId, status, nextDueDate])
EXPLAIN ANALYZE 
SELECT * 
FROM "RecurringTransaction" 
WHERE "status" = 'PENDING' 
  AND "nextDueDate" <= NOW() 
  AND "deletedAt" IS NULL;

-- 5. System Integrity - Journal double-entry balance check
-- Verifies index: @@index([journalEntryId])
EXPLAIN ANALYZE 
SELECT 
  "journalEntryId",
  COUNT(*)::int as legs_count,
  COALESCE(SUM(CASE WHEN UPPER(type) IN ('EXPENSE', 'TRANSFER_OUT') THEN amount ELSE 0 END), 0)::float as credits,
  COALESCE(SUM(CASE WHEN UPPER(type) IN ('INCOME', 'TRANSFER_IN') THEN amount ELSE 0 END), 0)::float as debits
FROM "Transaction"
WHERE "deletedAt" IS NULL AND "journalEntryId" IS NOT NULL
GROUP BY "journalEntryId"
HAVING COUNT(*) > 1 AND SUM(CASE WHEN UPPER(type) IN ('EXPENSE', 'TRANSFER_OUT') THEN amount ELSE 0 END) != SUM(CASE WHEN UPPER(type) IN ('INCOME', 'TRANSFER_IN') THEN amount ELSE 0 END);
