# Database schema catalog

Auto-generated from [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma)
— the **single source of truth** (PostgreSQL via Prisma). 48 models.

> Regenerate with `npm run docs:catalogs`. Edit the Prisma schema, not this file.

**Models:** [`AaConsent`](#aaconsent) · [`AaConsentArtifact`](#aaconsentartifact) · [`AaDataSession`](#aadatasession) · [`AaFinancialData`](#aafinancialdata) · [`AaTransaction`](#aatransaction) · [`Account`](#account) · [`AdvisorApplication`](#advisorapplication) · [`AdvisorAvailability`](#advisoravailability) · [`AdvisorSession`](#advisorsession) · [`ai_events`](#ai_events) · [`ai_insights`](#ai_insights) · [`ai_model_runs`](#ai_model_runs) · [`AiScan`](#aiscan) · [`AuditLog`](#auditlog) · [`BookingRequest`](#bookingrequest) · [`Budget`](#budget) · [`Category`](#category) · [`ChatMessage`](#chatmessage) · [`CollaborationParticipant`](#collaborationparticipant) · [`Device`](#device) · [`ExpenseBill`](#expensebill) · [`Friend`](#friend) · [`Goal`](#goal) · [`GoalContribution`](#goalcontribution) · [`GoalMember`](#goalmember) · [`GoldAsset`](#goldasset) · [`GroupExpense`](#groupexpense) · [`GroupExpenseMember`](#groupexpensemember) · [`ImportLog`](#importlog) · [`Investment`](#investment) · [`Loan`](#loan) · [`LoanPayment`](#loanpayment) · [`Notification`](#notification) · [`OtpCode`](#otpcode) · [`OtpRequest`](#otprequest) · [`Payment`](#payment) · [`PlatformSettings`](#platformsettings) · [`profiles`](#profiles) · [`RecurringTransaction`](#recurringtransaction) · [`RefreshToken`](#refreshtoken) · [`SyncQueue`](#syncqueue) · [`TaxCalculation`](#taxcalculation) · [`Todo`](#todo) · [`Transaction`](#transaction) · [`User`](#user) · [`user_features`](#user_features) · [`UserPin`](#userpin) · [`UserSettings`](#usersettings)

---

### AaConsent

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `consentHandle` | `String?` |  |
| `consentId` | `String?` | unique |
| `vua` | `String?` |  |
| `status` | `String` | default "CREATED" |
| `purpose` | `String?` |  |
| `fiTypes` | `String?` |  |
| `consentTypes` | `String?` |  |
| `dataFrom` | `DateTime?` |  |
| `dataTo` | `DateTime?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
_None._

**Indexes / constraints:** `index([userId])` · `index([consentHandle])` · `index([status])`

---

### AaConsentArtifact

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `consentId` | `String` | unique |
| `artifactJson` | `String?` |  |
| `signature` | `String?` |  |
| `status` | `String?` |  |
| `createdAt` | `DateTime` | default now() |

**Relations:**
_None._

**Indexes / constraints:** _None._

---

### AaDataSession

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `consentId` | `String` |  |
| `sessionId` | `String` | unique |
| `sessionStatus` | `String` | default "ACTIVE" |
| `userId` | `String` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
_None._

**Indexes / constraints:** `index([consentId])` · `index([userId])`

---

### AaFinancialData

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `consentId` | `String` |  |
| `sessionId` | `String` |  |
| `accountType` | `String?` |  |
| `maskedAccountNumber` | `String?` |  |
| `dataJson` | `String?` |  |
| `createdAt` | `DateTime` | default now() |

**Relations:**
_None._

**Indexes / constraints:** `index([userId])` · `index([consentId])`

---

### AaTransaction

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `consentId` | `String` |  |
| `transactionDate` | `DateTime` |  |
| `amount` | `Decimal` | Decimal(12, 2) |
| `type` | `String` |  |
| `description` | `String?` |  |
| `maskedAccountNumber` | `String?` |  |
| `createdAt` | `DateTime` | default now() |

**Relations:**
_None._

**Indexes / constraints:** `index([userId])` · `index([consentId])` · `index([transactionDate])`

---

### Account

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `deviceId` | `String?` |  |
| `name` | `String` |  |
| `type` | `String` | default "bank" |
| `provider` | `String?` |  |
| `country` | `String?` |  |
| `balance` | `Decimal` | default 0, Decimal(12, 2) |
| `currency` | `String` | default "USD" |
| `isActive` | `Boolean` | default true |
| `syncStatus` | `String` | default "synced" |
| `clientRequestId` | `String?` | unique |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)
- `goalContributions` → **GoalContribution[]**
- `transactions` → **Transaction[]**
- `groupExpenses` → **GroupExpense[]**

**Indexes / constraints:** `index([isActive])` · `index([syncStatus])` · `index([userId])` · `index([createdAt])` · `index([deletedAt])`

---

### AdvisorApplication

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` | unique |
| `fullName` | `String` |  |
| `email` | `String` |  |
| `phone` | `String` |  |
| `experienceYears` | `Int` |  |
| `expertise` | `String` |  |
| `organizationName` | `String?` |  |
| `bio` | `String` |  |
| `panDocumentPath` | `String?` |  |
| `aadhaarDocumentPath` | `String?` |  |
| `certDocumentPath` | `String?` |  |
| `status` | `String` | default "PENDING" |
| `rejectionReason` | `String?` |  |
| `reviewedBy` | `String?` |  |
| `reviewedAt` | `DateTime?` |  |
| `submittedAt` | `DateTime` | default now() |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `user` → **User** (AdvisorApplication_user, fields: [userId], references: [id], onDelete: Cascade)
- `reviewer` → **User?** (AdvisorApplication_reviewer, fields: [reviewedBy], references: [id])

**Indexes / constraints:** `index([status])` · `index([userId])`

---

### AdvisorAvailability

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `advisorId` | `String` |  |
| `dayOfWeek` | `Int` |  |
| `startTime` | `String` |  |
| `endTime` | `String` |  |
| `isActive` | `Boolean` | default true |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `advisor` → **User** (fields: [advisorId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([advisorId])`

---

### AdvisorSession

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `bookingId` | `String` | unique |
| `advisorId` | `String` |  |
| `clientId` | `String` |  |
| `startTime` | `DateTime` |  |
| `endTime` | `DateTime?` |  |
| `sessionType` | `String` |  |
| `status` | `String` | default "scheduled" |
| `notes` | `String?` |  |
| `rating` | `Float?` |  |
| `feedback` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `advisor` → **User** (AdvisorSession_advisorIdToUser, fields: [advisorId], references: [id], onDelete: Cascade)
- `booking` → **BookingRequest** (fields: [bookingId], references: [id], onDelete: Cascade)
- `client` → **User** (AdvisorSession_clientIdToUser, fields: [clientId], references: [id], onDelete: Cascade)
- `chatMessages` → **ChatMessage[]**
- `payment` → **Payment?**

**Indexes / constraints:** `index([advisorId])` · `index([clientId])` · `index([startTime])` · `index([status])`

---

### ai_events

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK |
| `user_id` | `String` |  |
| `event_type` | `String` |  |
| `metadata_json` | `Json` |  |
| `created_at` | `DateTime` | default now() |

**Relations:**
_None._

**Indexes / constraints:** `index([created_at], map: "idx_ai_events_created_at")` · `index([event_type], map: "idx_ai_events_type")` · `index([user_id], map: "idx_ai_events_user_id")`

---

### ai_insights

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK |
| `user_id` | `String` |  |
| `insight_type` | `String` |  |
| `insight_data_json` | `Json` |  |
| `confidence_score` | `Float` |  |
| `created_at` | `DateTime` | default now() |

**Relations:**
_None._

**Indexes / constraints:** `index([created_at], map: "idx_ai_insights_created_at")` · `index([insight_type], map: "idx_ai_insights_type")` · `index([user_id], map: "idx_ai_insights_user_id")`

---

### ai_model_runs

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK |
| `run_type` | `String` |  |
| `status` | `String` |  |
| `started_at` | `DateTime` | default now() |
| `completed_at` | `DateTime?` |  |
| `processed_users` | `Int` | default 0 |
| `notes` | `String?` |  |

**Relations:**
_None._

**Indexes / constraints:** `index([started_at], map: "idx_ai_runs_started_at")` · `index([run_type], map: "idx_ai_runs_type")`

---

### AiScan

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `billId` | `String?` |  |
| `transactionId` | `String?` |  |
| `extractedJson` | `String` |  |
| `confidence` | `Float` |  |
| `provider` | `String` | default "gemini" |
| `processingMs` | `Int?` |  |
| `status` | `String` | default "completed" |
| `errorMessage` | `String?` |  |
| `createdAt` | `DateTime` | default now() |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([userId])` · `index([billId])` · `index([createdAt])`

---

### AuditLog

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `action` | `String` |  |
| `resource` | `String` |  |
| `status` | `String` |  |
| `ip` | `String?` |  |
| `userAgent` | `String?` |  |
| `details` | `Json?` |  |
| `createdAt` | `DateTime` | default now() |

**Relations:**
_None._

**Indexes / constraints:** `index([userId])` · `index([createdAt])`

---

### BookingRequest

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `clientId` | `String` |  |
| `advisorId` | `String` |  |
| `sessionType` | `String` |  |
| `description` | `String?` |  |
| `proposedDate` | `DateTime` |  |
| `proposedTime` | `String` |  |
| `duration` | `Int` |  |
| `amount` | `Decimal` | Decimal(12, 2) |
| `status` | `String` | default "pending" |
| `rejectionReason` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `session` → **AdvisorSession?**
- `advisor` → **User** (BookingRequest_advisorIdToUser, fields: [advisorId], references: [id], onDelete: Cascade)
- `client` → **User** (BookingRequest_clientIdToUser, fields: [clientId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([advisorId])` · `index([clientId])` · `index([proposedDate])` · `index([status])`

---

### Budget

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `category` | `String` |  |
| `amount` | `Decimal` | Decimal(12, 2) |
| `spent` | `Decimal` | default 0, Decimal(12, 2) |
| `period` | `String` | default "monthly" |
| `threshold` | `Int` | default 80 |
| `startDate` | `DateTime?` |  |
| `endDate` | `DateTime?` |  |
| `alertEnabled` | `Boolean` | default true |
| `alertChannels` | `Json` | default "[\"app\"]" |
| `clientRequestId` | `String?` | unique |
| `syncStatus` | `String` | default "synced" |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `unique([userId, category, period])` · `index([userId])` · `index([category])` · `index([period])` · `index([syncStatus])` · `index([deletedAt])`

---

### Category

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `name` | `String` |  |
| `type` | `String` |  |
| `color` | `String` |  |
| `icon` | `String` |  |
| `createdFromImport` | `Boolean` | default false |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `unique([userId, name, type])` · `index([type])` · `index([userId])`

---

### ChatMessage

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `sessionId` | `String` |  |
| `senderId` | `String` |  |
| `message` | `String` |  |
| `timestamp` | `DateTime` | default now() |

**Relations:**
- `sender` → **User** (fields: [senderId], references: [id], onDelete: Cascade)
- `session` → **AdvisorSession** (fields: [sessionId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([senderId])` · `index([sessionId])` · `index([timestamp])`

---

### CollaborationParticipant

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `moduleType` | `String` |  |
| `moduleId` | `String` |  |
| `moduleName` | `String?` |  |
| `email` | `String` |  |
| `name` | `String?` |  |
| `userId` | `String?` |  |
| `status` | `String` | default "PENDING_REGISTRATION" |
| `invitedBy` | `String` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `linkedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User?** (CollaborationParticipant_user, fields: [userId], references: [id], onDelete: SetNull)
- `invitedByUser` → **User** (CollaborationParticipant_invitedBy, fields: [invitedBy], references: [id], onDelete: Cascade)

**Indexes / constraints:** `unique([moduleType, moduleId, email])` · `index([email])` · `index([status])` · `index([moduleType, moduleId])`

---

### Device

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `deviceId` | `String` | unique |
| `deviceName` | `String?` |  |
| `deviceType` | `String?` |  |
| `platform` | `String?` |  |
| `appVersion` | `String?` |  |
| `isActive` | `Boolean` | default true |
| `isTrusted` | `Boolean` | default false |
| `lastSeenAt` | `DateTime` | default now() |
| `fcmToken` | `String?` |  |
| `publicKey` | `String?` |  |
| `osType` | `String?` |  |
| `osVersion` | `String?` |  |
| `apnsToken` | `String?` |  |
| `lastSyncedAt` | `DateTime?` | default now() |
| `metadata` | `Json?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `unique([userId, deviceId], name: "userId_deviceId")` · `index([deviceId])` · `index([isActive])` · `index([userId])` · `index([fcmToken])` · `index([userId, isActive])`

---

### ExpenseBill

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `transactionId` | `String?` |  |
| `originalName` | `String` |  |
| `contentType` | `String` |  |
| `size` | `Int` |  |
| `storagePath` | `String` |  |
| `sha256` | `String` |  |
| `scanStatus` | `String` | default "pending" |
| `scanResult` | `String?` |  |
| `moderationStatus` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([sha256])` · `index([transactionId])` · `index([userId])`

---

### Friend

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `deviceId` | `String?` |  |
| `name` | `String` |  |
| `email` | `String?` |  |
| `phone` | `String?` |  |
| `avatar` | `String?` |  |
| `notes` | `String?` |  |
| `syncStatus` | `String` | default "synced" |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)
- `groupExpenseMembers` → **GroupExpenseMember[]**

**Indexes / constraints:** `index([syncStatus])` · `index([userId])`

---

### Goal

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `deviceId` | `String?` |  |
| `name` | `String` |  |
| `description` | `String?` |  |
| `targetAmount` | `Decimal` | Decimal(12, 2) |
| `currentAmount` | `Decimal` | default 0, Decimal(12, 2) |
| `targetDate` | `DateTime` |  |
| `category` | `String?` |  |
| `isGroupGoal` | `Boolean` | default false |
| `syncStatus` | `String` | default "synced" |
| `clientRequestId` | `String?` | unique |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)
- `goalContributions` → **GoalContribution[]**
- `goalMembers` → **GoalMember[]**

**Indexes / constraints:** `index([syncStatus])` · `index([targetDate])` · `index([userId])` · `index([createdAt])` · `index([deletedAt])`

---

### GoalContribution

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `goalId` | `String` |  |
| `accountId` | `String` |  |
| `amount` | `Decimal` | Decimal(12, 2) |
| `date` | `DateTime` |  |
| `memberName` | `String?` |  |
| `status` | `String?` |  |
| `notes` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `account` → **Account** (fields: [accountId], references: [id], onDelete: Cascade)
- `goal` → **Goal** (fields: [goalId], references: [id], onDelete: Cascade)
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([accountId])` · `index([date])` · `index([goalId])` · `index([userId])`

---

### GoalMember

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `goalId` | `String` |  |
| `userId` | `String?` |  |
| `name` | `String` |  |
| `email` | `String?` |  |
| `phone` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `goal` → **Goal** (fields: [goalId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([goalId])` · `index([userId])` · `index([deletedAt])`

---

### GoldAsset

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `type` | `String` | default "gold" |
| `quantity` | `Decimal` | Decimal(12, 4) |
| `unit` | `String` | default "gram" |
| `purchasePrice` | `Decimal` | Decimal(12, 2) |
| `currentPrice` | `Decimal` | Decimal(12, 2) |
| `purchaseDate` | `DateTime` |  |
| `purityPercentage` | `Decimal` | default 99.9, Decimal(5, 2) |
| `location` | `String?` |  |
| `certificateNumber` | `String?` |  |
| `notes` | `String?` |  |
| `clientRequestId` | `String?` | unique |
| `syncStatus` | `String` | default "synced" |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([userId])` · `index([type])` · `index([syncStatus])` · `index([deletedAt])`

---

### GroupExpense

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `deviceId` | `String?` |  |
| `name` | `String` |  |
| `totalAmount` | `Decimal` | Decimal(12, 2) |
| `paidBy` | `String?` |  |
| `date` | `DateTime` |  |
| `members` | `String?` |  |
| `items` | `String?` |  |
| `description` | `String?` |  |
| `category` | `String?` |  |
| `subcategory` | `String?` |  |
| `splitType` | `String?` |  |
| `yourShare` | `Decimal?` | Decimal(12, 2) |
| `expenseTransactionId` | `String?` |  |
| `createdBy` | `String?` |  |
| `createdByName` | `String?` |  |
| `status` | `String?` |  |
| `notificationStatus` | `String?` |  |
| `syncStatus` | `String` | default "synced" |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `transactions` → **Transaction[]**
- `paidByAccount` → **Account?** (fields: [paidBy], references: [id])
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)
- `groupMembers` → **GroupExpenseMember[]**

**Indexes / constraints:** `index([date])` · `index([paidBy])` · `index([syncStatus])` · `index([userId])`

---

### GroupExpenseMember

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `groupExpenseId` | `String` |  |
| `userId` | `String?` |  |
| `friendId` | `String?` |  |
| `name` | `String` |  |
| `email` | `String?` |  |
| `phone` | `String?` |  |
| `shareAmount` | `Decimal` | default 0, Decimal(12, 2) |
| `hasPaid` | `Boolean` | default false |
| `paidAt` | `DateTime?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `groupExpense` → **GroupExpense** (fields: [groupExpenseId], references: [id], onDelete: Cascade)
- `friend` → **Friend?** (fields: [friendId], references: [id], onDelete: SetNull)

**Indexes / constraints:** `index([groupExpenseId])` · `index([userId])` · `index([friendId])` · `index([deletedAt])`

---

### ImportLog

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `fileName` | `String` |  |
| `fileType` | `String` |  |
| `sourceKind` | `String` |  |
| `totalRecords` | `Int` |  |
| `importedRecords` | `Int` |  |
| `skippedRecords` | `Int` |  |
| `duplicateRecords` | `Int` |  |
| `createdCategories` | `Json` | default "[]" |
| `createdAccounts` | `Json` | default "[]" |
| `createdGoals` | `Json` | default "[]" |
| `updatedGoals` | `Json` | default "[]" |
| `failedRecords` | `Int` | default 0 |
| `errors` | `Json` | default "[]" |
| `metadata` | `String?` |  |
| `createdAt` | `DateTime` | default now() |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([createdAt])` · `index([sourceKind])` · `index([userId])`

---

### Investment

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `assetType` | `String` |  |
| `assetName` | `String` |  |
| `quantity` | `Decimal` | Decimal(12, 4) |
| `buyPrice` | `Decimal` | Decimal(12, 2) |
| `currentPrice` | `Decimal` | Decimal(12, 2) |
| `totalInvested` | `Decimal` | Decimal(12, 2) |
| `currentValue` | `Decimal` | Decimal(12, 2) |
| `profitLoss` | `Decimal` | Decimal(12, 2) |
| `purchaseDate` | `DateTime` |  |
| `lastUpdated` | `DateTime` |  |
| `metadata` | `Json?` |  |
| `clientRequestId` | `String?` | unique |
| `broker` | `String?` |  |
| `description` | `String?` |  |
| `assetCurrency` | `String?` |  |
| `baseCurrency` | `String?` |  |
| `buyFxRate` | `Decimal?` | Decimal(18, 8) |
| `lastKnownFxRate` | `Decimal?` | Decimal(18, 8) |
| `totalInvestedNative` | `Decimal?` | Decimal(18, 2) |
| `currentValueNative` | `Decimal?` | Decimal(18, 2) |
| `valuationVersion` | `Int?` |  |
| `positionStatus` | `String?` | default "open" |
| `closedAt` | `DateTime?` |  |
| `closePrice` | `Decimal?` | Decimal(18, 2) |
| `closeFxRate` | `Decimal?` | Decimal(18, 8) |
| `grossSaleValue` | `Decimal?` | Decimal(18, 2) |
| `netSaleValue` | `Decimal?` | Decimal(18, 2) |
| `purchaseFees` | `Decimal?` | Decimal(18, 2) |
| `closingFees` | `Decimal?` | Decimal(18, 2) |
| `realizedProfitLoss` | `Decimal?` | Decimal(18, 2) |
| `closeNotes` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([assetType])` · `index([userId])` · `index([deletedAt])` · `index([positionStatus])`

---

### Loan

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `deviceId` | `String?` |  |
| `type` | `String` |  |
| `name` | `String` |  |
| `principalAmount` | `Decimal` | Decimal(12, 2) |
| `outstandingBalance` | `Decimal` | Decimal(12, 2) |
| `interestRate` | `Decimal?` | Decimal(12, 2) |
| `emiAmount` | `Decimal?` | Decimal(12, 2) |
| `dueDate` | `DateTime?` |  |
| `frequency` | `String?` |  |
| `status` | `String` | default "active" |
| `contactPerson` | `String?` |  |
| `syncStatus` | `String` | default "synced" |
| `clientRequestId` | `String?` | unique |
| `totalPayable` | `Decimal?` | Decimal(12, 2) |
| `loanDate` | `DateTime?` |  |
| `contactEmail` | `String?` |  |
| `contactPhone` | `String?` |  |
| `bankName` | `String?` |  |
| `tenureMonths` | `Int?` |  |
| `downPayment` | `Decimal?` | Decimal(12, 2) |
| `loanCategory` | `String?` |  |
| `notes` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)
- `payments` → **LoanPayment[]**

**Indexes / constraints:** `index([dueDate])` · `index([status])` · `index([syncStatus])` · `index([userId])` · `index([createdAt])` · `index([deletedAt])`

---

### LoanPayment

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `loanId` | `String` |  |
| `amount` | `Decimal` | Decimal(12, 2) |
| `accountId` | `String?` |  |
| `date` | `DateTime` |  |
| `notes` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `loan` → **Loan** (fields: [loanId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([date])` · `index([loanId])` · `index([deletedAt])`

---

### Notification

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `sourceUserId` | `String?` |  |
| `title` | `String` |  |
| `message` | `String` |  |
| `type` | `String` | default "info" |
| `category` | `String?` |  |
| `deepLink` | `String?` |  |
| `priority` | `String` | default "normal" |
| `channels` | `Json` | default "[\"app\"]" |
| `metadata` | `Json?` |  |
| `deliveryStatus` | `Json` | default "{}" |
| `encryptedPayload` | `String?` |  |
| `isRead` | `Boolean` | default false |
| `createdAt` | `DateTime` | default now() |
| `readAt` | `DateTime?` |  |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([createdAt])` · `index([isRead])` · `index([userId])` · `index([sourceUserId])` · `index([type])` · `index([deletedAt])` · `index([userId, isRead, createdAt])`

---

### OtpCode

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `code` | `String` |  |
| `expiresAt` | `DateTime` |  |
| `attempts` | `Int` | default 0 |
| `used` | `Boolean` | default false |
| `createdAt` | `DateTime` | default now() |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([userId])` · `index([expiresAt])`

---

### OtpRequest

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String?` |  |
| `destination` | `String` |  |
| `channel` | `String` |  |
| `purpose` | `String` |  |
| `otpHash` | `String` |  |
| `expiryTime` | `DateTime` |  |
| `attempts` | `Int` | default 0 |
| `maxAttempts` | `Int` | default 5 |
| `status` | `String` | default "ACTIVE" |
| `ipAddress` | `String?` |  |
| `userAgent` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `verifiedAt` | `DateTime?` |  |

**Relations:**
_None._

**Indexes / constraints:** `index([destination, purpose, status])` · `index([userId])` · `index([createdAt])`

---

### Payment

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `sessionId` | `String` | unique |
| `clientId` | `String` |  |
| `advisorId` | `String` |  |
| `amount` | `Decimal` | Decimal(12, 2) |
| `currency` | `String` | default "USD" |
| `status` | `String` | default "pending" |
| `paymentMethod` | `String?` |  |
| `transactionId` | `String?` |  |
| `description` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `advisor` → **User** (Payment_advisorIdToUser, fields: [advisorId], references: [id], onDelete: Cascade)
- `client` → **User** (Payment_clientIdToUser, fields: [clientId], references: [id], onDelete: Cascade)
- `session` → **AdvisorSession** (fields: [sessionId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([advisorId])` · `index([clientId])` · `index([createdAt])` · `index([status])`

---

### PlatformSettings

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default "global" |
| `settings` | `Json` | default "{}" |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
_None._

**Indexes / constraints:** _None._

---

### profiles

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, Uuid |
| `email` | `String?` | unique |
| `full_name` | `String?` |  |
| `first_name` | `String?` |  |
| `last_name` | `String?` |  |
| `avatar_url` | `String?` |  |
| `avatar_id` | `String?` |  |
| `phone` | `String?` |  |
| `gender` | `String?` |  |
| `date_of_birth` | `DateTime?` | Timestamptz(6) |
| `monthly_income` | `Decimal?` | Decimal |
| `annual_income` | `Decimal?` | Decimal |
| `job_type` | `String?` |  |
| `country` | `String?` |  |
| `state` | `String?` |  |
| `city` | `String?` |  |
| `visible_features` | `Json?` |  |
| `created_at` | `DateTime?` | default now(), Timestamptz(6) |
| `updated_at` | `DateTime?` | auto-updated, Timestamptz(6) |

**Relations:**
_None._

**Indexes / constraints:** _None._

---

### RecurringTransaction

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `title` | `String` |  |
| `amount` | `Decimal` | Decimal(12, 2) |
| `category` | `String` |  |
| `subcategory` | `String?` |  |
| `interval` | `String` | default "monthly" |
| `nextDueDate` | `DateTime` |  |
| `autoProcess` | `Boolean` | default false |
| `status` | `String` | default "active" |
| `accountId` | `String?` |  |
| `description` | `String?` |  |
| `merchant` | `String?` |  |
| `lastProcessedAt` | `DateTime?` |  |
| `clientRequestId` | `String?` | unique |
| `syncStatus` | `String` | default "synced" |
| `type` | `String?` |  |
| `startDate` | `DateTime?` |  |
| `endDate` | `DateTime?` |  |
| `reminderDaysBefore` | `Int?` |  |
| `notes` | `String?` |  |
| `transferToAccountId` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([userId])` · `index([status])` · `index([nextDueDate])` · `index([syncStatus])` · `index([deletedAt])`

---

### RefreshToken

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `token` | `String` | unique |
| `userId` | `String` |  |
| `expiresAt` | `DateTime` |  |
| `createdAt` | `DateTime` | default now() |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([userId])`

---

### SyncQueue

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `deviceId` | `String?` |  |
| `entityType` | `String` |  |
| `entityId` | `String` |  |
| `operation` | `String?` |  |
| `action` | `String?` |  |
| `sourceDeviceId` | `String?` |  |
| `metadata` | `Json?` |  |
| `data` | `Json?` |  |
| `status` | `String` | default "pending" |
| `errorMessage` | `String?` |  |
| `retryCount` | `Int` | default 0 |
| `maxRetries` | `Int` | default 3 |
| `processingTime` | `Int?` |  |
| `createdAt` | `DateTime` | default now() |
| `processedAt` | `DateTime?` |  |

**Relations:**
_None._

**Indexes / constraints:** `index([createdAt])` · `index([deviceId])` · `index([entityType])` · `index([status])` · `index([userId])`

---

### TaxCalculation

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `year` | `Int` |  |
| `regime` | `String?` |  |
| `country` | `String` | default "India" |
| `totalIncome` | `Decimal` | Decimal(12, 2) |
| `totalExpense` | `Decimal` | Decimal(12, 2) |
| `netProfit` | `Decimal` | Decimal(12, 2) |
| `taxableIncome` | `Decimal` | Decimal(12, 2) |
| `estimatedTax` | `Decimal` | Decimal(12, 2) |
| `taxRate` | `Decimal` | Decimal(5, 2) |
| `deductions` | `Decimal` | default 0, Decimal(12, 2) |
| `currency` | `String` | default "INR" |
| `notes` | `String?` |  |
| `metadata` | `Json?` |  |
| `clientRequestId` | `String?` | unique |
| `syncStatus` | `String` | default "synced" |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([userId])` · `index([year])` · `index([deletedAt])`

---

### Todo

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `title` | `String` |  |
| `completed` | `Boolean` | default false |
| `userId` | `String` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([userId])`

---

### Transaction

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` |  |
| `deviceId` | `String?` |  |
| `accountId` | `String` |  |
| `type` | `String` |  |
| `amount` | `Decimal` | Decimal(12, 2) |
| `category` | `String` |  |
| `subcategory` | `String?` |  |
| `description` | `String?` |  |
| `merchant` | `String?` |  |
| `date` | `DateTime` |  |
| `tags` | `Json?` |  |
| `attachment` | `String?` |  |
| `transferToAccountId` | `String?` |  |
| `transferType` | `String?` |  |
| `expenseMode` | `String?` |  |
| `groupExpenseId` | `String?` |  |
| `groupName` | `String?` |  |
| `splitType` | `String?` |  |
| `importSource` | `String?` |  |
| `importMetadata` | `String?` |  |
| `originalCategory` | `String?` |  |
| `importedAt` | `DateTime?` |  |
| `dedupHash` | `String?` | unique |
| `version` | `Int` | default 1 |
| `synced` | `Boolean` | default false |
| `syncStatus` | `String` | default "synced" |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `deletedAt` | `DateTime?` |  |

**Relations:**
- `account` → **Account** (fields: [accountId], references: [id], onDelete: Cascade)
- `groupExpense` → **GroupExpense?** (fields: [groupExpenseId], references: [id])
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([accountId])` · `index([category])` · `index([date])` · `index([groupExpenseId])` · `index([syncStatus])` · `index([userId])` · `index([userId, date])` · `index([userId, type, date])` · `index([userId, category, date])` · `index([userId, accountId, date])` · `index([userId, deletedAt, date])` · `index([deletedAt])`

---

### User

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `email` | `String` | unique |
| `name` | `String` |  |
| `password` | `String` |  |
| `role` | `String` | default "user" |
| `roleMode` | `String` | default "user" |
| `advisorStatus` | `String` | default "NOT_AVAILABLE" |
| `status` | `String` | default "verified" |
| `isApproved` | `Boolean` | default false |
| `firstName` | `String?` |  |
| `lastName` | `String?` |  |
| `salary` | `Decimal?` | Decimal(12, 2) |
| `dateOfBirth` | `DateTime?` |  |
| `jobType` | `String?` |  |
| `lastSynced` | `DateTime?` |  |
| `syncToken` | `String?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |
| `avatarId` | `String?` |  |
| `city` | `String?` |  |
| `country` | `String?` |  |
| `gender` | `String?` |  |
| `state` | `String?` |  |

**Relations:**
- `accounts` → **Account[]**
- `advisorAvailability` → **AdvisorAvailability[]**
- `advisorApplication` → **AdvisorApplication?** (AdvisorApplication_user)
- `reviewedApplications` → **AdvisorApplication[]** (AdvisorApplication_reviewer)
- `sessionsAsAdvisor` → **AdvisorSession[]** (AdvisorSession_advisorIdToUser)
- `sessionsAsClient` → **AdvisorSession[]** (AdvisorSession_clientIdToUser)
- `bookingsAsAdvisor` → **BookingRequest[]** (BookingRequest_advisorIdToUser)
- `bookingsAsClient` → **BookingRequest[]** (BookingRequest_clientIdToUser)
- `categories` → **Category[]**
- `chatMessages` → **ChatMessage[]**
- `devices` → **Device[]**
- `expenseBills` → **ExpenseBill[]**
- `friends` → **Friend[]**
- `goals` → **Goal[]**
- `goalContributions` → **GoalContribution[]**
- `importLogs` → **ImportLog[]**
- `investments` → **Investment[]**
- `loans` → **Loan[]**
- `notifications` → **Notification[]**
- `paymentsAsAdvisor` → **Payment[]** (Payment_advisorIdToUser)
- `paymentsAsClient` → **Payment[]** (Payment_clientIdToUser)
- `refreshTokens` → **RefreshToken[]**
- `todos` → **Todo[]**
- `transactions` → **Transaction[]**
- `userPin` → **UserPin?**
- `userSettings` → **UserSettings?**
- `otpCodes` → **OtpCode[]**
- `aiScans` → **AiScan[]**
- `groupExpenses` → **GroupExpense[]**
- `recurringTransactions` → **RecurringTransaction[]**
- `budgets` → **Budget[]**
- `taxCalculations` → **TaxCalculation[]**
- `goldAssets` → **GoldAsset[]**
- `collaborationParticipations` → **CollaborationParticipant[]** (CollaborationParticipant_user)
- `collaborationInvitesSent` → **CollaborationParticipant[]** (CollaborationParticipant_invitedBy)

**Indexes / constraints:** `index([isApproved])` · `index([role])` · `index([role, isApproved])`

---

### user_features

| Column | Type | Attributes |
|---|---|---|
| `user_id` | `String` | PK |
| `avg_spend` | `Decimal` | Decimal(12, 2) |
| `monthly_income` | `Decimal` | Decimal(12, 2) |
| `savings_rate` | `Decimal` | Decimal(12, 2) |
| `top_category` | `String` |  |
| `risk_score` | `Float` |  |
| `peak_day` | `String` |  |
| `feature_data_json` | `Json` |  |
| `updated_at` | `DateTime` | default now() |

**Relations:**
_None._

**Indexes / constraints:** _None._

---

### UserPin

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` | unique |
| `pinHash` | `String` |  |
| `keyBackup` | `String?` |  |
| `expiresAt` | `DateTime` |  |
| `isActive` | `Boolean` | default true |
| `failedAttempts` | `Int` | default 0 |
| `lockedUntil` | `DateTime?` |  |
| `lastVerifiedAt` | `DateTime?` |  |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([expiresAt])` · `index([isActive])` · `index([userId])`

---

### UserSettings

| Column | Type | Attributes |
|---|---|---|
| `id` | `String` | PK, default uuid() |
| `userId` | `String` | unique |
| `theme` | `String` | default "light" |
| `language` | `String` | default "en" |
| `currency` | `String` | default "USD" |
| `timezone` | `String` | default "UTC" |
| `settings` | `Json` | default "{}" |
| `createdAt` | `DateTime` | default now() |
| `updatedAt` | `DateTime` | auto-updated |

**Relations:**
- `user` → **User** (fields: [userId], references: [id], onDelete: Cascade)

**Indexes / constraints:** `index([userId])`
