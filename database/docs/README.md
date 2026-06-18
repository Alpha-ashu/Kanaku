# database/

Database visibility for KANAKU (PostgreSQL via Prisma + Supabase).

## Source of truth & layout

| Concern | Location |
|---|---|
| **Schema (source of truth)** | [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) (48 models) |
| **Schema catalog (browsable)** | [`docs/SCHEMA.md`](./docs/SCHEMA.md) — generated |
| **Migrations (Prisma)** | [`backend/prisma/migrations/`](../backend/prisma/migrations/) |
| **Migrations / functions (Supabase)** | [`supabase/migrations/`](../supabase/migrations/), [`supabase/functions/`](../supabase/functions/) |
| **Legacy SQL** | `init.sql`, `ai_schema.sql`, `supabase_schema.sql`, `models.js` (here) |

## §4 mapping

| §4 concept | Where |
|---|---|
| schemas/ | Prisma models → `docs/SCHEMA.md` (per-model tables, columns, relations, indexes) |
| migrations/ | `backend/prisma/migrations/`, `supabase/migrations/` |
| functions/ / triggers/ | `supabase/functions/`; triggers in SQL migrations (e.g. balance trigger on Account) |
| policies/ (RLS) | Supabase RLS — see [[security]] / Phase 8 Supabase review |
| seeds/ | `backend/scripts/seed-*.cjs` |
| docs/ | `docs/SCHEMA.md` (this catalog) |

**Gap:** RLS policies and DB functions/triggers are not yet centrally documented here — covered in the Phase 8 Supabase review.
