# Request / Response Schemas — Kanaku (from actual Zod definitions)

> Derived directly from `backend/src/features/*/*.validation.ts` (+ `*.types.ts`). These are the **exact** validated shapes. Mutating routes run `validate(schema)`; invalid input → `400 { success:false, code:'VALIDATION_ERROR', requestId }` (field issues logged server-side only). All amounts are `Decimal(18,2)` server-side; balance writes are atomic.

Legend: `?` optional · `coerce` accepts string/number · ranges/lengths shown.

---

## auth — `/api/v1/auth`
**RegisterInput** (`POST /register`)
```ts
{ email: string, name: string, password: string /* 8+ upper+lower+digit+special */,
  role?: 'user'|'advisor', phone?: string, mobile?: string }
```
**LoginInput** (`POST /login/challenge`, `POST /login`)
```ts
{ email: string, password: string }   // login also carries challengeCode
```
**AuthTokens** (response)
```ts
{ accessToken: string, refreshToken: string, expiresAt: number /* epoch ms */,
  user: { id, email, name, role, isApproved } }
```
**User** (profile response): `{ id, email, name, firstName?, lastName?, gender?, country?, state?, city?, salary?, monthlyIncome?, dateOfBirth?, jobType?, role, isApproved, createdAt }`

## otp — `/api/v1/otp`
```ts
// POST /send
{ destination: string(5..100), channel?: 'sms'|'email' = 'email',
  purpose: 'signup'|'login'|'reset_password'|'aa_consent'|'sensitive_action' }
// POST /verify
{ destination: string(5..100), purpose: <same enum>, otp: string /^\d{6}$/ }
```

## pin — `/api/v1/pin`  (fields optional + `.passthrough()`; handlers add presence codes)
```ts
createPin:   { pin?: string(1..64) }
verifyPin:   { pin?: string(1..64), deviceId?: string(<=200) }
verifySecurity: { pin?: string(<=64), freshAuthToken?: string(<=5000) }
updatePin:   { currentPin?: string(1..64), newPin?: string(1..64) }
keyBackup:   { backup?: string(1..100000) }   // encrypted blob
resetPin:    { userId?: string(1..100) }
```

## settings — `/api/v1/settings`
```ts
// PUT / (≥1 field required)
{ theme?: string(<=40), language?: string(<=20), currency?: string(<=10),
  timezone?: string(<=60), settings?: string | Record<string,any> }
```

## accounts — `/api/v1/accounts`
```ts
// POST /  (accountCreateSchema)
{ name: string(1..120), type: string(1..60), provider?: string(<=120),
  country?: string(<=60), balance?: number(>=0), currency?: string(len 3),
  clientRequestId?: string }
// PUT /:id  → partial(create), ≥1 field
// params: { id: string(>=1) }
```

## transactions — `/api/v1/transactions`
```ts
// POST /  (transactionCreate + superRefine: transfer requires transferToAccountId)
{ accountId: string(>=1),
  type: 'income'|'expense'|'transfer'|'withdrawal',
  amount: number(>0, <=999999999, 2dp),
  category: string(1..80), subcategory?: string(<=80),
  description?: string(<=200), merchant?: string(<=120),
  date: Date,
  tags?: string(<=40)[],
  transferToAccountId?: string, transferType?: 'self-transfer'|'other-transfer',
  // expense sub-feature
  expenseMode?: 'individual'|'group'|'loan', groupExpenseId?: string,
  groupName?: string(<=100), splitType?: 'equal'|'custom',
  // loan sub-feature
  loanType?: 'borrowed'|'lent', contactName?: string(<=100),
  interestRate?: number(0..100), loanCategory?: string(<=80),
  bankName?: string(<=100), tenureMonths?: int(1..600),
  emiAmount?: number(>=0), downPayment?: number(>=0),
  receivedAccount?: string, emiDeductionAccountId?: string, notes?: string(<=500) }
// PATCH /:id → partial(create), ≥1 field
// POST /bulk → { transactions: TxCreate[](1..100) }
// GET / query: { accountId?, startDate?, endDate?, category?, page?(>=1), limit?(1..200) }
// params: { id }
```

## recurring — `/api/v1/recurring`
```ts
// POST /
{ title: string(1..100), amount: number(>0,<=999999999), category: string(1..80),
  subcategory?: string(<=80), interval: 'weekly'|'monthly'|'yearly',
  nextDueDate: Date, autoProcess?: boolean, accountId?: string,
  description?: string(<=200), merchant?: string(<=120), clientRequestId?: string }
// PUT /:id → partial, ≥1; query: { status?: 'active'|'paused'|'cancelled', interval? }
```

## categorization — `/api/v1/categorization`
```ts
// POST /        { text: string(1..500) }
// POST /learn   { text: string(1..500), category?|category_id? (one required),
//                 subcategory?, subcategory_id? }
```

## goals — `/api/v1/goals`
```ts
// POST /
{ name: string(1..120), targetAmount: number(>0), targetDate: Date,
  category?: string(<=80), isGroupGoal?: boolean, clientRequestId?: string }
// PUT /:id → partial + { currentAmount?: number(>=0), syncStatus? }
// POST /:id/members  { email: emailString, name?: string(<=120) }
```

## budgets — `/api/v1/budgets`
```ts
// POST /
{ category: string(1..80), amount: number(>0,<=999999999),
  period: 'weekly'|'monthly'|'yearly', threshold?: int(1..100),
  startDate?: Date, endDate?: Date, alertEnabled?: boolean,
  alertChannels?: ('app'|'email'|'push')[], clientRequestId?: string }
// PUT /:id → { amount?, spent?>=0, threshold?, alertEnabled?, alertChannels?, startDate?, endDate? } ≥1
// query: { period?, category? }
```

## loans — `/api/v1/loans`
```ts
// POST /
{ type: string(1..60), name: string(1..120), principalAmount: number(>0),
  interestRate?: number(>=0), emiAmount?: number(>=0), dueDate?: Date,
  frequency?: string(<=40), contactPerson?: string(<=120), clientRequestId?: string }
// PUT /:id → { name?, type?, principalAmount?, outstandingBalance?>=0, interestRate?,
//             emiAmount?, dueDate?, frequency?, contactPerson?,
//             status?: 'active'|'completed'|'defaulted', syncStatus? } ≥1
// POST /:id/payments  { amount: number(>0), accountId?: string, notes?: string(<=200) }  // atomic
```

## investments — `/api/v1/investments`
```ts
// POST /
{ assetType: string, assetName: string, quantity: number(>0),
  buyPrice: number(>=0), currentPrice: number(>=0),
  totalInvested?: number(>=0), currentValue?: number(>=0), profitLoss?: number,
  purchaseDate: string(datetime|nonempty), lastUpdated?: string, metadata?: any }
// PUT /:id → partial(create)
```

## gold — `/api/v1/gold`
```ts
// POST /
{ type: 'gold'|'jewelry'|'coin', quantity: number(>0),
  unit: 'gram'|'ounce'|'kg', purchasePrice: number(>0), currentPrice: number(>=0),
  purchaseDate: Date, purityPercentage?: number(0..100), location?: string(<=200),
  certificateNumber?: string(<=100), notes?: string(<=500), clientRequestId?: string }
// query: { type? }
```

## friends — `/api/v1/friends`
```ts
// POST /     { name: string(1..120), email?: string|null(<=255), phone?: string|null(<=40) }
//            (controller: email OR phone required)
// POST /bulk { friends: { name?, email?, phone? }[](1..200) }
// PUT /:id → partial, ≥1
```

## groups — `/api/v1/groups`
```ts
// POST /
{ name: string, totalAmount: number(>=0), paidBy?: string|number,
  date: string(datetime|nonempty),
  members: ( string | { name, share>=0, paid?, friendId?, email?, phone?,
                         isCurrentUser?, paidAmount?, paymentStatus? } )[],
  items?: { name, amount>=0, sharedBy?: string[] }[],
  description?: string, category?: string, splitType?: 'equal'|'custom',
  yourShare?: number, status?: 'pending'|'settled' }
// PUT /:id → partial
```

## todos — `/api/v1/todos`
```ts
// POST /        { title: string(>=1), completed?: boolean }
// PUT /:id      { title?: string(>=1), completed?: boolean }
// lists/items/shares: controller-validated (listType 'together'|'individual', assignedTo, sharedWithUserId)
```

## collaboration — `/api/v1/collaboration`
```ts
// query: { moduleType?: 'group_expense'|'todo_list'|'goal',
//          status?: 'REGISTERED'|'PENDING_REGISTRATION' }
// params: { id }
```

## bookings — `/api/v1/bookings`
```ts
// create
{ advisorId: string(>=1), sessionType: string(1..60), description?: string(<=1000),
  proposedDate: string(>=1), proposedTime: string(>=1),
  duration: int(1..600), amount: number(>=0) }
// reschedule { proposedDate?|proposedTime?|newDate?|newTime?, reason?<=500 }
// cancel { reason?<=500 }
```

## sessions — `/api/v1/sessions` (advisor chat)
```ts
// POST /:id/messages   { message: string(1..4000) }
// POST /:id/complete   { notes?: string(<=2000) }
// POST /:id/cancel     { reason?: string(<=500) }
```

## advisors — `/api/v1/advisors`  (passthrough; /apply is multipart)
```ts
setAvailability:    { dayOfWeek?: int|string, startTime?<=20, endTime?<=20, isActive?: boolean }
availabilityStatus: { available?: boolean|string }
onlineStatus:       { status?: boolean|string }
roleMode:           { mode?: string(<=50) }
rateSession:        { rating?: number|string, feedback?: string(<=5000) }
rejectApplication:  { reason?: string(<=2000) }
documentParam:      { id, docType: string(1..50) }
```

## payments — `/api/v1/payments`
```ts
initiate { sessionId: string(>=1), paymentMethod: string(>=1), description?<=500 }
complete { paymentId: string(>=1), transactionId?<=255 }
fail     { paymentId: string(>=1), reason?<=500 }
refund   { paymentId: string(>=1), reason?<=500 }
```

## notifications — `/api/v1/notifications`  (passthrough)
```ts
list query: { unread?, limit?, page? }
send (admin): { userId(1..100), title(1..300), message(1..5000),
                type?<=50, category?<=100, deepLink?<=2000 }
```

## ai — `/api/v1/ai`
```ts
events:    { eventType: string(3..80), metadata: Record<string,unknown> = {} }
limitQuery:{ limit?: int(1..200) }
userParam: { userId: string(>=1) }
runBody:   { force?: boolean } = {}
```

## aa — `/api/v1/aa` (Setu Account Aggregator)
```ts
createConsent {
  vua: string(3..100),
  fiTypes: ('DEPOSIT'|'TERM_DEPOSIT'|'RECURRING_DEPOSIT'|'MUTUAL_FUNDS'|'SIP'
            |'INSURANCE'|'CREDIT_CARD'|'EQUITIES')[](>=1),
  consentTypes: string[](>=1) = ['TRANSACTIONS','SUMMARY'],
  purpose: { code: string(1..10), text: string(1..200) },
  dataRange: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' },
  consentMode?: 'VIEW'|'STORE'|'QUERY' = 'VIEW',
  fetchType?: 'ONETIME'|'PERIODIC' = 'ONETIME' }
createDataSession { consentId: string(1..200) }
notification (webhook) {
  type: 'CONSENT_STATUS_UPDATE'|'FI_DATA_READY'|'SESSION_STATUS_UPDATE',
  consentId?, consentHandle?, sessionId?, status?, timestamp: string }
params: consentHandle | consentId | sessionId (1..200)
```

## receipts — `/api/v1/receipts`
```ts
scan query: { provider?: 'auto'|'donut' = 'auto' }   // body is multipart image
```

## bills — `/api/v1/bills`
```ts
// multipart upload (file); only param validated: { id: string(1..100) }
```

## admin — `/api/v1/admin`
```ts
cacheMetrics query: { reset?: 'true'|'false' }
// feature/user/role/AI bodies validated in controllers
```

---

## Standard response envelope
```json
{ "success": true, "data": { /* resource(s) */ }, "requestId": "uuid" }
{ "success": false, "error": "human-safe message", "code": "ERR_CODE", "requestId": "uuid" }
```
Common codes: `VALIDATION_ERROR`, `PASSWORD_TOO_WEAK`, `PIN_REQUIRED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `DATABASE_UNAVAILABLE`.

