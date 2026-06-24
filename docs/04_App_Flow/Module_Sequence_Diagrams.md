# Per-Module Sequence Diagrams — Kanaku

> Mermaid sequence diagrams for module flows. Complements the 16 diagrams in `KANAKU_PROJECT_OVERVIEW.md` §G (sign-up, add txn, receipt OCR, voice, goal, loan EMI, investments, group split, todos, advisor booking, advisor verification, admin gates, AA, cross-device sync, notifications, settings). This file adds the remaining modules and finer detail. All requests pass: helmet → cors → rateLimit → json → requestId → sanitiser → authenticate → validate(zod) → ownership.

## Accounts — CRUD with cache
```mermaid
sequenceDiagram
    participant U as User
    participant FE as Accounts.tsx / AddAccount
    participant DX as Dexie(accounts)
    participant API as /api/v1/accounts
    participant SVC as account.service
    participant RD as Redis
    participant PG as PostgreSQL
    U->>FE: Create account {name,type,balance,currency}
    FE->>DX: add(syncStatus='pending')
    FE->>API: POST / (requireFeature createAccount)
    API->>SVC: validate(accountCreateSchema)+ownership
    SVC->>SVC: name uniqueness check
    SVC->>PG: insert accounts
    SVC->>RD: invalidate accounts:list:userId
    SVC-->>API: 201 {id}
    API-->>FE: cloudId
    FE->>DX: syncStatus='synced'
    Note over API,RD: GET / and GET /:id served from Redis cache (TTL)
```

## Recurring transactions — auto-post worker
```mermaid
sequenceDiagram
    participant U as User
    participant FE as RecurringTransactions.tsx
    participant API as /api/v1/recurring
    participant PG as PostgreSQL
    participant WK as Recurring worker
    participant TX as prisma.$transaction
    U->>FE: Create rule {interval,nextDueDate,autoProcess}
    FE->>API: POST /
    API->>PG: insert recurringTransactions(status='active')
    loop scheduled tick
        WK->>PG: find due (nextDueDate<=now, status active, autoProcess)
        WK->>TX: insert transaction + update account.balance
        TX-->>WK: committed
        WK->>PG: advance nextDueDate
    end
    U->>FE: Toggle pause
    FE->>API: PATCH /:id/toggle
    API->>PG: status='paused'
```

## Budgets — create, spend recalc, alerts
```mermaid
sequenceDiagram
    participant U as User
    participant FE as BudgetAlertsPage.tsx
    participant API as /api/v1/budgets
    participant SVC as budget.service
    participant PG as PostgreSQL
    participant DX as Dexie(budgetAlerts)
    U->>FE: Create budget {category,amount,period,threshold,alertChannels}
    FE->>API: POST /
    API->>PG: insert budgets
    Note over SVC,PG: On new transactions, spent recalculated
    U->>FE: Recalculate
    FE->>API: POST /:id/recalculate
    API->>SVC: sum transactions in period/category
    SVC->>PG: update budgets.spent
    SVC-->>API: {spent, limit, pct}
    alt spent >= threshold%
        SVC->>DX: budgetAlert (app) + enqueue email/push
    end
```

## Investments — add with live price + close
```mermaid
sequenceDiagram
    participant U as User
    participant FE as AddInvestment / WealthVaultDashboard
    participant API_S as /api/v1/stocks
    participant API_I as /api/v1/investments
    participant RD as Redis(quotes 60s)
    participant EXT as Market provider
    participant PG as PostgreSQL
    U->>FE: search symbol
    FE->>API_S: GET /search?q=
    API_S->>EXT: lookup
    EXT-->>API_S: matches
    U->>FE: submit buy {assetType,quantity,buyPrice}
    FE->>API_I: POST /
    API_I->>PG: insert investments
    FE->>API_S: GET /batch?symbols=...
    API_S->>RD: cache?
    alt miss
        API_S->>EXT: quotes
        API_S->>RD: set 60s
    end
    API_S-->>FE: live prices → P/L
    U->>FE: Close position
    FE->>API_I: PUT /:id {positionStatus:'closed'}
```

## Gold — position + live metal price
```mermaid
sequenceDiagram
    participant U as User
    participant FE as AddGold.tsx
    participant MP as metalPriceService
    participant API as /api/v1/gold
    participant PG as PostgreSQL
    U->>FE: enter {type,quantity,unit,purchasePrice,purchaseDate}
    FE->>MP: fetch current metal price
    MP-->>FE: currentPrice
    FE->>API: POST /
    API->>PG: insert GoldAsset (cloudId indexed)
    API-->>FE: 201
```

## Statement import — upload → review → confirm
```mermaid
sequenceDiagram
    participant U as User
    participant FE as StatementImport.tsx
    participant API as /api/v1/import
    participant PARSE as bankStatementScannerService
    participant PG as PostgreSQL
    U->>FE: upload statement (bank/card)
    FE->>API: POST /upload (requireFeature importStatement, multipart)
    API->>PARSE: parse rows
    PARSE-->>API: candidate transactions + sessionId
    API->>PG: ImportLog(session)
    API-->>FE: review grid
    U->>FE: confirm selected
    FE->>API: POST /confirm {sessionId, rows}
    API->>PG: bulk insert transactions + update balances
    API-->>FE: imported count
```

## SMS detection → linked transaction
```mermaid
sequenceDiagram
    participant DEV as Device (SMS)
    participant FE as smsTransactionDetectionService
    participant DX as Dexie(smsTransactions)
    participant API as /api/v1/transactions
    DEV->>FE: bank SMS received
    FE->>FE: parse amount/merchant/account
    FE->>DX: smsTransactions(status='detected', &sourceSmsId)
    FE-->>DEV: prompt "Add this expense?"
    DEV->>FE: confirm
    FE->>API: POST / (linked) → matchedAccountId
    API-->>FE: created; DX status='linked', linkedTransactionId
```

## Friends — create, bulk, CSV import
```mermaid
sequenceDiagram
    participant U as User
    participant FE as FriendsList / AddFriends
    participant API as /api/v1/friends
    participant PG as PostgreSQL
    U->>FE: add friend {name, email|phone}
    FE->>API: POST / (email OR phone required)
    API->>PG: insert Friend (dedupe)
    U->>FE: import CSV
    FE->>API: POST /import (multipart) → parse
    API->>PG: bulk insert (<=200)
    API-->>FE: created/skipped counts
```

## Groups — split expense + realtime
```mermaid
sequenceDiagram
    participant P as Payer
    participant FE as Groups / AddGroup
    participant API as /api/v1/groups
    participant SVC as group.service
    participant TX as prisma.$transaction
    participant WS as Socket.IO
    participant NTF as notifications
    P->>FE: {name,totalAmount,members[],splitType}
    FE->>API: POST /
    API->>SVC: validate membership
    SVC->>TX: insert GroupExpense + GroupExpenseMember[]
    TX-->>SVC: committed
    SVC->>NTF: notify each member
    SVC->>WS: emit('group:expense', memberIds)
    WS-->>FE: members' apps update Dexie
    Note over API: repair-members reconciles unmatched users
```

## To-Do (Together) — collaborate
```mermaid
sequenceDiagram
    participant O as Owner
    participant C as Collaborator
    participant API as /api/v1/todos
    participant WS as Socket.IO
    participant PG as PostgreSQL
    O->>API: POST /lists {listType:'together'}
    O->>API: POST /lists/:id/share {email}
    API->>PG: toDoListShares(sharedWithUserId)
    API->>WS: emit('todo:invited', collab)
    WS-->>C: invitation
    O->>API: POST /items {title, assignedTo:C}
    API->>WS: emit('todo:item', members)
    WS-->>C: new task
    C->>API: PUT /items/:id {completed:true}
    API->>WS: emit('todo:item:updated')
```

## Collaboration ACL — list / revoke
```mermaid
sequenceDiagram
    participant U as User
    participant FE as shared resources UI
    participant API as /api/v1/collaboration
    participant PG as PostgreSQL
    U->>API: GET /?moduleType=todo_list&status=REGISTERED
    API->>PG: select CollaborationParticipant (user-scoped)
    API-->>U: collaborations[]
    U->>API: DELETE /:id
    API->>PG: revoke participant
```

## Advisor chat session lifecycle
```mermaid
sequenceDiagram
    participant U as Client
    participant A as Advisor
    participant API as /api/v1/sessions
    participant WS as Socket.IO
    participant PG as PostgreSQL
    A->>API: POST /:id/start
    API->>PG: AdvisorSession status='in_session'
    U->>API: POST /:id/messages {message}
    API->>WS: emit('chat:message')
    WS-->>A: realtime
    A->>API: POST /:id/complete {notes}
    API->>PG: status='completed' + notes
    U->>API: PUT /advisors/sessions/:id/rate {rating,feedback}
```

## Payments — intent state machine
```mermaid
sequenceDiagram
    participant U as User
    participant API as /api/v1/payments
    participant PG as PostgreSQL
    participant PRV as Provider
    U->>API: POST /initiate {sessionId, paymentMethod}
    API->>PG: Payment(status='initiated')
    API-->>U: payment intent
    PRV-->>API: POST /webhook (signed)
    alt success
        API->>API: POST /complete {paymentId, transactionId}
        API->>PG: status='completed'
    else failure
        API->>API: POST /fail {paymentId, reason}
        API->>PG: status='failed'
    end
    U->>API: POST /refund {paymentId} → status='refunded'
```

## OTP — sensitive action gate
```mermaid
sequenceDiagram
    participant U as User
    participant API as /api/v1/otp
    participant RD as Redis(TTL)
    participant CH as MSG91/Twilio/Resend
    U->>API: POST /send {destination,channel,purpose}
    API->>RD: store 6-digit OTP (TTL)
    API->>CH: deliver (sms/email)
    U->>API: POST /verify {destination,purpose,otp /^\d{6}$/}
    API->>RD: compare + consume
    API-->>U: verified → proceed (e.g., email change, aa_consent)
```

## Sessions/Devices — multi-device management
```mermaid
sequenceDiagram
    participant U as User
    participant FE as Settings.tsx
    participant API_S as /api/v1/sessions
    participant API_D as /api/v1/devices
    U->>API_S: GET / (active sessions)
    U->>API_S: DELETE /:id (revoke)
    U->>API_D: GET / (devices)
    U->>API_D: POST /:deviceId/sync (update lastSync)
    U->>API_D: DELETE /:deviceId (revoke device)
```

## Avatars / Profile
```mermaid
sequenceDiagram
    participant U as User
    participant FE as UserProfile.tsx
    participant API_A as /api/v1/avatars
    participant API_P as /api/v1/auth/profile
    U->>API_A: GET / (28 DiceBear)
    U->>API_A: PUT /me {avatarId}
    U->>API_P: PUT / {profile fields}
    Note over FE: PIN change → /pin/update; email/mobile change → OTP verify
```

## AI insights — capability-gated reads
```mermaid
sequenceDiagram
    participant U as User
    participant FE as AIInsightsPage.tsx
    participant API as /api/v1/ai
    participant FG as Feature gate (aiAutomation.*)
    participant ENG as KANKUIntelligenceEngine
    participant PG as ai_insights
    U->>API: GET /insights
    API->>FG: requireAIFeature('aiAutomation')
    FG-->>API: allowed
    API->>ENG: compute / fetch cached
    ENG->>PG: read ai_insights / ai_model_runs
    ENG-->>API: insights/health-score/fraud-alerts/bill-predictions
    API-->>U: render cards
```

## Admin — user role/status management
```mermaid
sequenceDiagram
    participant AD as Admin
    participant FE as AdminDashboard.tsx
    participant API as /api/v1/admin
    participant PG as PostgreSQL
    participant NTF as notifications
    AD->>API: GET /users (+ /users/activity, /stats, /cache/metrics)
    AD->>API: POST /users/:userId/role {role}
    API->>PG: update User.role
    API->>NTF: notify user
    AD->>API: POST /users/:userId/status (block/unblock)
    AD->>API: DELETE /users/:userId (self-delete guarded)
```

## Webhooks — SendGrid signed events
```mermaid
sequenceDiagram
    participant SG as SendGrid
    participant API as /api/v1/webhooks/sendgrid
    participant V as verifySendGridSignature
    participant PG as PostgreSQL
    SG->>API: POST /sendgrid (events[], signature, timestamp)
    API->>V: ECDSA P-256 / SHA-256 over timestamp+rawBody (10-min window)
    alt valid
        V->>PG: record delivery/open/bounce events
        API-->>SG: 200
    else invalid (fail-closed in prod)
        API-->>SG: 401
    end
```

