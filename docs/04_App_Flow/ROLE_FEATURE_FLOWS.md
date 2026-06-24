# Finora / Kanaku — Role- & Feature-Based Flows

Communication sequences organised by **role** and **feature**. The four core flows
(Login, PIN, Sync, Account Aggregator) live in
[SEQUENCE_DIAGRAMS.md](./SEQUENCE_DIAGRAMS.md); this doc covers everything else.

Rather than one diagram per CRUD endpoint (they're identical), the **Generic CRUD**
pattern below covers all the simple feature routes; the remaining diagrams are the
genuinely multi‑party flows.

---

## Roles & permission model

Four roles (`customer` is normalised to `user`): **user · advisor · manager · admin**.
Enforcement layers (in `middleware/`): `authMiddleware` (JWT, role from DB snapshot) →
`pinGate` (PIN unlock) → `requireRole` / `requireFeature` / `requireApproved` (RBAC) →
`ownerOnly` (resource ownership) → `auditLog`.

```mermaid
flowchart LR
  user["user (customer)"] --> advisor
  advisor["advisor (requires isApproved)"] --> manager
  manager --> admin
  classDef r fill:#eef,stroke:#88a;
  class user,advisor,manager,admin r;
```

| Capability | user | advisor | manager | admin |
|---|:--:|:--:|:--:|:--:|
| Own finances (accounts/transactions/budgets/goals/loans/investments/gold) | ✅ | ✅ | ✅ | ✅ |
| Book an advisor (`bookAdvisor`) | ✅ | — | — | — |
| Manage availability / accept bookings (`requireApproved`) | — | ✅ | — | — |
| Approve/reject advisor applications | — | — | ✅ | ✅ |
| User management (role / suspend / delete) | — | — | — | ✅ |
| Platform settings & feature flags | — | — | — | ✅ |
| AI intelligence dashboards | — | — | — | ✅ |

---

## Generic CRUD (covers accounts · transactions · investments · loans · goals · budgets · recurring · tax · gold · settings)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant BE as Backend /feature
  participant R as Redis / memory
  participant DB as Postgres
  C->>BE: GET/POST/PUT/DELETE /feature  (Bearer JWT)
  BE->>BE: authMiddleware — verify JWT, role from DB snapshot
  BE->>R: idle-session check
  BE->>R: pinGate — evaluatePinUnlock (financial routes)
  alt idle or not PIN-unlocked
    BE-->>C: 401 SESSION_IDLE_TIMEOUT  /  403 PIN_VERIFICATION_REQUIRED
  else allowed
    BE->>BE: requireFeature/requireRole + zod validate + idempotency (writes)
    BE->>DB: Prisma — scoped to userId (balance recompute on transactions)
    BE-->>C: 200 {success, data}
  end
```

---

## USER — registration & onboarding

```mermaid
sequenceDiagram
  autonumber
  actor U as New user
  participant C as Client
  participant BE as Backend /auth
  participant DB as Postgres
  U->>C: name, email, password, mobile
  C->>BE: POST /auth/register
  BE->>DB: assert email + phone unique
  BE->>BE: bcrypt.hash(password) · role=user · status=verified
  BE->>DB: create User + sync PII to profiles
  BE->>BE: generateTokens (HS256)
  BE-->>C: 201 {user} + Authorization / x-refresh-token / refresh cookie
  C->>C: store JWT · dispatch KANAKU_AUTH_CHANGE
  Note over C: onboarding wizard (country / currency / income)
  C->>BE: PUT /auth/profile · PUT /settings
  C->>BE: POST /pin/create  (sets PIN, establishes unlock)
  Note over C: → dashboard
```

---

## USER — receipt scan → OCR → transaction (async job)

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client
  participant BE as Backend /receipts
  participant W as OCR worker
  participant AI as OCR / AI engine
  participant DB as Postgres
  U->>C: upload bill photo
  C->>BE: POST /receipts/start  (multipart, Bearer JWT)
  BE->>BE: requireFeature(transactions) + requireAIFeature(ocrEngine)
  BE->>W: enqueue OCR job
  BE-->>C: 202 {jobId}
  W->>AI: OCR + extract merchant / amount / date / category
  AI-->>W: structured result
  W->>DB: persist AiScan
  loop poll
    C->>BE: GET /receipts/status/{jobId}
    BE-->>C: {status, data}
  end
  C->>C: prefill Add-Transaction with extracted fields
  U->>C: confirm
  C->>BE: POST /transactions  (create + recompute balance)
```

---

## USER ↔ USER — group expense & collaboration invite

Invites use the unified `CollaborationParticipant` model; acceptance is **implicit** —
a pending invite keyed by email/phone is linked when that person registers or logs in
(`invitation.service.linkPendingInvitationsForUser`).

```mermaid
sequenceDiagram
  autonumber
  actor A as User A owner
  participant CA as Client A
  participant BE as Backend
  participant Q as Email queue
  participant DB as Postgres
  actor B as User B invitee
  participant CB as Client B
  A->>CA: create group + add members by email/phone
  CA->>BE: POST /groups {members, items}
  BE->>DB: create GroupExpense + pending CollaborationParticipant per invitee
  BE->>Q: enqueue invite email + push
  BE-->>CA: 201 group created
  Note over B,CB: B registers / logs in — email matches a pending invite
  CB->>BE: POST /auth/register or /auth/login
  BE->>DB: linkPendingInvitationsForUser binds the invite to B.userId
  CB->>BE: GET /collaborations
  Note over A,B: shared expense visible to both, then settle-up
```

---

## USER → ADVISOR (applicant) → MANAGER/ADMIN — advisor application & approval

```mermaid
sequenceDiagram
  autonumber
  actor U as User (applicant)
  participant C as Client
  participant BE as Backend /advisors
  participant S as Supabase Storage
  participant DB as Postgres
  participant Q as Notif queue
  actor M as Manager / Admin
  participant CM as Admin console
  U->>C: apply — PAN / Aadhaar / cert docs + bio + expertise
  C->>BE: POST /advisors/apply  (multipart)
  BE->>S: store KYC documents
  BE->>DB: AdvisorApplication(pending) · User.role=advisor · isApproved=false
  BE->>Q: notify admins — review required
  BE-->>C: 201 applied
  CM->>BE: GET /advisors/admin/applications  (requireRole admin|manager)
  BE-->>CM: pending applications
  alt approve
    CM->>BE: PUT /advisors/admin/{id}/approve
    BE->>DB: isApproved=true · roleMode=advisor
  else reject
    CM->>BE: PUT /advisors/admin/{id}/reject {reason}
    BE->>DB: isApproved=false · role reverted to user
  end
  BE->>Q: notify applicant of decision
  BE-->>CM: 200
```

---

## USER ↔ ADVISOR — availability → booking → payment → session → rating

```mermaid
sequenceDiagram
  autonumber
  actor Adv as Advisor (approved)
  participant CA as Advisor app
  actor U as User (client)
  participant C as Client
  participant BE as Backend
  participant Pay as Payment provider
  participant DB as Postgres
  Adv->>CA: set availability slots
  CA->>BE: POST /advisors/availability  (requireApproved)
  U->>C: browse advisors, pick a slot
  C->>BE: GET /advisors  ·  POST /bookings  (requireFeature bookAdvisor)
  BE->>DB: BookingRequest(pending)
  BE-->>CA: notify advisor
  Adv->>CA: PUT /bookings/{id}/accept  (requireApproved)
  BE->>DB: accepted → AdvisorSession(scheduled)
  U->>C: pay session fee
  C->>BE: POST /payments/initiate
  BE->>Pay: create payment intent
  Pay-->>BE: POST /payments/webhook  (HMAC-signed) → completed
  BE->>DB: Payment completed · session confirmed
  Note over U,Adv: session via Socket.io chat (ChatMessage)
  U->>C: PUT /advisors/sessions/{id}/rate {rating, feedback}
  BE->>DB: AdvisorSession.rating · notify advisor
```

---

## ADMIN — user management

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant C as Admin console
  participant BE as Backend /admin
  participant DB as Postgres
  C->>BE: GET /admin/users  (requireRole admin)
  BE-->>C: users + activity
  alt change role
    C->>BE: POST /admin/users/{id}/role {role}
    BE->>DB: User.role updated · invalidate auth snapshot cache
  else suspend
    C->>BE: POST /admin/users/{id}/status {status: suspended}
    BE->>DB: User.status=suspended
    Note over BE: next request from that user → 403 ACCOUNT_SUSPENDED
  else delete
    C->>BE: DELETE /admin/users/{id}
    BE->>DB: cascade delete user data
  end
  BE-->>C: 200
```

---

## ADMIN — platform settings & feature flags

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant C as Admin console
  participant BE as Backend /admin
  participant DB as Postgres
  C->>BE: POST /admin/features/toggle {feature, enabled}
  BE->>DB: update PlatformSettings (singleton id=global)
  BE-->>C: 200
  C->>BE: POST /admin/ai-features/toggle {flag}
  BE->>DB: update AI feature flags
  Note over C: non-admins GET /admin/features → role-filtered view only
  C->>BE: GET /admin/ai/overview · /admin/stats · /admin/reports/revenue
  BE->>DB: aggregate platform analytics
  BE-->>C: dashboards
```

---

### Cross-cutting (all flows)
- **Auth + idle gate** run on every protected request; **pinGate** on financial routes.
- **RBAC**: `requireRole` (role), `requireFeature` (FEATURE_PERMISSIONS matrix),
  `requireApproved` (advisor must be approved), `ownerOnly` (resource ownership).
- **Audit**: `auditLog` / `withAudit` records access to `AuditLog` (userId, action,
  resource, status, ip).
- **Async work** (email, push, OCR, sync) runs through BullMQ workers on Redis.
- **Inbound webhooks** (Setu AA, payments) are HMAC-verified and sit *before* auth.
