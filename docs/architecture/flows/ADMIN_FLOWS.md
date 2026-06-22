# Admin‑Role Feature Flows

All `/admin/*` routes require `requireRole('admin')` (the two feature‑flag *read*
endpoints are open to any authenticated user but return a role‑filtered view).
Admins also have advisor‑vetting (shared with managers) and all user features.

---

## 1. User management

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant C as Admin console
  participant BE as Backend /admin
  participant DB as Postgres
  C->>BE: GET /admin/users (requireRole admin)
  BE->>DB: list users + profiles + status
  BE-->>C: {users}
  C->>BE: GET /admin/users/activity
  BE-->>C: recent activity / audit
  alt change role
    C->>BE: POST /admin/users/:userId/role {role}
    BE->>DB: update User.role · invalidate auth snapshot cache
  else suspend / reactivate
    C->>BE: POST /admin/users/:userId/status {status}
    BE->>DB: User.status=suspended
    Note over BE: that user's next request → 403 ACCOUNT_SUSPENDED
  else delete
    C->>BE: DELETE /admin/users/:userId
    BE->>DB: cascade delete user data
  end
  C->>BE: GET /admin/users/:userId/storage
  BE-->>C: per-user storage stats
```

## 2. Advisor approval (admin path)

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant C as Admin console
  participant BE as Backend /admin
  participant Q as Notif queue
  participant DB as Postgres
  C->>BE: GET /admin/users/pending (requireRole admin)
  BE->>DB: AdvisorApplication where pending
  BE-->>C: {pendingAdvisors}
  alt approve
    C->>BE: POST /admin/users/:advisorId/approve
    BE->>DB: isApproved=true · role=advisor
  else reject
    C->>BE: POST /admin/users/:advisorId/reject {reason}
    BE->>DB: revert to user · store reason
  end
  BE->>Q: notify applicant
  BE-->>C: 200
```

## 3. Platform statistics & cache metrics

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant C as Admin console
  participant BE as Backend /admin
  participant R as Redis
  participant DB as Postgres
  C->>BE: GET /admin/stats (requireRole admin)
  BE->>DB: aggregate users, advisors, revenue, growth
  BE-->>C: {platformStats}
  C->>BE: GET /admin/cache/metrics
  BE->>R: read cache hit/miss/store counters
  BE-->>C: {cacheMetrics by prefix, hitRate}
```

## 4. Feature flags

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant C as Admin console
  participant BE as Backend /admin
  participant DB as Postgres (PlatformSettings)
  Note over C,BE: GET /admin/features is open — non-admins get a role-filtered view
  C->>BE: GET /admin/features · GET /admin/ai-features
  BE->>DB: read PlatformSettings (singleton id=global)
  BE-->>C: feature + AI-feature matrix
  C->>BE: POST /admin/features/toggle {feature, enabled} (requireRole admin)
  BE->>DB: update PlatformSettings
  C->>BE: POST /admin/ai-features/toggle {flag}
  BE->>DB: update AI feature flags
  BE-->>C: 200 (takes effect platform-wide)
```

## 5. Reports

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant C as Admin console
  participant BE as Backend /admin
  participant DB as Postgres
  C->>BE: GET /admin/reports/users (requireRole admin)
  BE->>DB: cohort / signup / retention aggregation
  BE-->>C: users report
  C->>BE: GET /admin/reports/revenue
  BE->>DB: payments + session-fee aggregation
  BE-->>C: revenue report (export-ready)
```

## 6. AI intelligence console

```mermaid
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant C as Admin console
  participant BE as Backend /admin/ai
  participant Eng as AI pipeline
  participant DB as Postgres
  C->>BE: GET /admin/ai/overview (requireRole admin)
  BE->>DB: load ai_events, ai_insights, model runs
  BE-->>C: usage + accuracy overview
  C->>BE: GET /admin/ai/users · /insights · /patterns · /accuracy
  BE-->>C: per-user features, insights, spend patterns, model accuracy
  C->>BE: GET /admin/ai/raw/:userId
  BE-->>C: raw feature vector for a user
  C->>BE: POST /admin/ai/run/features · /run/predictions {scope}
  BE->>Eng: trigger feature refresh / prediction batch
  Eng->>DB: write user_features / ai_insights
  BE-->>C: run accepted
  C->>BE: GET /admin/ai/config · POST /admin/ai/config {model, thresholds}
  BE->>DB: update AI configuration
```
