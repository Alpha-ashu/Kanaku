# Manager‑Role Feature Flows

A **manager** shares the advisor‑vetting capability with admins (`requireRole(['admin','manager'])`)
but not full user‑administration. Managers also retain personal‑finance features.
The manager‑specific flow is the advisor verification queue.

---

## 1. Advisor verification queue

```mermaid
sequenceDiagram
  autonumber
  actor M as Manager
  participant C as Manager console
  participant BE as Backend /advisors
  participant S as Supabase Storage
  participant DB as Postgres
  M->>C: open advisor verification
  C->>BE: GET /advisors/admin/applications (requireRole admin or manager)
  BE->>DB: list AdvisorApplication where status=pending
  BE-->>C: {applications}
  M->>C: open one application
  C->>BE: GET /advisors/application/:id/document/:docType
  BE->>S: signed URL for KYC doc
  BE-->>C: document (PAN/Aadhaar/cert) for review
```

## 2. Approve / reject an advisor

```mermaid
sequenceDiagram
  autonumber
  actor M as Manager
  participant C as Manager console
  participant BE as Backend /advisors
  participant Q as Notif queue
  participant DB as Postgres
  alt approve
    C->>BE: PUT /advisors/admin/:id/approve (requireRole admin or manager)
    BE->>DB: User.isApproved=true · role=advisor · roleMode=advisor
  else reject
    C->>BE: PUT /advisors/admin/:id/reject {reason}
    BE->>DB: User.isApproved=false · role reverted to user · store reason
  end
  BE->>Q: notify applicant of the decision
  BE-->>C: 200
```

## 3. Role switch (manager workspace)

```mermaid
sequenceDiagram
  autonumber
  participant C as Manager console
  participant BE as Backend /advisors
  participant DB as Postgres
  C->>BE: PUT /advisors/role-mode {mode} (requireRole advisor, admin, manager)
  BE->>DB: update roleMode
  BE-->>C: 200 (switch between management view and personal finance view)
```

> Note: managers do **not** have `/admin/*` user‑management, platform‑settings, or
> AI‑intelligence routes — those require `requireRole('admin')`. See ADMIN_FLOWS.md.
