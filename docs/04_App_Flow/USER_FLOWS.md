# User‑Role Feature Flows

Sequence diagram per **user** feature. Every protected call runs
`authMiddleware → idle‑session → pinGate` before reaching the controller (shown
once below, abbreviated as **auth+gate** thereafter). The encrypted **Dexie**
store is the local cache; the backend is the source of truth.

Cross‑role flows (advisor lifecycle, admin/manager ops) live in their own docs.

---

## 1. Dashboard

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /dashboard
  participant R as Redis cache
  participant DB as Postgres
  C->>BE: GET /dashboard/summary?month (Bearer JWT)
  BE->>BE: authMiddleware + idle + pinGate
  BE->>R: lookup cached summary
  alt cache hit
    BE-->>C: 200 cached summary
  else miss
    BE->>DB: aggregate accounts + transactions + budgets + goals
    BE->>R: store (TTL)
    BE-->>C: 200 {netWorth, spend, budgets, cashflow}
  end
  C->>BE: GET /dashboard/cashflow?months
  BE-->>C: 200 inflow/outflow series
```

## 2. Accounts

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant Dx as Dexie
  participant BE as Backend /accounts
  participant DB as Postgres
  C->>BE: GET /accounts (auth+gate)
  BE->>DB: select where userId, not deleted
  BE-->>C: 200 {accounts}
  C->>Dx: cache
  C->>BE: POST /accounts {name, type, balance, currency}
  BE->>DB: insert (server sets userId + timestamps)
  BE-->>C: 201 {account}
  Note over C,BE: PUT /accounts/:id (no client balance) · DELETE /accounts/:id soft delete
```

## 3. Transactions

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant Dx as Dexie
  participant BE as Backend /transactions
  participant DB as Postgres
  C->>BE: POST /transactions {type, amount, accountId, category, date}
  BE->>BE: auth+gate + idempotency
  BE->>DB: insert transaction
  BE->>DB: recompute account balance (derived ledger)
  opt transfer
    BE->>DB: mirror entry on transfer_to_account
  end
  BE-->>C: 201 {transaction}
  C->>Dx: update local ledger
  Note over C,BE: GET /transactions?account/date/limit · PUT /:id · DELETE /:id (recompute each change)
```

## 4. Calendar (client view)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client Calendar
  participant Dx as Dexie
  Note over C,Dx: no dedicated endpoint — reads the synced local store
  U->>C: open Calendar, pick month
  C->>Dx: query transactions + recurring by date range
  Dx-->>C: day buckets (income/expense, upcoming recurring)
  C-->>U: month grid with per-day totals + due reminders
```

## 5. To‑Do Lists (with sharing)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /todos
  participant Q as Notif queue
  participant DB as Postgres
  C->>BE: POST /todos/lists {title} (auth+gate)
  BE->>DB: create list (owner = userId)
  C->>BE: POST /todos/lists/:listId/items {text, dueDate}
  BE->>DB: create item
  C->>BE: POST /todos/lists/:listId/share {email}
  BE->>DB: CollaborationParticipant (pending) for invitee
  BE->>Q: invite notification
  BE-->>C: 200 shared
  Note over C,BE: GET/PUT/DELETE items · GET /todos/shares · DELETE /todos/shares/:id (revoke)
```

## 6. Goals (with members + progress)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /goals
  participant DB as Postgres
  C->>BE: POST /goals {name, target, deadline} (auth+gate)
  BE->>DB: create Goal (userId)
  C->>BE: PUT /goals/:id {currentAmount}  (contribution)
  BE->>DB: update progress · recompute % complete
  C->>BE: POST /goals/:id/members {email}
  BE->>DB: GoalMember + CollaborationParticipant (shared goal)
  BE-->>C: 200
  Note over C,BE: GET /goals · DELETE /goals/:id · DELETE /goals/:id/members/:memberId
```

## 7. Group Expense (split + settle)

```mermaid
sequenceDiagram
  autonumber
  actor A as User A
  participant C as Client
  participant BE as Backend /groups
  participant Q as Notif queue
  participant DB as Postgres
  A->>C: create group, add members, add items
  C->>BE: POST /groups {members, items} (auth+gate)
  BE->>DB: GroupExpense + GroupExpenseMember + pending CollaborationParticipant
  BE->>Q: invite emails + push
  BE-->>C: 201 {group, splits}
  Note over A,BE: members accept implicitly on register/login (email match)
  A->>BE: PUT /groups/:id (update items) · GET /groups (balances) · settle-up
```

## 8. Book Advisor

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client
  participant BE as Backend
  participant Pay as Payment provider
  participant DB as Postgres
  U->>C: browse advisors
  C->>BE: GET /advisors (public) · GET /advisors/:id/availability
  C->>BE: POST /bookings {advisorId, slot} (requireFeature bookAdvisor)
  BE->>DB: BookingRequest (pending) · notify advisor
  Note over BE: advisor accepts → AdvisorSession scheduled
  U->>C: pay fee
  C->>BE: POST /payments/initiate
  BE->>Pay: intent
  Pay-->>BE: POST /payments/webhook (signed) completed
  BE->>DB: Payment completed · session confirmed
  U->>C: PUT /advisors/sessions/:id/rate {rating, feedback}
```

## 9. AI Insights

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /ai
  participant Eng as AI engine
  participant DB as Postgres
  C->>BE: GET /ai/quota (auth+gate, requireAIFeature)
  BE-->>C: remaining quota
  C->>BE: GET /ai/insights · /ai/health-score · /ai/recommendations
  BE->>DB: load user_features + recent transactions
  BE->>Eng: score + generate insights
  Eng-->>BE: insights, health score, recommendations
  BE->>DB: persist ai_insights
  BE-->>C: 200 {insights, score, tips}
  Note over C,BE: also /ai/fraud-alerts · /ai/bill-predictions · /ai/spending-patterns
```

## 10. Budgets (with alerts)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /budgets
  participant DB as Postgres
  C->>BE: POST /budgets {category, amount, period, threshold, alertChannels} (auth+gate)
  BE->>DB: insert Budget (alertChannels stored as array)
  C->>BE: POST /budgets/:id/recalculate
  BE->>DB: sum spend vs amount → utilisation
  alt over threshold
    BE->>DB: enqueue budget alert notification
  end
  BE-->>C: 200 {budget, spent, remaining}
  Note over C,BE: GET /budgets · PUT /:id · DELETE /:id
```

## 11. Recurring transactions

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /recurring
  participant W as Scheduler/worker
  participant DB as Postgres
  C->>BE: POST /recurring {amount, category, frequency, nextRun} (auth+gate)
  BE->>DB: insert RecurringTransaction
  C->>BE: PUT /recurring/:id/toggle (pause/resume)
  BE->>DB: update active flag
  Note over W,DB: on schedule, worker materialises due items
  W->>DB: create Transaction from due recurring · advance nextRun · recompute balance
  Note over C,BE: GET /recurring · PUT /:id · DELETE /:id
```

## 12. Investments

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /investments
  participant Mkt as Market data (stocks)
  participant DB as Postgres
  C->>BE: POST /investments {symbol, units, buyPrice, type} (auth+gate)
  BE->>DB: insert Investment
  C->>BE: GET /investments
  BE->>DB: load holdings
  BE->>Mkt: GET /stocks/batch (current prices)
  Mkt-->>BE: quotes
  BE-->>C: 200 {holdings, currentValue, gain/loss}
  Note over C,BE: PUT /investments/:id · DELETE /:id
```

## 13. Loans (EMI)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /loans
  participant DB as Postgres
  C->>BE: POST /loans {principal, rate, tenure, account} (auth+gate)
  BE->>DB: insert Loan · compute EMI schedule
  C->>BE: POST /loans/:id/payment {amount} (idempotent)
  BE->>DB: insert LoanPayment · reduce outstanding · recompute account balance
  BE-->>C: 200 {loan, outstanding, nextDue}
  Note over C,BE: GET /loans · PUT /:id · DELETE /:id
```

## 14. Reports (client view)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client Reports
  participant Dx as Dexie
  Note over C,Dx: client-side analytics over the synced store
  U->>C: open Reports, pick range + breakdown
  C->>Dx: query transactions/budgets/investments in range
  Dx-->>C: aggregates (by category, trend, net)
  C-->>U: charts + export (CSV/PDF generated client-side)
```

## 15. Voice logging

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client
  participant BE as Backend /voice
  participant NLP as Speech + NLP
  U->>C: speak "spent 500 on groceries"
  C->>BE: POST /voice/process-audio (audio) OR /voice/process {text} (auth+gate)
  BE->>NLP: transcribe + parse intent (amount, category, merchant)
  NLP-->>BE: structured draft transaction
  BE-->>C: 200 {draft}
  U->>C: confirm
  C->>BE: POST /transactions (create)
  C->>BE: POST /voice/learn (correction feedback to improve parsing)
```

## 16. Receipt scanner (async OCR)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client
  participant BE as Backend /receipts
  participant W as OCR worker
  participant DB as Postgres
  U->>C: upload bill
  C->>BE: POST /receipts/start (multipart, requireFeature + requireAIFeature)
  BE->>W: enqueue OCR job
  BE-->>C: 202 {jobId}
  W->>DB: OCR + extract → AiScan
  loop poll
    C->>BE: GET /receipts/status/:jobId
    BE-->>C: {status, extracted}
  end
  C->>BE: POST /transactions (prefilled, on confirm)
```

## 17. Notifications

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /notifications
  participant W as Push worker
  participant DB as Postgres
  C->>BE: GET /notifications · GET /notifications/unread/count (auth+gate)
  BE->>DB: load user notifications
  BE-->>C: 200 {items, unread}
  C->>BE: PUT /notifications/:id/read · PUT /notifications/mark-all-read
  BE->>DB: mark read
  Note over W,DB: server events (budget alert, invite, booking) enqueue push
  W->>C: deliver push (channels: app/email/push)
```

## 18. Profile

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /auth
  participant R as Redis (PIN unlock)
  participant DB as Postgres
  C->>BE: GET /auth/profile?includePrivate=true (auth+gate)
  BE->>R: isPinUnlocked?
  alt locked
    BE-->>C: 200 minimal (name, avatar, role) — PII withheld, pinRequired:true
  else unlocked
    BE->>DB: User + profiles + settings + pin status
    BE-->>C: 200 full profile (email, phone, dob, income, ...)
  end
  C->>BE: PUT /auth/profile {fields} → writes to profiles (PII source of truth)
```

## 19. Settings

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /settings
  participant DB as Postgres
  C->>BE: GET /settings (auth+gate)
  BE->>DB: load UserSettings
  BE-->>C: 200 {theme, language, currency, timezone, settings:{country, monthlyBudget}}
  C->>BE: PUT /settings {theme, currency, settings}
  BE->>DB: update columns · normalise blob (strip column-owned keys, store object)
  BE-->>C: 200 {settings}
  Note over C,BE: also Security: PIN change (/pin/update), auto-lock timeout, sign-out
```
