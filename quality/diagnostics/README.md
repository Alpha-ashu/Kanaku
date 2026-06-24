# Quality · Diagnostics

Relocated dev/DB **probe scripts** — ad-hoc connection and reset utilities named
`test-*`. These are **not** part of any Jest/Vitest/Playwright suite; they're run by
hand (or, for `test-db.mjs`, via an npm script). Moved here so no `test-*` files are
left scattered across `backend/` and `frontend/`.

## backend/

| Script | Purpose | Run |
|---|---|---|
| `test-db.mjs` | Safe **local** test-DB reset to the schema baseline (refuses non-local URLs). Wired as `db:test:reset`. | `npm --prefix backend run db:test:reset` |
| `test-db.js` | Quick Prisma client connectivity probe. | `node quality/diagnostics/backend/test-db.js` |
| `test-conn.js` | Raw `pg` connection probe (uses `DATABASE_URL`). | `node quality/diagnostics/backend/test-conn.js` |
| `test-connection.ts` | Supabase client reachability check. | `npx ts-node quality/diagnostics/backend/test-connection.ts` |
| `test-prisma.ts` | Prisma query smoke probe. | `npx ts-node quality/diagnostics/backend/test-prisma.ts` |
| `test-admin-login.js` | Local sqlite admin-login bcrypt check (legacy). | `node quality/diagnostics/backend/test-admin-login.js` |

## frontend/

| Script | Purpose |
|---|---|
| `test-connection.ts` | Supabase client reachability check (frontend). |

Their `import`s reach back into `backend/src` / `frontend/src` (e.g.
`../../../backend/src/db/prisma`). `test-db.mjs` resolves the backend package
explicitly (`dirname/../../../backend`); if you move these again, fix those paths.
