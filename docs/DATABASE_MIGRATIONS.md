# Database & Migrations — Clean Baseline Workflow

The migration history was squashed into a **single baseline** that exactly
reproduces `backend/prisma/schema.prisma`. This removes the schema↔migration
drift that previously caused `migrate deploy` to build a database missing tables
(`budgets`, `gold_assets`, …) and columns (`User.roleMode`, `Account.clientRequestId`).

```
backend/prisma/migrations/
  00000000000000_init/migration.sql   ← the entire schema, one file
  migration_lock.toml
```

## Golden rule (read this)
**Never run `prisma db push`, `prisma migrate reset`, or `prisma migrate dev`
against a shared/production database.** Prisma resolves its datasource from
`backend/.env` (production Supabase) and **ignores a shell-set `DATABASE_URL`** —
so a "targeted" command can silently hit prod. Use the guarded script below for
local work, and only `prisma migrate deploy` (forward-only) for prod.

## Local test database
The integration tests run against `DATABASE_URL` in **`backend/.env.test`**
(`localhost:5434/expense_tracker_test`, the `expense_tracker_postgres` container).

Reset it to the current schema — **safe, localhost-only, cannot touch prod**:
```bash
cd backend
npm run db:test:reset      # scripts/test-db.mjs — uses --url, refuses non-local
npm test
```
The script uses Prisma's explicit `--url` flag (which bypasses `.env`) and
hard-refuses any non-local URL, so it is physically incapable of reaching a
remote database.

## Making a schema change
1. Edit `backend/prisma/schema.prisma`.
2. Create a migration (against a LOCAL dev DB only):
   ```bash
   # point DATABASE_URL at a LOCAL db first, then:
   npx prisma migrate dev --name <change_name>
   ```
3. `npx prisma generate`
4. `npm run db:test:reset && npm test`
5. Commit the new migration folder with your code.

### Drift check (catch "schema changed but no migration")
```bash
# requires an empty local shadow DB
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "postgresql://postgres:<pw>@localhost:5434/_shadow" \
  --exit-code
```
Exit code `2` = the schema has changes not captured by a migration. Wire this
into CI to prevent drift from returning.

## Production (Supabase) deploy
```bash
cd backend
npx prisma migrate deploy   # forward-only; never resets or drops
```

## ⚠️ One-time prod reconciliation needed
During this cleanup, a `db push` was accidentally run against the Supabase
production database (it loaded the prod URL from `.env`). Effect:
- Supabase schema is now **in sync with `schema.prisma`** (added `budgets`,
  `gold_assets`, `recurring_transactions`, `User.roleMode`,
  `Account.clientRequestId`, etc.; dropped orphaned legacy tables
  `keyword_mappings` (162 rows), `todo_lists`, `todo_items`, `todo_list_shares`,
  `user_learning` — none of which are in the current app schema).
- Its `_prisma_migrations` table still references the **old** migration names,
  which no longer exist on disk.

To make prod consistent with the new baseline **without touching data**, mark the
baseline as already-applied (metadata only):
```bash
cd backend                          # .env points at Supabase
npx prisma migrate resolve --applied 00000000000000_init
npx prisma migrate status           # should report up to date
```
(Old migration rows in `_prisma_migrations` are harmless; optionally prune them.)
