# Advisor‑Role Feature Flows

An advisor is a `user` who applied and was **approved** (`isApproved=true`).
Advisor‑only routes are guarded by `requireRole('advisor')` + `requireApproved`.
Advisors also keep all personal‑finance features (see USER_FLOWS.md); below are the
advisor‑specific ones.

---

## 1. Become an advisor (application)

```mermaid
sequenceDiagram
  autonumber
  actor A as User (applicant)
  participant C as Client
  participant BE as Backend /advisors
  participant S as Supabase Storage
  participant Q as Notif queue
  participant DB as Postgres
  A->>C: fill bio, expertise, experience, upload PAN/Aadhaar/cert
  C->>BE: POST /advisors/apply (multipart)
  BE->>S: store KYC documents
  BE->>DB: AdvisorApplication (pending) · role=advisor · isApproved=false
  BE->>Q: notify admins/managers
  BE-->>C: 201 submitted
  C->>BE: GET /advisors/application/my (check status)
  BE-->>C: {status: pending/approved/rejected}
```

## 2. Online status & role mode

```mermaid
sequenceDiagram
  autonumber
  participant C as Advisor app
  participant BE as Backend /advisors
  participant DB as Postgres
  C->>BE: PUT /advisors/online-status {online} (requireRole advisor + approved)
  BE->>DB: update advisorStatus
  C->>BE: PUT /advisors/role-mode {mode: user|advisor}
  BE->>DB: update roleMode (toggle personal vs advisor workspace)
  BE-->>C: 200
```

## 3. Manage availability

```mermaid
sequenceDiagram
  autonumber
  participant C as Advisor app
  participant BE as Backend /advisors
  participant DB as Postgres
  C->>BE: POST /advisors/availability {slots} (requireApproved)
  BE->>DB: insert AdvisorAvailability rows
  C->>BE: PUT /advisors/availability/status {available}
  BE->>DB: toggle slot availability
  C->>BE: DELETE /advisors/availability/:id
  BE->>DB: remove slot
  BE-->>C: 200
  Note over C,BE: clients read these via GET /advisors/:id/availability
```

## 4. Incoming bookings

```mermaid
sequenceDiagram
  autonumber
  actor U as Client (user)
  participant BE as Backend /bookings
  participant CA as Advisor app
  participant DB as Postgres
  U->>BE: POST /bookings {advisorId, slot}
  BE->>DB: BookingRequest (pending)
  BE-->>CA: notify advisor
  CA->>BE: GET /bookings (advisor sees their requests)
  alt accept
    CA->>BE: PUT /bookings/:id/accept (requireApproved)
    BE->>DB: accepted → AdvisorSession (scheduled)
  else reject
    CA->>BE: PUT /bookings/:id/reject
  else reschedule
    CA->>BE: PUT /bookings/:id/reschedule {newSlot}
  end
  BE-->>U: notify client of decision
```

## 5. Advisor workspace & sessions

```mermaid
sequenceDiagram
  autonumber
  participant CA as Advisor app
  participant BE as Backend
  participant WS as Socket.io
  participant DB as Postgres
  CA->>BE: GET /bookings/workspace/clients (requireApproved)
  BE->>DB: list distinct clients + sessions
  BE-->>CA: {clients, upcoming sessions}
  CA->>BE: GET /advisors/me/sessions
  BE-->>CA: advisor's sessions (incl. client phone enrichment)
  Note over CA,WS: live consult — chat
  CA->>WS: connect (deviceId + JWT)
  CA->>WS: ChatMessage to client session
  WS-->>CA: client messages (persisted to ChatMessage)
```

## 6. Session fee & rating

```mermaid
sequenceDiagram
  autonumber
  participant CA as Advisor app
  actor U as Client
  participant BE as Backend
  participant DB as Postgres
  Note over U,BE: client pays via /payments (see Book Advisor)
  CA->>BE: POST /bookings/:bookingId/fee/pay (requireApproved)
  BE->>DB: mark session fee paid · Payment linked
  BE-->>CA: 200
  U->>BE: PUT /advisors/sessions/:id/rate {rating, feedback}
  BE->>DB: AdvisorSession.rating + feedback
  BE-->>CA: notify advisor of new rating
```
