# Technical Requirement Document (TRD) — Kanaku

## 1. System Architecture
- **Frontend:** React 18 + TypeScript on Vite, packaged with Capacitor (web + Android).
- **Local store:** Dexie (IndexedDB) for offline-first data; Dexie Cloud for sync.
- **Backend:** Node.js / Express (TypeScript).
- **ORM/DB:** Prisma + PostgreSQL.
- **Identity:** Supabase (auth); backend issues a **custom JWT** for API authorization.

## 2. Modules
- **Authentication Service** — Supabase login → backend JWT issuance/validation.
- **Transaction Service** — server-authoritative monetary logic; atomic balance updates.
- **Dashboard/Insights Service** — aggregation, category analytics.
- **Receipt OCR Service** — image → parsed draft transaction.
- **Sync Service** — Dexie ↔ cloud delta sync, user-scoped, retry-on-failure.

## 3. API Example
```
POST /api/v1/auth/login
Request:
{
  "email": "user@email.com",
  "password": "123456"
}
Response:
{
  "token": "jwt_token",
  "user": { "id": "uuid", "email": "user@email.com" }
}
```

## 4. Security
- **AuthN:** Supabase identity; **AuthZ:** custom JWT, verified on every protected route.
- **RBAC / ownership:** enforce ownership checks before read/write.
- **Hardening:** Helmet + CORS allow-list + rate limiting.
- **Validation:** zod middleware on params/query/body for all `/api/v1` routes.
- **Secrets:** environment variables only; never hardcoded.

## 5. Data Integrity
- Monetary logic is server-authoritative.
- Coupled balance updates + transaction creation run inside a single DB transaction.
- Sync operations are idempotent to avoid duplicates.

## 6. Type Safety
- No `any` in new code; explicit interfaces, zod schemas, typed DTOs.

## 7. Non-functional
- Versioned API under `/api/v1`.
- Stateless services; horizontal scaling friendly.
- Observability: structured logging, health checks.

