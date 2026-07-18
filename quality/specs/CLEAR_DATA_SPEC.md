# Clear Data — Official Specification

> **Version**: 10.7  
> **Response Schema Version**: 1  
> **Status**: Production-Ready  
> **Endpoint**: `POST /api/v1/settings/clear-data`  
> **Last Updated**: 2026-07-18

---

## 1. User Intent

When a user presses **Clear All Data**, the system must behave exactly like a **brand-new account**, except for their identity.

The user's expectation is:

> "Make my account completely empty, as if I signed up today."

NOT:

> "Erase the system's history of my account."

These are different things. The first is user data. The second is operational history. Only user data is deleted.

---

## 2. MUST PRESERVE

The following must never be deleted by a factory reset.

| Category | Fields |
|---|---|
| **Identity** | `User` row, email, phone, avatar, display name |
| **Authentication** | Refresh token (current session stays active), JWT claims |
| **Audit History** | `AuditLog` (append-only, DB trigger enforces this — `P0001` on DELETE) |
| **Event Store** | `FinancialEvent` / `OutboxMessage` (operational replay history) |
| **System Logs** | Any system-level cron or platform logs |
| **Preferences** | `UserSettings` row is **reset to defaults**, not deleted |

---

## 3. MUST DELETE

Everything the user created must be deleted.

### Financial Core
- Accounts, Transactions, Journal Entries, Transfers

### Goals
- Goals, Goal Contributions, Goal Members

### Budgets, Loans, Investments & Assets
- Budgets, Loans, Loan Payments, Investments, Gold Assets

### Recurring
- Recurring Transaction Rules, Recurring Executions

### Groups & Social
- Friends, Group Expenses, Group Expense Members

### Notifications & Devices
- Notifications, Devices

### Account Aggregator (Open Banking)
- AA Consents, AA Consent Artifacts, AA Data Sessions, AA Financial Data, AA Transactions

### AI & Import
- AI Scans, AI Insights, AI Events, Import Logs

### Communication & Advisor
- Chat Messages, OTP Codes, OTP Requests
- Advisor Sessions, Advisor Availability, Advisor Applications, Booking Requests, Advisor Payments

### Uploads & Receipts
- Expense Bills (DB row + Supabase Storage file)

### Sync & Offline
- Sync Queue, Collaboration Participants

### Todos
- Todos (todo_lists, todo_items, todo_list_shares)

### Derived / Snapshot Tables
- Daily Account Balance, Monthly Category Spend, Monthly Cashflow

### Misc
- User Features, User Learning

---

## 4. MUST RESET

After the reset, all counters and views must show zero:

| View | Expected State |
|---|---|
| Dashboard — Income | 0 |
| Dashboard — Expense | 0 |
| Dashboard — Balance | 0 |
| Dashboard — Net Worth | 0 |
| Dashboard — Recent Transactions | `[]` |
| Dashboard — Charts | `[]` |
| Dashboard — Insights | `[]` |
| Monthly Statistics | All zeros |
| Budget progress | All zeros |
| Notification badge | 0 |
| Recent Activity | Empty |

---

## 5. POST-RESET API CONTRACT

After a successful factory reset, the following endpoints **must** return empty:

```
GET /api/v1/accounts              → []
GET /api/v1/transactions          → []
GET /api/v1/goals                 → []
GET /api/v1/budgets               → []
GET /api/v1/friends               → []
GET /api/v1/group-expenses        → []
GET /api/v1/notifications         → []
GET /api/v1/recurring             → []
GET /api/v1/dashboard             → { income: 0, expense: 0, balance: 0, netWorth: 0,
                                      recentTransactions: [], charts: [], insights: [] }
GET /api/v1/reports/cashflow      → { income: 0, expense: 0 }
GET /api/v1/reports/category      → []
GET /api/v1/search/transactions   → []
GET /api/v1/ai/insights           → []
```

Any endpoint returning non-empty data after a reset is a **regression** and must be investigated immediately.

---

## 6. Authorization Contract

The endpoint must verify the following on every request, **before** performing any work:

| Check | Requirement |
|---|---|
| **Authenticated** | Request must carry a valid, non-expired JWT |
| **Active account** | The `User` row for this userId must exist and not be soft-deleted |
| **Self-only** | `userId` from the JWT must match the resource being reset — a user cannot reset another user's data |
| **Service/admin tokens** | Service accounts and admin tokens must not be able to trigger a reset for an arbitrary user without an explicit `targetUserId` scope that is logged and alerted |
| **Re-authentication** | A fresh auth challenge must be completed before the reset is accepted (see §7) |

Authorization failures return `403 Forbidden` before any advisory lock is acquired.

---

## 7. Re-Authentication Requirement

A factory reset is one of the highest-risk operations in the application. A valid session alone is not sufficient.

Before the reset executes, the client must prove the user is physically present.

### Required challenge (choose one based on platform capability):

| Method | Condition |
|---|---|
| **OTP via email/SMS** | Always available as fallback |
| **Password re-entry** | If user has a password-based account |
| **Biometric** | If platform supports biometric confirmation |

### Flow:

```
1. Client calls POST /api/v1/settings/clear-data/challenge
   → Server generates a one-time challenge token (TTL: 5 minutes)
   → Server sends OTP to registered email/phone

2. User enters OTP

3. Client calls POST /api/v1/settings/clear-data
   with header: X-Reset-Challenge-Token: {challengeToken}

4. Server verifies challengeToken
   → Valid: proceed with reset
   → Invalid / expired: 401 CHALLENGE_REQUIRED

5. Challenge token is consumed (single-use)
```

### Implementation notes:
- Challenge tokens are stored in `OtpCode` table (already exists)
- Challenge tokens are **not** the same as the idempotency key
- The challenge must be re-issued if more than 5 minutes elapse
- The challenge token is invalidated immediately after the reset begins (whether it succeeds or fails)

> **Current status**: Not yet implemented. This is a hard production requirement before general availability.

---

## 8. Rate Limiting

The endpoint is protected by two rate limit tiers:

| Tier | Limit | Window | Response |
|---|---|---|---|
| **Per user** | 3 resets | 1 hour | `429 Too Many Requests` |
| **Per IP** | 20 requests | 1 hour | `429 Too Many Requests` |

Rate limit headers are returned on all responses:

```
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 2
X-RateLimit-Reset: 1721310600
```

Dry-run requests (`?dryRun=true`) count toward the IP limit but **not** the per-user limit.

> **Current status**: Not yet implemented. Required before general availability.

---

## 9. UserSettings Reset Values

The `UserSettings` row is **not deleted**. It is reset to factory defaults:

```json
{
  "theme": "light",
  "language": "en",
  "currency": "USD",
  "timezone": "UTC",
  "settings": {}
}
```

Audit fields updated on every reset:

| Field | Behavior |
|---|---|
| `lastFactoryResetAt` | Set to current UTC timestamp |
| `factoryResetCount` | Incremented by 1 |
| `factoryResetVersion` | Incremented integer (1, 2, 3, …) |

---

## 10. FactoryResetId

Every reset receives a unique, structured identifier:

```
Format:  FR-{YYYYMMDD}-{12 hex chars}
Example: FR-20260718-919fb955496a
```

This ID is included in the HTTP response, in the dry-run response, and in all three event store entries (`STARTED` / `COMPLETED` / `FAILED`). Support can find any reset in the event store instantly using this ID.

---

## 11. FactoryResetVersion String

Every reset carries a human-readable schema version tag:

```
factoryResetVersion: "10.7"
```

This reflects the version of the reset *procedure* — not the user's reset count. When the set of deleted tables changes, bump this string (e.g. `"10.8"`, `"11.0"`). Support can immediately know which tables were in scope for that reset.

---

## 12. Response Schema Version

The response format is independently versioned from the reset procedure:

```json
{
  "responseVersion": 1,
  "factoryResetVersion": "10.7"
}
```

`responseVersion` is incremented when the shape of the response changes (fields added, renamed, or removed). `factoryResetVersion` is incremented when the set of deleted tables changes. These evolve independently.

---

## 13. Phase Timing Report

Every response includes per-phase timing in milliseconds:

```json
{
  "timings": {
    "phase0": 24,
    "phase1": 312,
    "phase2": 15,
    "phase3": 420,
    "phase4": 4,
    "phase5": 11
  },
  "durationMs": 786
}
```

| Phase | Description |
|---|---|
| `phase0` | Pre-fetch storage paths (Supabase receipt files) |
| `phase1` | All DB deletions inside the Prisma transaction |
| `phase2` | In-transaction verification counts |
| `phase3` | Supabase Storage file cleanup |
| `phase4` | Cache bust |
| `phase5` | Post-commit integrity + application-layer checks |

---

## 14. Two-Layer Verification

### Layer 1 — In-transaction DB counts (Phase 2)

Inside the Prisma transaction (before `COMMIT`), all primary tables are counted. If any count > 0, `VERIFY_FAILED` is thrown and the entire transaction rolls back. Tables verified:

`accounts`, `transactions`, `goals`, `loans`, `budgets`, `friends`, `investments`, `recurringTransactions`, `syncQueues`, `expenseBills`, `aaConsents`, `dailyBalances`, `monthlySpend`, `monthlyCashflow`

### Layer 2 — Post-commit application-layer (Phase 5)

After `COMMIT`, the following are verified using the same queries the public API uses (soft-delete aware):

**Base resources:**
- `accounts`, `transactions`, `budgets`, `goals`, `friends`, `notifications`, `recurringTransactions`

**Aggregated/computed resources:**
- Dashboard totals (income, expense, balance, net worth)
- Cashflow summary (income, expense)
- Category spending totals
- AI insights count
- Notification badge count

If any of these returns non-zero or non-empty, `integrity.status` is set to `"warning"`. This catches stale caches and computed aggregates that base-table verification cannot detect.

```
integrity.status = "clean"    all checks passed
integrity.status = "warning"  data deleted but residual found post-commit
```

---

## 15. Concurrency Protection

Only one factory reset may run per user at a time.

- A **PostgreSQL session-level advisory lock** is acquired before any work begins.
- If already locked → `409 CLEAR_ALREADY_RUNNING`.
- Lock covers all phases (DB + storage + cache + event logging), released in `finally`.
- Session-level (not transaction-level) so the lock survives past `COMMIT`.

---

## 16. Worker Safety

- User ID is added to `clearingDataUsers` (in-memory Set) before the transaction.
- **Recurring worker** skips rules owned by users in this set.
- **Notification outbox worker** skips notifications for users in this set.
- Set is cleared in `finally` — workers resume immediately after completion or failure.

> **Scalability note**: In-memory set is single-node only. For multi-instance deployments, migrate to a `clearingData: Boolean` flag on `UserSettings`.

---

## 17. Idempotency

The endpoint accepts an `Idempotency-Key` header.

- Key is scoped: `idempotency:{userId}:clearAllUserData:{clientKey}`
- Cached for 10 minutes. Replays return the original response without re-running the reset.
- Prevents accidental double-resets on frontend retry.

---

## 18. Dry Run Mode

`POST /api/v1/settings/clear-data?dryRun=true`

Returns a preview of what would be deleted and an estimated duration, without mutating any data. Includes `factoryResetId` and `factoryResetVersion` for traceability.

No re-authentication challenge is required for dry-run. Rate limited per-IP only.

---

## 19. Supabase Storage Orphan Cleanup Policy

The database transaction commits **before** Supabase Storage files are deleted. If storage cleanup fails after commit, the DB rows are gone but the files remain (orphaned).

### Handling strategy:

| Scenario | Action |
|---|---|
| **Cleanup succeeds** | `storage.failed = 0` in response. No follow-up needed. |
| **Cleanup partially fails** | `storage.failed > 0` in response. Paths are logged. Retry job picks them up. |
| **Cleanup entirely fails** | Same as above. Alert fires if `storage.failed = storage.attempted`. |

### Retry job:

- A background job runs on a schedule (e.g. daily) that queries for `ExpenseBill` rows where `deletedAt IS NOT NULL` and the Supabase object still exists.
- It attempts deletion with exponential backoff.
- After N failed attempts, the path is flagged for manual review in an admin dashboard.

> **Current status**: Retry job not yet implemented. Storage failure paths are currently logged in the reset response and in the `FACTORY_RESET_COMPLETED` event payload. Manual cleanup is required for any `storage.failed > 0` case until the job is built.

---

## 20. Event Store Lifecycle

Three events are written to `FinancialEvent` (outside the deletions transaction — never rolled back):

| Event | When | Payload |
|---|---|---|
| `FACTORY_RESET_STARTED` | After advisory lock acquired | `factoryResetId`, `factoryResetVersion` |
| `FACTORY_RESET_COMPLETED` | After all phases succeed | `factoryResetId`, `factoryResetVersion`, `durationMs`, `timings`, `summary`, `integrity` |
| `FACTORY_RESET_FAILED` | In catch block | `factoryResetId`, `factoryResetVersion`, `error`, `durationMs` |

---

## 21. Monitoring & Alerting

The following operational thresholds must be configured in the monitoring platform:

| Metric | Alert Condition | Severity |
|---|---|---|
| `FACTORY_RESET_FAILED` event rate | > 5% of resets in any 1-hour window | **High** |
| Reset `durationMs` p95 | Increases by > 50% vs. 7-day baseline | **Medium** |
| Advisory lock hold time | Any lock held > 60 seconds | **High** |
| `storage.failed > 0` | Any reset where storage cleanup partially failed | **Medium** |
| `integrity.status = "warning"` | Any reset where post-commit verification found residual data | **High** |
| Reset count per user | > 3 resets in 1 hour (even if rate-limited, alert for investigation) | **Low** |
| Reset count per IP | > 20 requests in 1 hour | **Medium** |

All alerts should include the `factoryResetId` in the notification body so the incident can be traced immediately.

---

## 22. Response Shape

```json
{
  "responseVersion": 1,
  "success": true,
  "factoryResetId": "FR-20260718-919fb955496a",
  "factoryResetVersion": "10.7",
  "durationMs": 786,
  "timings": {
    "phase0": 24,
    "phase1": 312,
    "phase2": 15,
    "phase3": 420,
    "phase4": 4,
    "phase5": 11
  },
  "resetMetadata": {
    "lastFactoryResetAt": "2026-07-18T04:20:00.000Z",
    "factoryResetVersion": 3
  },
  "summary": {
    "financial": { "accounts": 2, "transactions": 145, "journalEntries": 290 },
    "goals": { "goals": 2, "goalContributions": 10, "goalMembers": 3 },
    "groups": { "groupExpenses": 1, "groupExpenseMembers": 4 },
    "loans": { "loans": 1, "loanPayments": 5 },
    "investments": { "investments": 3 },
    "gold": { "goldAssets": 0 },
    "budgets": { "budgets": 4 },
    "recurring": { "recurringTransactions": 2, "recurringExecutions": 8 },
    "social": { "friends": 5, "notifications": 22, "devices": 1, "todos": 3 },
    "advisor": { "advisorSessions": 0, "bookingRequests": 0 },
    "data": { "importLogs": 2, "aiScans": 1, "aiInsights": 3 },
    "aa": { "aaConsents": 0, "aaDataSessions": 0 },
    "uploads": { "expenseBills": 7 },
    "snapshots": { "dailyBalances": 30, "monthlySpends": 24, "monthlyCashflows": 12 }
  },
  "verification": {
    "accounts": 0, "transactions": 0, "goals": 0, "budgets": 0,
    "friends": 0, "dailyBalances": 0, "monthlyCashflow": 0
  },
  "storage": {
    "attempted": 7,
    "succeeded": 7,
    "failed": 0,
    "errors": []
  },
  "integrity": {
    "orphanTransactions": 0,
    "orphanJournalEntries": 0,
    "appLayerEmpty": true,
    "status": "clean"
  },
  "preserved": {
    "auditLog": "append-only — DB trigger prevents deletion",
    "financialEvents": "event store — replay / audit history",
    "refreshTokens": "kept — current session remains active",
    "userProfile": "kept — identity preserved",
    "userSettings": "reset to factory defaults"
  },
  "clientActions": {
    "clearDexie": true,
    "clearReactQuery": true,
    "clearBroadcastChannel": true,
    "reload": true
  }
}
```

---

## 23. Error Responses

| Status | Code | Meaning |
|---|---|---|
| `401` | `CHALLENGE_REQUIRED` | Re-authentication challenge missing or expired |
| `403` | `FORBIDDEN` | Authorization check failed (wrong user, inactive account) |
| `409` | `CLEAR_ALREADY_RUNNING` | Another reset is in progress for this user |
| `429` | `RATE_LIMITED` | Per-user or per-IP limit exceeded |
| `500` | `VERIFY_FAILED` | In-transaction count > 0; entire operation rolled back, no data lost |
| `500` | — | Unexpected error; check event store using `factoryResetId` |

---

## 24. Client Responsibilities

On receiving `200` with `success: true`:

1. Clear **Dexie** (IndexedDB offline cache)
2. Clear **React Query** cache (all queries)
3. Clear **BroadcastChannel** messages
4. Hard reload the app

Skipping any step may leave stale data visible in the UI. The `clientActions` field in the response confirms which steps are expected.

---

## 25. Support Runbook

### Find a reset by FactoryResetId

```sql
SELECT *
FROM financial_events
WHERE payload->>'factoryResetId' = 'FR-20260718-919fb955496a'
ORDER BY created_at ASC;
```

This returns up to three rows: `FACTORY_RESET_STARTED`, `FACTORY_RESET_COMPLETED` or `FACTORY_RESET_FAILED`.

---

### Inspect what was deleted

The `FACTORY_RESET_COMPLETED` event payload includes the full `summary` object listing row counts for every table category. This is the source of truth for what was removed.

---

### Handle storage.failed > 0

1. Look up the `FACTORY_RESET_COMPLETED` event for the `factoryResetId`.
2. The payload includes `storage.errors` listing the failed file paths.
3. Attempt manual deletion via the Supabase Storage dashboard or CLI:
   ```bash
   supabase storage rm receipts/{userId}/{filename}
   ```
4. If files cannot be found (already gone), mark as resolved.
5. Log the incident in the orphan cleanup tracker.

---

### Handle integrity.status = "warning"

1. Query the listed endpoint directly for that user to confirm whether data is actually present.
2. If data is present:
   - Check if a worker ran between commit and verification (race condition).
   - Check if the cache was not fully invalidated.
   - Run `cacheDeleteByUserId(userId)` manually if needed.
3. If data is not actually present (false positive): document and close.
4. If data is genuinely present: escalate — this is a data integrity failure.

---

### Handle FACTORY_RESET_FAILED

1. Find the failed event by `factoryResetId` to read the error message.
2. If `VERIFY_FAILED:tableName:count`: the transaction was rolled back. No data was deleted. The user's account is intact. They can retry.
3. If the error occurred after `FACTORY_RESET_STARTED` but no `FACTORY_RESET_COMPLETED` was written: the transaction may have committed but post-commit steps failed. Query the user's tables directly to assess state.
4. Release any stuck advisory lock (if the process died without reaching `finally`):
   ```sql
   SELECT pg_advisory_unlock({lockKey});
   -- or restart the server process if the connection is gone
   ```

---

### Manually reconcile a failed reset

If the DB state is inconsistent after a failed reset:

1. Identify which tables still have data using `summary` from the event payload.
2. Run targeted deletes in the correct FK order (child tables before parents).
3. Re-run `cacheDeleteByUserId(userId)` after manual cleanup.
4. Write a manual `FACTORY_RESET_COMPLETED` event noting the manual intervention.

---

## 26. Out of Scope (Next Priorities)

The following are not addressed by this spec version and are tracked separately:

- **Chaos testing** — concurrent reset races, mid-reset worker fires, network disconnects, second-tab refresh during reset
- **Performance benchmarking** — 250K transactions, 100 accounts, production-scale load measurement per phase
- **Storage orphan retry job** — scheduled background job to clean up `storage.failed` paths automatically
- **Admin dashboard** — visibility into orphaned files, `integrity.status = "warning"` resets, lock incidents
- **Re-authentication implementation** — challenge endpoint, OTP flow, biometric integration (§7 above is the spec; this tracks the work)
- **Rate limiting implementation** — middleware configuration (§8 above is the spec; this tracks the work)
