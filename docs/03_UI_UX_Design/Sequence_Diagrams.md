# Sequence Diagrams — UI/UX

## Login Flow (text)
User → UI → Backend → DB
1. User enters credentials.
2. UI sends request to backend (`POST /api/v1/auth/login`).
3. Backend validates with Supabase / DB.
4. Backend returns JWT.
5. UI stores session and redirects to Dashboard.

## Login Flow (Mermaid)
```mermaid
sequenceDiagram
    actor User
    participant UI
    participant API as Express /api/v1
    participant Auth as Supabase
    participant DB as PostgreSQL
    User->>UI: Enter email + password
    UI->>API: POST /auth/login
    API->>Auth: Verify identity
    Auth-->>API: OK
    API->>DB: Load profile
    DB-->>API: Profile
    API-->>UI: { token, user }
    UI-->>User: Redirect to Dashboard
```

## Add Expense (offline-first, Mermaid)
```mermaid
sequenceDiagram
    actor User
    participant UI
    participant Dexie
    participant API
    participant DB
    User->>UI: Submit expense
    UI->>Dexie: Write (sync pending)
    Dexie-->>UI: Saved locally
    UI-->>User: Show instantly
    Note over UI,API: When online
    UI->>API: POST /transactions (JWT)
    API->>DB: TX{ insert + balance update }
    DB-->>API: Committed
    API-->>UI: { balanceAfter }
    UI->>Dexie: Mark synced
```

