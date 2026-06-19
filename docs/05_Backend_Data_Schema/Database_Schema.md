# Database Schema — Kanaku (Complete)

> System of record: PostgreSQL via Prisma (`backend/prisma/schema.prisma`). **48 models**. Monetary values use `Decimal(18,2)`; ownership via `userId`; snake_case columns via `@map`.

## Model inventory (Postgres)
| Domain | Models |
|---|---|
| Identity & access | `User`, `UserPin`, `UserSettings`, `RefreshToken`, `OtpCode`, `OtpRequest`, `Device`, `profiles`, `AuditLog`, `PlatformSettings`, `user_features` |
| Money core | `Account`, `Transaction`, `Category`, `RecurringTransaction`, `Budget`, `ImportLog`, `Payment` |
| Wealth | `Investment`, `GoldAsset`, `Goal`, `GoalContribution`, `GoalMember`, `Loan`, `LoanPayment`, `TaxCalculation` |
| Bills & receipts | `ExpenseBill`, `AiScan` |
| Social / collaboration | `Friend`, `GroupExpense`, `GroupExpenseMember`, `CollaborationParticipant`, `Todo`, `ChatMessage` |
| Advisory | `AdvisorApplication`, `AdvisorAvailability`, `AdvisorSession`, `BookingRequest` |
| Sync & ops | `SyncQueue`, `Notification` |
| AI | `ai_events`, `ai_insights`, `ai_model_runs` |
| Account Aggregator (Setu) | `AaConsent`, `AaConsentArtifact`, `AaDataSession`, `AaFinancialData`, `AaTransaction` |

## Key tables (representative columns)

### User
| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| email | varchar unique | |
| password | text | Argon2id (legacy self-heal from Supabase) |
| role | varchar | admin/manager/advisor/user |
| currency | char(3) | default currency |
| isApproved | bool | advisor approval |
| createdAt | timestamp | |

### Account
| id PK | userId FK | name | type (bank/card/cash/digital) | currency | balance `Decimal(18,2)` | isActive | syncStatus |

### Transaction
| id PK | userId FK | accountId FK | type (income/expense/transfer/withdrawal) | amount `Decimal(18,2)` | category | description | date | attachment (`document:{id}`) | importMetadata | createdAt |
- Balance writes wrapped in `prisma.$transaction`; idempotency via client `clientId`.

### Goal / GoalContribution / GoalMember
- `Goal`: target, current, targetDate, isGroupGoal. `GoalContribution`: goalId, amount, date. `GoalMember`: goalId, userId, share.

### Loan / LoanPayment
- `Loan`: type, principal, outstanding, interestRate, dueDate, friendId?, status. `LoanPayment`: loanId, amount, date.

### Investment / GoldAsset
- `Investment`: assetType, symbol, units, buyPrice, positionStatus, assetCurrency, baseCurrency. `GoldAsset`: type, unit, grams, purchaseDate, cloudId.

### Budget / RecurringTransaction / TaxCalculation
- `Budget`: category, period, limit, spent. `RecurringTransaction`: accountId, type, amount, frequency, nextDueDate, status. `TaxCalculation`: year, regime, inputs, result.

### Friend / GroupExpense / GroupExpenseMember
- Group splits map registered users via `GroupExpenseMember`; realtime via Socket.IO.

### Advisor domain
- `AdvisorApplication` (KYC docs, status), `AdvisorAvailability` (slots), `AdvisorSession` (status: pending/confirmed/in_session/completed/cancelled, notes), `BookingRequest` (sequenceNumber).

### AA (Setu) — encrypted at rest (AES-256-GCM, per-user DEK)
- `AaConsent`, `AaConsentArtifact`, `AaDataSession`, `AaFinancialData`, `AaTransaction`.

### Platform/AI/Audit
- `user_features` (feature flags), `PlatformSettings`, `AuditLog`, `ai_events`, `ai_insights`, `ai_model_runs`, `SyncQueue`, `Notification`.

## Indexes & integrity
- `Transaction (userId, date)`, `Account (userId)`, idempotency keys in Redis (24h TTL).
- Foreign keys enforce ownership; deletes cascade per domain rules.
- Monetary mutations always atomic; server authoritative over client values.

See `Tables_Definition.md` for the **Dexie (local) schema v15** and `ER_Diagram.md` for relationships.

