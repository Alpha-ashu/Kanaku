# Database Skill Reference  KANAKU

> Stack: PostgreSQL  Prisma ORM  Supabase (managed Postgres + Auth + RLS)

---

## 1. Architecture Overview

```
Frontend (Dexie  local SQLite)
          background sync
        
Backend (Express + Prisma)    PostgreSQL (hosted on Supabase)
        
         Supabase Auth service (separate JWT issuer)
```

- **Prisma** is the single source of truth for the DB schema.
- **Supabase** provides the hosted PostgreSQL instance and the Auth service.
- **Dexie** mirrors a subset of data locally for offline-first access.

---

## 2. Prisma Schema Conventions

File: `backend/prisma/schema.prisma`

### Naming
| Layer | Convention | Example |
|---|---|---|
| Model name | PascalCase singular | `Transaction`, `Account` |
| Field name | camelCase | `userId`, `createdAt` |
| DB column | snake_case via `@map` | `@map("user_id")` |
| DB table | snake_case via `@@map` | `@@map("transactions")` |

### Required fields on every model
```prisma
model Transaction {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  // ... domain fields
}
```

### Monetary amounts
- Store monetary values as `Decimal` (or integer cents)  **never** `Float`.
- Prisma type: `amount  Decimal @db.Decimal(12, 2)`

---

## 3. Migration Workflow

```powershell
# Create a new migration after editing schema.prisma
npx prisma migrate dev --name <descriptive_name>

# Apply migrations in production (CI/CD)
npx prisma migrate deploy

# Reset (DEV ONLY  destroys data)
npx prisma migrate reset

# Generate the Prisma client after schema changes
npx prisma generate
```

> Always run `npx prisma generate` after schema changes before starting the server.

### Migration naming convention
`<date>_<action>_<entity>` e.g. `20260509_add_syncStatus_to_transactions`

---

## 4. Supabase Integration

### Row-Level Security (RLS)
- RLS is enabled on all tables in Supabase.
- Backend bypasses RLS by using the **service role key** (`SUPABASE_SERVICE_KEY`)  never expose this to the frontend.
- Frontend Supabase client uses the **anon key** (`VITE_SUPABASE_ANON_KEY`) and operates under RLS.

### RLS Policy Pattern
```sql
-- Users can only read/write their own rows
CREATE POLICY "user_isolation" ON transactions
  USING (auth.uid() = user_id);
```

### Supabase Auth vs Custom JWT
- Supabase issues JWTs on sign-in (via `supabase.auth.signIn*`).
- The backend also supports a custom JWT (`JWT_SECRET`) for server-issued tokens.
- The `authenticate` middleware in `backend/src/middleware/auth.ts` checks both.

---

## 5. Connection & Pooling

```env
# Direct connection (migrations, prisma studio)
DATABASE_URL="postgresql://user:pass@host:5432/KANAKU"

# Pooled connection (app runtime via PgBouncer / Supabase pooler)
DATABASE_URL_POOLED="postgresql://user:pass@pooler.supabase.com:6543/KANAKU?pgbouncer=true"
```

- Use pooled URL in the Express app (`datasource db { url = env("DATABASE_URL") }`).
- Use the direct URL for `prisma migrate` and `prisma studio`.

---

## 6. Prisma Client Usage Patterns

### Singleton
```ts
// backend/src/db/prisma.ts
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
```
Import `prisma` from this file everywhere  never instantiate `PrismaClient` directly.

### Ownership Check (mandatory before any read/write)
```ts
const account = await prisma.account.findFirst({
  where: { id: accountId, userId: req.userId },
});
if (!account) throw AppError.notFound('Account');
```

### Transactions for Coupled Writes
```ts
const result = await prisma.$transaction(async (tx) => {
  const txn = await tx.transaction.create({ data: { ... } });
  await tx.account.update({
    where: { id: txn.accountId },
    data: { balance: { decrement: txn.amount } },
  });
  return txn;
});
```

### Soft Deletes
- Prefer soft delete (`deletedAt DateTime?`) over hard delete for financial records.
- Always filter `where: { deletedAt: null }` in queries.

---

## 7. Supabase Helpers

Supabase client for the frontend lives in `frontend/src/utils/supabase/client.ts`.

```ts
// Authenticated client (uses session cookie automatically)
import supabase from '@/utils/supabase/client';

// Storage upload example
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/avatar.jpg`, file, { upsert: true });
```

---

## 8. Seeding & Test Data

```powershell
# Run the seed script (defined in package.json prisma.seed)
npx prisma db seed
```

- Seed file: `backend/prisma/seed.ts`.
- Use `faker` for realistic mock data.
- Never seed production  guard with `if (process.env.NODE_ENV === 'development')`.

---

## 9. Prisma Studio (Local GUI)

```powershell
cd backend
npx prisma studio
```
Opens at `http://localhost:5555`. Use for quick local inspection  never in production.

---

## 10. Database Checklist

- [ ] Every new table has `id`, `userId`, `createdAt`, `updatedAt`.
- [ ] Monetary fields use `Decimal`, not `Float`.
- [ ] Migrations are created with `prisma migrate dev`, committed to git.
- [ ] RLS policies are defined in Supabase for every user-scoped table.
- [ ] Ownership checks exist before every read/write operation.
- [ ] Coupled balance + transaction writes use `prisma.$transaction`.
- [ ] **Decimal Casting**: Always wrap Prisma Decimal results in `Number()` before performing arithmetic in JavaScript logic to prevent `TS2365` errors.
- [ ] **Sync Consistency**: Use the `MIGRATION_V2_KEY` strategy for frontend brand migration to ensure data continuity during renaming.


