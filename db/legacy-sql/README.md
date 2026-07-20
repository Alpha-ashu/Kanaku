# db/legacy-sql — Archived pre-Prisma SQL (READ-ONLY)

Hand-written SQL and schema helpers that predate the Prisma migration baseline.
Kept for archaeology only — **never run these against any environment.**

Source of truth for database schema, in order of authority:

1. `backend/prisma/schema.prisma` + `backend/prisma/migrations/` — the backend-owned
   schema (applied with `prisma migrate deploy`).
2. `db/supabase/migrations/` — Supabase-side concerns only: RLS policies, auth triggers,
   client-side (Dexie-sync) tables, and edge-function support. See `db/supabase/README.md`
   for how the two migration streams divide.

Anything you need from these files already exists in one of the two locations above.
