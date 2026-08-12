# Runbook — Baselining the production database for Prisma migrations

**Goal:** move production from `db push`-managed to migration-managed, so
`preDeployCommand` applies schema changes automatically instead of warning and
skipping.

**Risk:** low. `prisma migrate resolve --applied` writes rows to the
`_prisma_migrations` history table and executes **no schema DDL**. It cannot
alter, drop or migrate data. The dangerous command is `migrate deploy` on an
un-baselined database — which is exactly what `scripts/deploy-migrate.mjs`
refuses to do.

**Downtime:** none required. The commands are additive and the running service is
untouched. A short window is still worth booking so nobody deploys mid-way.

---

## 0. Before you start

You need `DIRECT_URL` for production — the **direct** Postgres URL, port 5432,
not the pooled `DATABASE_URL` on 6543. Migration commands must not go through
pgBouncer.

```bash
# From the repo root. Point at production explicitly; do not rely on .env.
export DIRECT_URL="postgresql://…@…:5432/…"
export DATABASE_URL="$DIRECT_URL"   # prisma migrate reads DATABASE_URL for the shadow check
```

---

## 1. Check the current state (read-only)

```bash
npm --prefix backend run db:status
```

Three possible outcomes:

| Output | Meaning | Next |
|---|---|---|
| `Database schema is up to date` | Already baselined | **Stop.** Nothing to do; automated migrations are live. |
| `P3005` / `database schema is not empty` | `db push`-managed, no history | Continue to step 2. |
| Connection error | Wrong URL or no network route | Fix connectivity. **Do not** proceed. |

---

## 2. Dry run

```bash
npm --prefix backend run db:baseline
```

Changes nothing. It lists the migrations on disk, re-checks status, and prints
the exact `migrate resolve` commands it *would* run. Read that list — it should
name every folder under `backend/prisma/migrations`, oldest first.

---

## 3. Apply the baseline

```bash
npm --prefix backend run db:baseline -- --apply
```

The script records each migration as already-applied, then re-runs
`migrate status` to confirm. It is idempotent: a migration that is already
recorded is skipped, so re-running after an interruption is safe.

Expected finish:

```
✓ Baseline complete. `npm run db:deploy` will now apply future migrations
  automatically on deploy instead of warning and skipping.
```

---

## 4. Verify

```bash
npm --prefix backend run db:status
# expect: Database schema is up to date
```

Then confirm the deploy path is healthy **without** deploying anything:

```bash
npm --prefix backend run db:deploy
# expect: "[deploy-migrate] Schema already up to date — nothing to apply."
```

---

## 5. Confirm on the next deploy

Push any change and watch the Render **preDeploy** log. You should now see
`Schema already up to date` instead of the P3005 warning. From this point a PR
that adds a migration applies it automatically, and a migration that fails
**aborts the deploy** so the previous version keeps serving.

---

## Rollback

Baselining only inserts history rows, so "rollback" means deleting them:

```sql
-- Only if you need to return to db push management.
DELETE FROM "_prisma_migrations";
```

The schema itself is never touched by any step in this runbook.

---

## Notes

- Do this **once per environment**. Staging and production each need their own
  baseline; CI provisions a fresh database with `db push` every run and needs
  none.
- After baselining, stop using `prisma db push` against that database — mixing
  the two is what produced the drift in the first place.
- `scripts/deploy-migrate.mjs` stays safe either way: it detects P3005 and exits
  0, so an un-baselined environment never blocks a deploy.
