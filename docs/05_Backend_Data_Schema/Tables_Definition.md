# Tables Definition — Kanaku Local Store (Dexie schema v15)

> Source: `frontend/src/lib/database.ts` (`OfflineSyncDB`). The local IndexedDB mirror is the **offline-first source of truth on device**. Each syncable row carries `syncStatus` (`pending|syncing|synced|conflict|failed`), local `++id`, and `cloudId`/`remoteId` after sync.

## Local tables (current effective schema, v15)
| Table | Primary/Indexes | Mirrors (Postgres) |
|---|---|---|
| `accounts` | `++id, remoteId, cloudId, type, isActive, syncStatus` | Account |
| `transactions` | `++id, remoteId, cloudId, type, accountId, category, date, syncStatus` | Transaction |
| `friends` | `++id, remoteId, cloudId, name, createdAt, syncStatus` | Friend |
| `loans` | `++id, remoteId, cloudId, type, status, dueDate, friendId, syncStatus` | Loan |
| `loanPayments` | `++id, loanId, date` | LoanPayment |
| `goals` | `++id, remoteId, cloudId, isGroupGoal, targetDate, syncStatus` | Goal |
| `goalContributions` | `++id, goalId, date` | GoalContribution |
| `groupExpenses` | `++id, remoteId, cloudId, date, syncStatus` | GroupExpense |
| `groups` | `id` | (group meta) |
| `investments` | `++id, remoteId, cloudId, assetType, positionStatus, assetCurrency, baseCurrency, syncStatus` | Investment |
| `gold` | `++id, type, unit, purchaseDate, cloudId` | GoldAsset |
| `budgets` | `id, category, period` | Budget |
| `budgetAlerts` | `++id, budgetId, type, isRead, triggeredAt` | (alerts) |
| `recurringTransactions` | `++id, cloudId, accountId, type, nextDueDate, status, syncStatus` | RecurringTransaction |
| `categories` | `id, type` | Category |
| `expenseCategories` | `id, type` | (category presets) |
| `toDoLists` | `++id, cloudId, ownerId, listType, createdAt, archived, syncStatus` | Todo (lists) |
| `toDoItems` | `++id, cloudId, listId, completed, dueDate, priority, assignedTo, syncStatus` | Todo (items) |
| `toDoListShares` | `++id, listId, sharedWithUserId` | (collaborators) |
| `notifications` | `++id, type, userId, isRead, createdAt, remoteId` | Notification |
| `financeAdvisors` | `++id, verified, rating` | (advisor profiles) |
| `advisorSessions` | `++id, advisorId, date, status` | AdvisorSession |
| `advisorAssignments` | `++id, advisorId, userId, status` | (assignments) |
| `chatConversations` | `++id, conversationId, advisorId, userId` | (chat) |
| `chatMessages` | `++id, conversationId, timestamp, isRead` | ChatMessage |
| `bookingRequests` | `++id, advisorId, userId, status, createdAt, sequenceNumber` | BookingRequest |
| `expenseBills` | `++id, transactionId, uploadedAt` | ExpenseBill |
| `documents` | `++id, documentType, userId, processingStatus, uploadDate, accountId` | (receipts/docs) |
| `smsTransactions` | `++id, &sourceSmsId, userId, status, transactionType, date, matchedAccountId, linkedTransactionId, detectedAt` | (SMS detection) |
| `merchantProfiles` | `++id, normalizedName, suggestedCategory, userId, updatedAt` | (categorization) |
| `userCategoryPreferences` | `++id, merchantKey, keywordKey, userId, updatedAt` | (learning) |
| `importHistories` | `++id, createdAt, fileType, sourceKind, userId` | ImportLog |
| `syncQueue` | `++id, userId, table, status, createdAt` | SyncQueue |
| `syncEventLogs` | `++id, userId, eventType, timestamp` | (sync audit) |
| `settings` | `key` | UserSettings |
| `backups` | `id, timestamp` | (local backups) |
| `logs` | `id, level, timestamp` | (client logs) |
| `errorReports` | `id, timestamp` | (client errors) |

## Schema evolution (versions 1→15)
- v12: baseline of most tables above.
- **v13**: `toDoLists.listType` + `toDoItems.assignedTo` (Together vs Individual lists, assignees).
- **v14**: `recurringTransactions` + `budgetAlerts`.
- **v15**: index `gold.cloudId` for cross-device dedupe/merge parity.

## Prisma reference (server)
See `Database_Schema.md`. Field-name parity is enforced via `cloudId` (camelCase) across `backend-sync-service.ts`, `sync-service.ts`, `offline-sync-engine.ts`.

## Local-first rules
- Local write first → `syncStatus='pending'` → optimistic UI.
- `clientId` (uuid v4) used as `Idempotency-Key`.
- Backoff: 2s → 4s → 8s → 30s → 2m → 10m.
- Conflict: last-write-wins per field, **but monetary fields always defer to server**.

