# Kanaku — Database Architecture (Beta Audit Snapshot, 2026-07-19)

Source of truth: [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma) (1,407 lines, **53 models**).
Full table/ERD documentation: [05_DATABASE_SCHEMA.md](../05_DATABASE_SCHEMA.md).
Migration workflow: [DATABASE_MIGRATIONS.md](../DATABASE_MIGRATIONS.md).

## Platform

Supabase PostgreSQL. App connects through pgbouncer (`:6543`, transaction pooling) with
`DIRECT_URL` (`:5432`) for migrations. Client DB: Dexie/IndexedDB schema v15 (offline-first mirror).

## Domain map (53 models)

| Domain | Models |
|---|---|
| Identity & auth | User, profiles, RefreshToken, Device, OtpRequest, user_features |
| Core finance | Account, Transaction, Category, RecurringTransaction, RecurringExecution, Budget |
| Ledger V2 / audit | JournalEntry, FinancialEvent (event store), AuditLog |
| Snapshots | DailyAccountBalance, MonthlyCategorySpend, MonthlyCashflow |
| Wealth | Investment, GoldAsset, Loan, LoanPayment, Goal, GoalContribution, GoalMember |
| Social | Friend, GroupExpense, GroupExpenseMember, CollaborationParticipant |
| Advisor marketplace | AdvisorApplication, AdvisorAvailability, AdvisorSession, BookingRequest, Payment, ChatMessage |
| Documents | ExpenseBill (sha256-deduped), ImportLog |
| Sync & messaging | SyncQueue, Notification, Todo (+ lists/shares) |
| AA (Phase 5, dormant) | AaConsent, AaConsentArtifact, AaDataSession, AaFinancialData, AaTransaction |
| AI ops | ai_runs (+ related) |

## Integrity verification results

| Check | Result |
|---|---|
| Every tenant-owned table has `userId` + `@@index([userId])` | ✅ verified across schema |
| Money columns use `Decimal`, never float | ✅ |
| Soft delete (`deletedAt` + index) on financial entities | ✅ Account, Transaction, Goal, Loan, LoanPayment, Budget, GoldAsset, Investment, RecurringTransaction, Notification, GroupExpenseMember, GoalMember |
| Idempotency shield | ✅ `Transaction @@unique([userId, sourceModule, idempotencyKey])`; `RecurringExecution @@unique([ruleId, scheduledDate])` |
| Ledger sequence uniqueness | ✅ `Transaction.sequenceNumber @unique` |
| Snapshot dedup constraints | ✅ `DailyAccountBalance @@unique([accountId, date])`, `MonthlyCategorySpend @@unique([userId, year, month, category])`, `MonthlyCashflow @@unique([userId, year, month])` |
| Referential actions | 43 × `onDelete: Cascade` (children of user/account), 3 × SetNull/Restrict (JournalEntry link is SetNull so deleting a journal never orphan-deletes money rows) |
| Hot-path composite indexes | ✅ e.g. Transaction `[userId,date]`, `[userId,type,date]`, `[userId,category,date]`, `[userId,accountId,date]`, `[userId,deletedAt,date]`; Notification `[userId,isRead,createdAt]`, `[status,nextRetryAt]`; Device `[userId,isActive]` |
| Orphan detection | `GET /system/integrity` runs live orphan-transaction / orphan-group-member / duplicate-sequence / duplicate-idempotency audits (admin-only) |
| Index audit tooling | `quality/database/index_audit.sql`, concurrency test, ledger integrity check, disaster-recovery validation (`quality/database/`) |

## Migrations

Baseline `00000000000000_init` + 5 incremental (tax-calc removal, registration integrity,
sync schema drift, **PII drop**, todo indexes). `migration_lock.toml` = postgresql.
CI pushes schema to a disposable Postgres service per run; production applies via
`prisma migrate deploy` (see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)).

## Notes & recommendations

1. **Test DB isolation:** integration tests run against a `staging_kanakku` database on the
   production cluster through a 15-client session pool — full-suite runs exhaust the pool
   (root cause of CI-style flakiness; see TEST_RESULTS.md). Recommendation: dedicated test
   database with a direct (non-pooled) connection or a local Postgres for full-suite runs.
2. **Dormant tables:** the 5 AA models are empty until Phase 5 ships (mount-gated). Keep.
3. Legacy SQL helper scripts in `backend/` root (`schema*.sql`, `create_*.sql`,
   `add_profile_columns.sql`) predate Prisma migrations — archive to avoid confusion
   (tracked in CODE_QUALITY_REPORT).
