# DATA INTEGRITY AUDIT REPORT
**Generated:** 2026-07-15T04:56:29.367Z
**Scope:** Ledger balance reconciliation, orphan records, duplicate detection, transfer integrity

### ✅ User table accessible & non-empty
- **Severity:** CRITICAL
- **Result:** PASS — 165 users in database
- **Query time:** 250ms

### ✅ Account table accessible
- **Severity:** CRITICAL
- **Result:** PASS — 83 active accounts
- **Query time:** 243ms

### ✅ Transaction table accessible
- **Severity:** CRITICAL
- **Result:** PASS — 357 active transactions
- **Query time:** 260ms

### ✅ Account balance = openingBalance + SUM(transactions)
- **Severity:** CRITICAL
- **Result:** PASS — All account balances reconcile correctly
- **Query time:** 265ms

### ✅ Zero orphan transactions (userId not in User table)
- **Severity:** CRITICAL
- **Result:** PASS — No orphan transactions
- **Query time:** 249ms

### ✅ Zero orphan loan payments (loanId not in Loan table)
- **Severity:** CRITICAL
- **Result:** PASS — No orphan loan payments
- **Query time:** 259ms

### ✅ Zero orphan goal contributions (goalId not in Goal table)
- **Severity:** CRITICAL
- **Result:** PASS — No orphan goal contributions
- **Query time:** 270ms

### ✅ Zero duplicate dedupHash values in transactions
- **Severity:** HIGH
- **Result:** PASS — No duplicate dedupHash values
- **Query time:** 245ms

### ✅ AuditLog requestId column exists and is populated
- **Severity:** HIGH
- **Result:** PASS — 1127/1182 audit entries have requestId (95%)
- **Query time:** 277ms

### ✅ Negative account balances (informational)
- **Severity:** WARNING
- **Result:** PASS — 31 accounts have negative balance (by design — overspend is permitted)
- **Query time:** 243ms

### ✅ Transaction amounts are stored as DECIMAL(12,2) — no float drift
- **Severity:** HIGH
- **Result:** PASS — All amounts correctly stored as Decimal(12,2)
- **Query time:** 243ms

### ✅ todo_lists table accessible
- **Severity:** WARNING
- **Result:** PASS — 0 todo lists
- **Query time:** 244ms

### ✅ Todo indexes exist (user_id, list_id)
- **Severity:** WARNING
- **Result:** PASS — Todo indexes present: idx_todo_items_list_id, idx_todo_list_shares_shared_with, idx_todo_list_shares_list_id, idx_todo_lists_user_id
- **Query time:** 281ms

---
## Summary
| Status | Count |
|---|---|
| ✅ PASS | 13 |
| ❌ FAIL | 0 |
| ⚠️ WARN | 0 |

**Ledger integrity: CLEAN ✅**